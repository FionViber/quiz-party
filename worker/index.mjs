import { DurableObject } from 'cloudflare:workers';
import {
  adminKeyId,
  bearer,
  digest,
  error,
  randomId,
  readJson,
  signToken,
  verifyAdminProof,
  verifyToken
} from './auth.mjs';
import { metadata, boardPlan, replacementPlan } from './catalog.mjs';
import * as Engine from './room-engine.mjs';

const json = (value, status = 200) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
const clone = (value) => structuredClone(value);
const SESSION_SECONDS = 86400;
function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  return !origin || allowed.includes(origin);
}
function cors(response, request, env) {
  const origin = request.headers.get('Origin');
  const headers = new Headers(response.headers);
  if (origin && allowedOrigin(request, env)) headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(response.body, { status: response.status, headers });
}
async function gate(env, path, data) {
  const result = await env.GATE.getByName('access-v1').fetch(
    new Request('https://internal/' + path, { method: 'POST', body: JSON.stringify(data) })
  );
  const value = await result.json();
  if (!result.ok) throw error(value.code, result.status);
  return value;
}
async function roomCall(env, id, path, data) {
  const result = await env.ROOMS.getByName(id).fetch(
    new Request('https://internal/' + path, { method: 'POST', body: JSON.stringify(data) })
  );
  const value = await result.json();
  if (!result.ok) throw error(value.code, result.status);
  return value;
}
async function requireToken(request, env, type) {
  const claims = await verifyToken(env.TOKEN_SECRET, bearer(request), type);
  if (!claims) throw error('UNAUTHORIZED', 401);
  if (type === 'admin' && claims.keyId !== (await adminKeyId(env.ADMIN_PUBLIC_JWK || '')))
    throw error('UNAUTHORIZED', 401);
  return claims;
}
async function rate(request, env, type, limit, windowMs) {
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  await gate(env, 'rate', { key: type + ':' + (await digest(ip)), limit, windowMs });
}
async function session(env, roomId, code, actorId, isHost = false) {
  return {
    roomId,
    code,
    actorId,
    isHost,
    token: await signToken(
      env.TOKEN_SECRET,
      { typ: 'room', sub: actorId, roomId, host: isHost },
      SESSION_SECONDS
    )
  };
}
async function reserveCode(env, roomId) {
  const existing = await env.DB.prepare('SELECT code,expires_at FROM room_codes WHERE room_id=?')
    .bind(roomId)
    .first();
  if (existing) {
    if (existing.expires_at <= Date.now()) throw error('ROOM_EXPIRED', 410);
    return existing.code;
  }
  for (let attempt = 0; attempt < 20; attempt++) {
    const words = new Uint32Array(1);
    crypto.getRandomValues(words);
    const code = String(100000 + (words[0] % 900000)),
      expires = Date.now() + SESSION_SECONDS * 1000;
    let row;
    try {
      row = await env.DB.prepare(
        'INSERT INTO room_codes(code,room_id,expires_at) VALUES(?,?,?) ON CONFLICT(code) DO UPDATE SET room_id=excluded.room_id,expires_at=excluded.expires_at WHERE room_codes.expires_at < ? RETURNING code'
      )
        .bind(code, roomId, expires, Date.now())
        .first();
    } catch (e) {
      const retry = await env.DB.prepare(
        'SELECT code FROM room_codes WHERE room_id=? AND expires_at>?'
      )
        .bind(roomId, Date.now())
        .first();
      if (retry) return retry.code;
      throw e;
    }
    if (row) return code;
  }
  throw error('ROOM_CODES_BUSY', 503);
}
export default {
  async fetch(request, env) {
    try {
      if (!allowedOrigin(request, env)) return json({ code: 'ORIGIN_NOT_ALLOWED' }, 403);
      if (request.method === 'OPTIONS')
        return cors(
          new Response(null, {
            status: 204,
            headers: {
              'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
              'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Admin-Token',
              'Access-Control-Max-Age': '600'
            }
          }),
          request,
          env
        );
      const url = new URL(request.url),
        path = url.pathname;
      let response;
      if (request.method === 'GET' && path === '/api/meta') {
        const catalog = await metadata(env.DB);
        response = json({
          protocol: 2,
          categories: catalog.categories,
          bankFingerprint: catalog.packIdentity.fingerprint,
          configured: !!env.ADMIN_PUBLIC_JWK && !!env.TOKEN_SECRET
        });
      } else if (request.method === 'GET' && path === '/api/admin/challenge') {
        await rate(request, env, 'challenge', 10, 60000);
        if (!env.ADMIN_PUBLIC_JWK || !env.TOKEN_SECRET) throw error('SERVICE_NOT_CONFIGURED', 503);
        response = json(
          await gate(env, 'challenge', { origin: request.headers.get('Origin') || '' })
        );
      } else if (request.method === 'POST' && path === '/api/admin/session') {
        await rate(request, env, 'admin-proof', 10, 60000);
        const body = await readJson(request);
        if (typeof body.nonce !== 'string' || typeof body.signature !== 'string')
          throw error('INVALID_REQUEST');
        const challenge = await gate(env, 'read-challenge', {
          nonce: body.nonce,
          origin: request.headers.get('Origin') || ''
        });
        if (!(await verifyAdminProof(env.ADMIN_PUBLIC_JWK, challenge.message, body.signature)))
          throw error('UNAUTHORIZED', 401);
        await gate(env, 'consume-challenge', { nonce: body.nonce });
        response = json({
          adminToken: await signToken(
            env.TOKEN_SECRET,
            { typ: 'admin', sub: randomId(), keyId: await adminKeyId(env.ADMIN_PUBLIC_JWK) },
            28800
          )
        });
      } else if (request.method === 'POST' && path === '/api/rooms') {
        await requireToken(request, env, 'admin');
        await rate(request, env, 'create', 20, 3600000);
        const body = await readJson(request);
        if (
          typeof body.name !== 'string' ||
          !body.name.trim() ||
          typeof body.hostPlays !== 'boolean'
        )
          throw error('INVALID_REQUEST');
        const requestId = body.requestId || randomId();
        if (typeof requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(requestId))
          throw error('INVALID_REQUEST');
        const id = 'room-' + (await digest(requestId)),
          hostId = 'host-' + (await digest('host:' + requestId)),
          code = await reserveCode(env, id);
        await roomCall(env, id, 'create', {
          id,
          code,
          hostId,
          hostName: body.name,
          hostPlays: body.hostPlays,
          settings: body.settings,
          now: Date.now()
        });
        response = json(await session(env, id, code, hostId, true), 201);
      } else if (request.method === 'POST' && /^\/api\/rooms\/[0-9]{6}\/join$/.test(path)) {
        await rate(request, env, 'join', 100, 60000);
        const code = path.split('/')[3],
          body = await readJson(request);
        if (typeof body.name !== 'string' || !body.name.trim()) throw error('INVALID_REQUEST');
        const found = await env.DB.prepare(
          'SELECT room_id FROM room_codes WHERE code=? AND expires_at>?'
        )
          .bind(code, Date.now())
          .first();
        if (!found) throw error('ROOM_NOT_FOUND', 404);
        const requestId = body.requestId || randomId();
        if (typeof requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(requestId))
          throw error('INVALID_REQUEST');
        const id = randomId(),
          joined = await roomCall(env, found.room_id, 'join', { id, name: body.name, requestId });
        response = json(await session(env, found.room_id, code, joined.actorId), 201);
      } else if (request.method === 'POST' && path === '/api/socket-ticket') {
        const claims = await requireToken(request, env, 'room');
        await rate(request, env, 'ticket', 400, 60000);
        if (claims.host) {
          const admin = await verifyToken(
            env.TOKEN_SECRET,
            request.headers.get('X-Admin-Token'),
            'admin'
          );
          if (!admin || admin.keyId !== (await adminKeyId(env.ADMIN_PUBLIC_JWK || '')))
            throw error('ADMIN_REQUIRED', 401);
        }
        const jti = randomId(),
          expiresAt = Date.now() + 60000;
        await roomCall(env, claims.roomId, 'ticket', { jti, actorId: claims.sub, expiresAt });
        response = json({
          ticket: await signToken(
            env.TOKEN_SECRET,
            {
              typ: 'socket',
              sub: claims.sub,
              roomId: claims.roomId,
              ticketId: jti,
              sessionExp: claims.exp
            },
            60
          )
        });
      } else if (request.method === 'GET' && /^\/api\/rooms\/[^/]+\/socket$/.test(path)) {
        const roomId = path.split('/')[3],
          claims = await verifyToken(env.TOKEN_SECRET, url.searchParams.get('ticket'), 'socket');
        if (
          !claims ||
          claims.roomId !== roomId ||
          !Number.isFinite(claims.sessionExp) ||
          claims.sessionExp <= Date.now()
        )
          throw error('UNAUTHORIZED', 401);
        if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
          throw error('WEBSOCKET_REQUIRED', 426);
        return env.ROOMS.getByName(roomId).fetch(
          new Request('https://internal/connect', {
            headers: {
              Upgrade: 'websocket',
              'X-Actor': claims.sub,
              'X-Ticket': claims.ticketId,
              'X-Session-Expires': String(claims.sessionExp)
            }
          })
        );
      } else response = json({ code: 'NOT_FOUND' }, 404);
      return cors(response, request, env);
    } catch (e) {
      const code = e.code || 'SERVICE_UNAVAILABLE';
      return cors(json({ code }, e.status || 503), request, env);
    }
  }
};

export class AccessGate extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
  }
  async fetch(request) {
    try {
      const data = await request.json(),
        path = new URL(request.url).pathname,
        now = Date.now();
      const result = await this.ctx.storage.transaction(async (storage) => {
        if (path === '/rate') {
          const key = 'rate:' + data.key + ':' + Math.floor(now / data.windowMs);
          const record = (await storage.get(key)) || {
            count: 0,
            expiresAt: now + data.windowMs * 2
          };
          if (record.count >= data.limit) throw error('RATE_LIMITED', 429);
          record.count++;
          await storage.put(key, record);
          return { ok: true };
        }
        if (path === '/challenge') {
          const nonce = randomId(),
            expiresAt = now + 60000;
          const challenge = {
            nonce,
            expiresAt,
            origin: data.origin,
            message:
              'Quiz Party administrator proof v1\n' + nonce + '\n' + expiresAt + '\n' + data.origin
          };
          await storage.put('challenge:' + nonce, challenge);
          return challenge;
        }
        if (path === '/read-challenge' || path === '/consume-challenge') {
          const record = await storage.get('challenge:' + data.nonce);
          if (!record || record.expiresAt <= now) throw error('CHALLENGE_EXPIRED', 401);
          if (path === '/read-challenge') {
            if (record.origin !== data.origin) throw error('UNAUTHORIZED', 401);
            return record;
          }
          await storage.delete('challenge:' + data.nonce);
          return { ok: true };
        }
        throw error('NOT_FOUND', 404);
      });
      if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(now + 3600000);
      return json(result);
    } catch (e) {
      return json({ code: e.code || 'SERVICE_UNAVAILABLE' }, e.status || 503);
    }
  }
  async alarm() {
    const records = await this.ctx.storage.list(),
      now = Date.now();
    for (const [key, value] of records)
      if (value.expiresAt <= now) await this.ctx.storage.delete(key);
    if ([...records.values()].some((x) => x.expiresAt > now))
      await this.ctx.storage.setAlarm(now + 3600000);
  }
}

export class QuizRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.room = null;
    this.queue = Promise.resolve();
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get('room')) || null;
    });
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }
  exclusive(work) {
    const result = this.queue.then(work, work);
    this.queue = result.catch(() => {});
    return result;
  }
  expiresAt() {
    return this.room?.finishedAt
      ? this.room.finishedAt + 86400000
      : (this.room?.lastActivityAt || Date.now()) + 7200000;
  }
  async save(next) {
    const due = Engine.nextDeadline(next),
      expiry = next.finishedAt ? next.finishedAt + 86400000 : next.lastActivityAt + 7200000;
    await this.ctx.storage.transaction(async (storage) => {
      await storage.put('room', next);
      await storage.setAlarm(Math.max(Date.now() + 1, Math.min(due || Infinity, expiry)));
    });
    this.room = next;
  }
  async expire() {
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(JSON.stringify({ type: 'error', code: 'ROOM_EXPIRED' }));
        socket.close(1000, 'Room expired');
      } catch {}
    }
    const id = this.room?.id;
    this.room = null;
    await this.ctx.storage.deleteAll();
    await this.ctx.storage.deleteAlarm();
    if (id)
      await this.env.DB.prepare('DELETE FROM room_codes WHERE room_id=?')
        .bind(id)
        .run()
        .catch(() => {});
  }
  assertRoom() {
    if (!this.room) throw error('ROOM_NOT_FOUND', 404);
    if (this.expiresAt() <= Date.now()) throw error('ROOM_EXPIRED', 410);
    if (this.room.rulesVersion !== 2) throw error('ROOM_VERSION_UNSUPPORTED', 409);
  }
  async advance() {
    if (!this.room) return false;
    if (this.room.rulesVersion !== 2) throw error('ROOM_VERSION_UNSUPPORTED', 409);
    if (this.expiresAt() <= Date.now()) {
      if (this.room.startedAt && this.room.phase !== 'finished') {
        const ended = clone(this.room);
        Engine.finishInactive(ended, Date.now());
        await this.save(ended);
        this.broadcast();
      } else await this.expire();
      return true;
    }
    const next = clone(this.room);
    Engine.tick(next, Date.now());
    if (JSON.stringify(next) !== JSON.stringify(this.room)) {
      await this.save(next);
      this.broadcast();
      return true;
    }
    return false;
  }
  send(socket, value) {
    try {
      socket.send(JSON.stringify(value));
    } catch {}
  }
  broadcast() {
    if (!this.room) return;
    for (const socket of this.ctx.getWebSockets()) {
      const who = socket.deserializeAttachment();
      if (who && this.room.players[who.actorId]) {
        const historyStamp = this.room.history.length + ':' + (this.room.history.at(-1)?.id || '');
        const includeHistory = who.historyStamp !== historyStamp;
        this.send(socket, {
          type: 'snapshot',
          historyUnchanged: !includeHistory,
          state: Engine.snapshot(this.room, who.actorId, Date.now(), { includeHistory })
        });
        if (includeHistory) {
          who.historyStamp = historyStamp;
          socket.serializeAttachment(who);
        }
      } else {
        this.send(socket, { type: 'error', code: 'REMOVED_FROM_ROOM' });
        try {
          socket.close(1008, 'Removed');
        } catch {}
      }
    }
  }
  async fetch(request) {
    return this.exclusive(async () => {
      try {
        const path = new URL(request.url).pathname;
        if (path === '/create') {
          const data = await request.json();
          if (this.room) {
            await this.advance();
            this.assertRoom();
            if (this.room.id === data.id && this.room.hostId === data.hostId)
              return json({ ok: true });
            throw error('ROOM_EXISTS', 409);
          }
          const next = Engine.createRoom(data);
          next.preparedBoard = await boardPlan(this.env.DB, next.settings);
          // The host becomes online only once its authenticated socket connects.
          Engine.connect(next, next.hostId, false, Date.now());
          await this.save(next);
          return json({ ok: true });
        }
        await this.advance();
        this.assertRoom();
        if (path === '/join') {
          const data = await request.json(),
            next = clone(this.room);
          const previous = next.joinRequests?.[data.requestId];
          if (previous) {
            if (!next.players[previous]) throw error('REMOVED_FROM_ROOM', 403);
            return json({ actorId: previous });
          }
          Engine.join(next, data, Date.now());
          Engine.connect(next, data.id, false, Date.now());
          next.joinRequests = { ...next.joinRequests, [data.requestId]: data.id };
          await this.save(next);
          this.broadcast();
          return json({ actorId: data.id });
        }
        if (path === '/ticket') {
          const data = await request.json();
          if (!this.room.players[data.actorId]) throw error('UNAUTHORIZED', 401);
          // Replacing this per-actor ticket prevents unlimited unused-ticket storage.
          await this.ctx.storage.put('ticket:' + data.actorId, {
            id: data.jti,
            expiresAt: data.expiresAt
          });
          return json({ ok: true });
        }
        if (path === '/connect') {
          const actorId = request.headers.get('X-Actor'),
            ticket = await this.ctx.storage.get('ticket:' + actorId);
          const sessionExpires = Number(request.headers.get('X-Session-Expires'));
          if (
            !ticket ||
            ticket.id !== request.headers.get('X-Ticket') ||
            ticket.expiresAt <= Date.now() ||
            !Number.isFinite(sessionExpires) ||
            sessionExpires <= Date.now() ||
            !this.room.players[actorId]
          )
            throw error('UNAUTHORIZED', 401);
          await this.ctx.storage.delete('ticket:' + actorId);
          const pair = new WebSocketPair(),
            client = pair[0],
            socket = pair[1];
          for (const old of this.ctx.getWebSockets(actorId)) {
            this.send(old, { type: 'replaced' });
            old.close(1000, 'Connected elsewhere');
          }
          this.ctx.acceptWebSocket(socket, [actorId]);
          const connectionId = randomId();
          socket.serializeAttachment({
            actorId,
            connectionId,
            expiresAt: sessionExpires,
            rateAt: 0,
            rateCount: 0
          });
          const next = clone(this.room);
          next.socketIds = { ...next.socketIds, [actorId]: connectionId };
          Engine.connect(next, actorId, true, Date.now());
          await this.save(next);
          this.broadcast();
          return new Response(null, { status: 101, webSocket: client });
        }
        throw error('NOT_FOUND', 404);
      } catch (e) {
        return json({ code: e.code || 'SERVICE_UNAVAILABLE' }, e.status || (e.code ? 400 : 503));
      }
    });
  }
  async webSocketMessage(socket, message) {
    return this.exclusive(async () => {
      let command;
      try {
        if (this.room && this.expiresAt() <= Date.now()) await this.advance();
        this.assertRoom();
        const who = socket.deserializeAttachment();
        if (
          !who ||
          who.expiresAt <= Date.now() ||
          this.room.socketIds?.[who.actorId] !== who.connectionId
        )
          throw error('UNAUTHORIZED', 401);
        if (typeof message !== 'string' || new TextEncoder().encode(message).length > 16384)
          throw error('MESSAGE_TOO_LARGE');
        const now = Date.now();
        if (now - who.rateAt > 1000) {
          who.rateAt = now;
          who.rateCount = 0;
        }
        if (++who.rateCount > 20) throw error('RATE_LIMITED', 429);
        socket.serializeAttachment(who);
        try {
          command = JSON.parse(message);
        } catch {
          throw error('INVALID_REQUEST');
        }
        if (!command || typeof command.type !== 'string' || typeof command.id !== 'string')
          throw error('INVALID_REQUEST');
        if (command.protocol !== 2) throw error('CLIENT_UPDATE_REQUIRED');
        await this.advance();
        const next = clone(this.room),
          context = {};
        if (next.processed?.[who.actorId]?.[command.id]) {
          this.send(socket, { type: 'ack', id: command.id, revision: next.revision });
          return;
        }
        if (command.type === 'start') {
          if (who.actorId !== next.hostId || next.phase !== 'lobby') throw error('FORBIDDEN', 403);
          const participantCount = Object.values(next.players).filter((p) => p.player).length;
          const oralCount =
            next.settings.openResponse === 'oral'
              ? Math.floor(next.settings.questionCount / Math.max(1, participantCount)) *
                Math.max(1, participantCount)
              : next.settings.questionCount;
          context.boardPlan = await boardPlan(this.env.DB, {
            ...next.settings,
            questionCount: oralCount,
            flexibleCount: next.settings.openResponse === 'oral'
          });
        }
        if (command.type === 'voidQuestion') {
          if (who.actorId !== next.hostId) throw error('forbidden', 403);
          if (!['answering', 'grading', 'review', 'scoreReview', 'results'].includes(next.phase))
            throw error('wrongPhase');
          if (!next.current || command.roundId !== next.current.id) throw error('staleRound');
          const old = next.current && next.board.find((x) => x.id === next.current.tileId);
          const oldQ = old && next.questions.find((q) => q.id === old.qid);
          const used = [...next.board.map((x) => x.qid), ...(next.retired || [])];
          context.replacement = await replacementPlan(this.env.DB, next.settings, old, oldQ, used);
        }
        Engine.apply(next, who.actorId, command, Date.now(), context);
        if (command.type === 'start') delete next.preparedBoard;
        await this.save(next);
        this.broadcast();
        this.send(socket, { type: 'ack', id: command.id, revision: next.revision });
      } catch (e) {
        this.send(socket, {
          type: 'error',
          id: command?.id,
          code: e.code || 'SERVICE_UNAVAILABLE'
        });
      }
    });
  }
  async webSocketClose(socket) {
    try {
      socket.close(1000, 'Disconnected');
    } catch {}
    return this.exclusive(async () => {
      if (!this.room) return;
      const who = socket.deserializeAttachment();
      if (!who || !this.room.players[who.actorId]) return;
      if (this.room.socketIds?.[who.actorId] !== who.connectionId) return;
      if (
        this.ctx
          .getWebSockets(who.actorId)
          .some((other) => other !== socket && other.readyState === 1)
      )
        return;
      const next = clone(this.room);
      Engine.connect(next, who.actorId, false, Date.now());
      await this.save(next);
      this.broadcast();
    });
  }
  async webSocketError(socket) {
    try {
      socket.close(1011, 'Connection error');
    } catch {}
    await this.webSocketClose(socket);
  }
  async alarm() {
    return this.exclusive(async () => {
      if (!this.room) return;
      if (this.room.rulesVersion !== 2) {
        if (this.expiresAt() <= Date.now()) await this.expire();
        else await this.ctx.storage.setAlarm(this.expiresAt());
        return;
      }
      const changed = await this.advance();
      if (!changed && this.room) await this.save(this.room);
    });
  }
}
