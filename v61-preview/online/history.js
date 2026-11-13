(function (root) {
  'use strict';
  var Names =
    (root && root.NeoPlayerNames) ||
    (typeof require === 'function' ? require('../src/player-names.js') : null);
  var MAX_BYTES = 32 * 1024 * 1024,
    MAX_PLAYERS = 32,
    MAX_QUESTIONS = 96,
    CURRENT_PROTOCOL = 2,
    CURRENT_RULES = 2;
  function err(code) {
    var e = new Error(code);
    e.code = code;
    return e;
  }
  function fail(code) {
    throw err(code);
  }
  function object(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
  }
  function own(o, k) {
    return Object.prototype.hasOwnProperty.call(o, k);
  }
  function codepoints(s) {
    return Array.from(s).length;
  }
  function graphemes(s) {
    return typeof Intl !== 'undefined' && Intl.Segmenter
      ? Array.from(
          new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s),
          function (x) {
            return x.segment;
          }
        )
      : Array.from(s);
  }
  function bytes(v) {
    try {
      return new TextEncoder().encode(JSON.stringify(v)).length;
    } catch (_) {
      return MAX_BYTES + 1;
    }
  }
  function checkPlayers(players) {
    if (!Array.isArray(players) || players.length < 2 || players.length > MAX_PLAYERS)
      fail('players');
    var ids = new Set();
    players.forEach(function (p) {
      if (!object(p) || typeof p.id !== 'string' || !p.id || p.id.length > 200 || ids.has(p.id))
        fail('playerId');
      if (
        typeof p.name !== 'string' ||
        !p.name ||
        graphemes(p.name).length > 12 ||
        (Names && Names.normalize(p.name, true) !== p.name)
      )
        fail('playerName');
      if (!Number.isSafeInteger(p.score)) fail('playerScore');
      ids.add(p.id);
    });
    return ids;
  }
  function checkAnswer(a, id, type, points, answerIds, rulesVersion) {
    if (!object(a) || typeof a.playerId !== 'string' || a.playerId !== id) fail('answerPlayer');
    if (typeof a.id !== 'string' || !a.id || a.id.length > 200 || answerIds.has(a.id))
      fail('answerId');
    answerIds.add(a.id);
    if (rulesVersion >= CURRENT_RULES) {
      if (!['answered', 'passed', 'timeout', 'notTurn'].includes(a.status)) fail('answerStatus');
      var isAnswered = a.status === 'answered';
      if (a.unanswered !== !isAnswered || a.correct !== (isAnswered && a.correct === true))
        fail('answerStatus');
      var expectedV2 = isAnswered
        ? a.correct
          ? points
          : type === 'open'
            ? -Math.floor(points / 2)
            : 0
        : 0;
      if (a.delta !== expectedV2) fail('answerDelta');
    } else if (
      typeof a.unanswered !== 'boolean' ||
      typeof a.correct !== 'boolean' ||
      !Number.isSafeInteger(a.delta)
    )
      fail('answerFields');
    if (a.unanswered && a.correct) fail('answerCorrect');
    if (a.votesFor !== undefined || a.votesAgainst !== undefined) {
      if (
        !Number.isInteger(a.votesFor) ||
        !Number.isInteger(a.votesAgainst) ||
        a.votesFor < 0 ||
        a.votesAgainst < 0 ||
        a.votesFor + a.votesAgainst > (rulesVersion >= CURRENT_RULES ? 3 : 31)
      )
        fail('votes');
    }
    if (rulesVersion < CURRENT_RULES) {
      var expected = a.correct ? points : type === 'open' ? -Math.floor(points / 2) : 0;
      if (a.delta !== expected) fail('answerDelta');
    }
    if (
      a.text !== undefined &&
      a.text !== null &&
      (typeof a.text !== 'string' || Array.from(a.text).length > 500)
    )
      fail('answerText');
    if (
      a.optionId !== undefined &&
      a.optionId !== null &&
      (typeof a.optionId !== 'string' || Array.from(a.optionId).length > 500)
    )
      fail('option');
  }
  function checkSettings(s, rulesVersion) {
    if (
      !object(s) ||
      !Number.isInteger(s.questionCount) ||
      s.questionCount < 1 ||
      s.questionCount > MAX_QUESTIONS ||
      !(rulesVersion >= CURRENT_RULES ? ['host', 'vote', 'turn'] : ['host', 'vote']).includes(
        s.selection
      ) ||
      ![30, 60, 120].includes(s.answerSeconds) ||
      !['oral', 'text'].includes(s.openResponse) ||
      !['host', 'vote'].includes(s.grading)
    )
      fail('settings');
    if (rulesVersion >= CURRENT_RULES && s.selection === 'turn' && s.openResponse !== 'oral')
      fail('settings');
  }
  function checkHistory(history, ids, finalScores, questionCount, settings, rulesVersion) {
    if (!Array.isArray(history) || history.length > MAX_QUESTIONS || history.length > questionCount)
      fail('history');
    var seen = new Set(),
      tiles = new Set(),
      qids = new Set(),
      totals = Object.create(null);
    ids.forEach(function (id) {
      totals[id] = 0;
    });
    history.forEach(function (q) {
      if (
        !object(q) ||
        typeof q.id !== 'string' ||
        !q.id ||
        seen.has(q.id) ||
        typeof q.tileId !== 'string' ||
        tiles.has(q.tileId) ||
        typeof q.qid !== 'string' ||
        qids.has(q.qid)
      )
        fail('historyId');
      if (q.type !== 'choice' && q.type !== 'open') fail('historyType');
      if (
        !Number.isInteger(q.points) ||
        (q.type === 'choice'
          ? q.points < 100 || q.points > 400 || q.points % 100
          : ![200, 400, 600, 800].includes(q.points))
      )
        fail('historyPoints');
      if (
        !object(q.answers) ||
        !object(q.scores) ||
        Object.keys(q.answers).length !== ids.size ||
        Object.keys(q.scores).length !== ids.size
      )
        fail('answers');
      var answerIds = new Set();
      ids.forEach(function (id) {
        if (!own(q.answers, id)) fail('answersMissing');
        checkAnswer(q.answers[id], id, q.type, q.points, answerIds, rulesVersion);
        totals[id] += q.answers[id].delta;
      });
      if (rulesVersion >= CURRENT_RULES && settings.selection === 'turn') {
        var turnId = Array.from(ids)[seen.size % ids.size];
        ids.forEach(function (id) {
          var status = q.answers[id].status;
          if (id === turnId ? status === 'notTurn' : status !== 'notTurn') fail('turnStatus');
        });
      }
      ids.forEach(function (id) {
        if (!Number.isSafeInteger(q.scores[id]) || q.scores[id] !== totals[id]) fail('subtotal');
      });
      seen.add(q.id);
      tiles.add(q.tileId);
      qids.add(q.qid);
    });
    ids.forEach(function (id) {
      if (totals[id] !== finalScores[id]) fail('scoreTotal');
    });
  }
  function cleanRecord(r) {
    if (
      !object(r) ||
      typeof r.id !== 'string' ||
      !r.id ||
      r.id.length > 200 ||
      r.phase !== 'finished'
    )
      fail('record');
    var rulesVersion = r.rulesVersion === undefined ? 1 : r.rulesVersion;
    if (!Number.isInteger(rulesVersion) || ![1, CURRENT_RULES].includes(rulesVersion))
      fail('rulesVersion');
    var protocol = r.protocol === undefined ? 1 : r.protocol;
    if (!Number.isInteger(protocol) || ![1, CURRENT_PROTOCOL].includes(protocol)) fail('protocol');
    if (rulesVersion >= CURRENT_RULES && protocol !== CURRENT_PROTOCOL) fail('protocol');
    if (r.endedByInactivity !== undefined && typeof r.endedByInactivity !== 'boolean') fail('record');
    checkSettings(r.settings, rulesVersion);
    var ids = checkPlayers(r.players),
      scores = Object.create(null),
      ps = r.players.map(function (p) {
        scores[p.id] = p.score;
        return { id: p.id, name: p.name, score: p.score };
      });
    checkHistory(r.history, ids, scores, r.settings.questionCount, r.settings, rulesVersion);
    if (
      !Number.isFinite(r.startedAt) ||
      !Number.isFinite(r.finishedAt) ||
      r.finishedAt < r.startedAt ||
      !Number.isFinite(r.durationMs) ||
      r.durationMs !== r.finishedAt - r.startedAt
    )
      fail('time');
    var hs = r.history.map(function (q) {
      var a = Object.create(null);
      Object.keys(q.answers).forEach(function (id) {
        var x = q.answers[id];
        a[id] = {
          id: x.id,
          playerId: x.playerId,
          text: x.text ?? null,
          optionId: x.optionId ?? null,
          unanswered: x.unanswered,
          correct: x.correct,
          delta: x.delta,
          ...(rulesVersion >= CURRENT_RULES ? { status: x.status } : {}),
          ...(x.reviewerId !== undefined ? { reviewerId: x.reviewerId } : {}),
          ...(x.votesFor !== undefined
            ? { votesFor: x.votesFor, votesAgainst: x.votesAgainst }
            : {})
        };
      });
      return {
        id: q.id,
        tileId: q.tileId,
        qid: q.qid,
        type: q.type,
        points: q.points,
        answers: a,
        scores: Object.fromEntries(
          Object.keys(q.scores).map(function (id) {
            return [id, q.scores[id]];
          })
        )
      };
    });
    return {
      protocol: rulesVersion >= CURRENT_RULES ? CURRENT_PROTOCOL : protocol,
      rulesVersion: rulesVersion,
      id: r.id,
      phase: 'finished',
      settings: {
        questionCount: r.settings.questionCount,
        selection: r.settings.selection,
        answerSeconds: r.settings.answerSeconds,
        openResponse: r.settings.openResponse,
        grading: r.settings.grading
      },
      players: ps,
      history: hs,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      durationMs: r.durationMs
      ,...(r.endedByInactivity ? { endedByInactivity: true } : {})
    };
  }
  function normalize(records, options) {
    options = options || {};
    var strict = options.strict !== false;
    if (bytes(records) > MAX_BYTES) fail('tooLarge');
    if (!Array.isArray(records)) {
      if (strict) fail('records');
      return [];
    }
    var map = new Map();
    records.forEach(function (r) {
      try {
        var clean = cleanRecord(r);
        if (strict && map.has(clean.id)) fail('duplicateRecord');
        map.set(clean.id, clean);
      } catch (e) {
        if (strict) throw e;
      }
    });
    return Array.from(map.values());
  }
  function snapshot(room) {
    if (!object(room)) fail('room');
    var raw = Array.isArray(room.players)
      ? room.players
      : Object.values(room.players || {}).filter(function (p) {
          return p && p.player;
        });
    return normalize(
      [
        {
          id: String(room.id),
          phase: room.phase,
          protocol: room.protocol === CURRENT_PROTOCOL ? CURRENT_PROTOCOL : 1,
          rulesVersion:
            room.rulesVersion === CURRENT_RULES && room.protocol === CURRENT_PROTOCOL
              ? CURRENT_RULES
              : 1,
          settings: room.settings,
          players: raw.map(function (p) {
            return { id: String(p.id), name: p.name, score: p.score };
          }),
          history: room.history || [],
          startedAt: room.startedAt,
          finishedAt: room.finishedAt,
          durationMs: room.durationMs,
          endedByInactivity: room.endedByInactivity
        }
      ],
      { strict: true }
    )[0];
  }
  function merge(current, incoming) {
    return normalize([].concat(current || [], incoming || []), { strict: false });
  }
  function exportArchive(records) {
    return {
      kind: 'quizparty-online-history',
      schemaVersion: 1,
      records: normalize(records, { strict: true })
    };
  }
  function importArchive(doc) {
    if (!object(doc) || doc.kind !== 'quizparty-online-history' || doc.schemaVersion !== 1)
      fail('schema');
    if (bytes(doc) > MAX_BYTES) fail('tooLarge');
    return normalize(doc.records, { strict: true });
  }
  var api = {
    snapshot: snapshot,
    normalize: normalize,
    merge: merge,
    exportArchive: exportArchive,
    importArchive: importArchive
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.QuizHistory = api;
})(typeof window === 'object' ? window : globalThis);
