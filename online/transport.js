(function (root) {
  'use strict';
  const apiBase = () => String(root.QuizConfig?.apiBase || '').replace(/\/$/, '');
  const permanentErrors = new Set([
    'ROOM_EXPIRED',
    'ROOM_NOT_FOUND',
    'UNAUTHORIZED',
    'REMOVED_FROM_ROOM',
    'ROOM_VERSION_UNSUPPORTED',
    'CLIENT_UPDATE_REQUIRED'
  ]);
  async function api(path, options = {}) {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(apiBase() + path, {
        ...options,
        signal: options.signal || controller.signal,
        headers: { 'Content-Type': 'application/json', ...options.headers },
        cache: 'no-store'
      });
      let data;
      try {
        data = await response.json();
      } catch {
        throw Object.assign(new Error('SERVICE_UNAVAILABLE'), { code: 'SERVICE_UNAVAILABLE' });
      }
      if (!response.ok)
        throw Object.assign(new Error(data.code || 'SERVICE_UNAVAILABLE'), {
          code: data.code || 'SERVICE_UNAVAILABLE',
          status: response.status
        });
      return data;
    } catch (error) {
      if (error.code) throw error;
      throw Object.assign(new Error('SERVICE_UNAVAILABLE'), { code: 'SERVICE_UNAVAILABLE' });
    } finally {
      clearTimeout(timer);
    }
  }
  function connect(
    session,
    {
      onState = () => {},
      onStatus = () => {},
      onError = () => {},
      adminToken = async () => ''
    } = {}
  ) {
    let socket = null,
      stopped = false,
      attempt = 0,
      retryTimer,
      heartbeat,
      lastSeen = Date.now(),
      generation = 0;
    const pending = new Map();
    let history = [];
    function clearItem(item) {
      clearTimeout(item.ackTimer);
      clearTimeout(item.expiryTimer);
    }
    function failPending(code) {
      for (const item of pending.values()) {
        clearItem(item);
        item.reject(Object.assign(new Error(code), { code }));
      }
      pending.clear();
    }
    function stop(code) {
      stopped = true;
      generation++;
      clearTimeout(retryTimer);
      clearInterval(heartbeat);
      root.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', visible);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
      failPending(code || 'DISCONNECTED');
    }
    function retry() {
      if (stopped) return;
      clearTimeout(retryTimer);
      onStatus('reconnecting');
      retryTimer = setTimeout(
        open,
        Math.min(15000, 500 * 2 ** Math.min(attempt++, 5)) + Math.random() * 250
      );
    }
    function reconnect() {
      if (stopped) return;
      generation++;
      clearInterval(heartbeat);
      for (const item of pending.values()) clearTimeout(item.ackTimer);
      if (socket) {
        socket.onclose = null;
        socket.close();
        socket = null;
      }
      retry();
    }
    function transmit(item) {
      socket.send(JSON.stringify(item.command));
      clearTimeout(item.ackTimer);
      item.ackTimer = setTimeout(reconnect, 10000);
    }
    function sendPending() {
      for (const [id, item] of pending) {
        if (Date.now() - item.created > 120000) {
          clearItem(item);
          pending.delete(id);
          item.reject(
            Object.assign(new Error('COMMAND_UNCONFIRMED'), { code: 'COMMAND_UNCONFIRMED' })
          );
          continue;
        }
        // Replay the original ID even if the snapshot already advanced. The
        // server may have committed the command before its acknowledgement was lost.
        transmit(item);
      }
    }
    async function open() {
      if (stopped) return;
      const run = ++generation;
      clearInterval(heartbeat);
      onStatus('connecting');
      try {
        const admin = session.isHost ? await adminToken() : '';
        const issued = await api('/api/socket-ticket', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + session.token,
            ...(admin ? { 'X-Admin-Token': admin } : {})
          },
          body: '{}'
        });
        if (stopped || run !== generation) return;
        const url = new URL(
          apiBase() + '/api/rooms/' + encodeURIComponent(session.roomId) + '/socket',
          location.href
        );
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        url.searchParams.set('ticket', issued.ticket);
        const next = new WebSocket(url.href);
        if (socket) {
          socket.onclose = null;
          socket.close();
        }
        socket = next;
        next.onopen = () => {
          if (run !== generation) return;
          attempt = 0;
          lastSeen = Date.now();
          onStatus('connected');
          heartbeat = setInterval(() => {
            if (next.readyState !== WebSocket.OPEN) return;
            if (Date.now() - lastSeen > 60000) {
              next.close();
              return;
            }
            next.send('ping');
          }, 25000);
        };
        let synced = false;
        next.onmessage = (event) => {
          if (run !== generation || stopped) return;
          lastSeen = Date.now();
          if (event.data === 'pong') return;
          let message;
          try {
            message = JSON.parse(event.data);
          } catch {
            return;
          }
          if (message.type === 'snapshot') {
            if (message.state?.protocol !== 2) {
              stop('CLIENT_UPDATE_REQUIRED');
              onStatus('CLIENT_UPDATE_REQUIRED');
              return;
            }
            if (Array.isArray(message.state.history)) history = message.state.history;
            else if (!message.historyUnchanged) return;
            onState({ ...message.state, history });
            if (!synced) {
              synced = true;
              sendPending();
            }
          } else if (message.type === 'ack') {
            const item = pending.get(message.id);
            if (item) {
              clearItem(item);
              pending.delete(message.id);
              item.resolve(message);
            }
          } else if (message.type === 'error') {
            const item = pending.get(message.id);
            if (item) {
              clearItem(item);
              pending.delete(message.id);
              item.reject(Object.assign(new Error(message.code), { code: message.code }));
            } else onError(message.code);
            if (permanentErrors.has(message.code)) {
              stop(message.code);
              onStatus(message.code);
            }
          } else if (message.type === 'replaced') {
            stop('CONNECTED_ELSEWHERE');
            onStatus('CONNECTED_ELSEWHERE');
          }
        };
        next.onclose = () => {
          if (run === generation) {
            clearInterval(heartbeat);
            for (const item of pending.values()) clearTimeout(item.ackTimer);
            retry();
          }
        };
        next.onerror = () => {};
      } catch (e) {
        if (run !== generation || stopped) return;
        if ([401, 404, 410].includes(e.status) || permanentErrors.has(e.code)) {
          stop(e.code);
          onStatus(e.code);
          onError(e.code);
        } else retry();
      }
    }
    function online() {
      if (!stopped && (!socket || socket.readyState !== WebSocket.OPEN)) {
        clearTimeout(retryTimer);
        open();
      }
    }
    function visible() {
      if (document.visibilityState === 'visible' && !stopped && Date.now() - lastSeen > 45000) {
        clearTimeout(retryTimer);
        open();
      }
    }
    root.addEventListener('online', online);
    document.addEventListener('visibilitychange', visible);
    open();
    return {
      send(type, payload = {}, roundId, selectionId) {
        if (stopped || !socket || socket.readyState !== WebSocket.OPEN)
          return Promise.reject(Object.assign(new Error('DISCONNECTED'), { code: 'DISCONNECTED' }));
        if (pending.size >= 16)
          return Promise.reject(
            Object.assign(new Error('WAIT_FOR_SERVER'), { code: 'WAIT_FOR_SERVER' })
          );
        const command = {
          protocol: 2,
          id: crypto.randomUUID(),
          type,
          payload,
          ...(roundId ? { roundId } : {}),
          ...(selectionId ? { selectionId } : {})
        };
        return new Promise((resolve, reject) => {
          const item = { command, resolve, reject, created: Date.now() };
          item.expiryTimer = setTimeout(() => {
            if (!pending.has(command.id)) return;
            pending.delete(command.id);
            clearTimeout(item.ackTimer);
            reject(
              Object.assign(new Error('COMMAND_UNCONFIRMED'), { code: 'COMMAND_UNCONFIRMED' })
            );
          }, 120000);
          pending.set(command.id, item);
          transmit(item);
        });
      },
      close() {
        stop();
      }
    };
  }
  root.QuizTransport = Object.freeze({ connect, api });
})(window);
