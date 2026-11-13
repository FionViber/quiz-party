import Core from '../src/core.js';
import Names from '../src/player-names.js';

const PROTOCOL = 2,
  MAX_PLAYERS = 32,
  CODE_RE = /^\d{6}$/;
const LANGS = ['en', 'zh-Hans', 'zh-Hant'];
const ERR = (code, message = code) => Object.assign(new Error(message), { code });
const clone = (value) => (value == null ? value : JSON.parse(JSON.stringify(value)));
const atTime = (value) => (Number.isFinite(value) ? value : Date.now());
const players = (state) => Object.values(state.players).filter((p) => p.player);
const actor = (state, id) => state.players[id] || null;
const activeIds = (state) => players(state).map((p) => p.id);
const currentTurn = (state) => {
  const ids = activeIds(state);
  return ids.length ? ids[state.history.length % ids.length] : null;
};
const host = (state, id) => {
  const p = actor(state, id);
  if (id !== state.hostId) throw ERR('forbidden');
  if (!p?.online) throw ERR('hostOffline');
  return p;
};
const player = (state, id) => {
  const p = actor(state, id);
  if (!p?.player) throw ERR('playerRequired');
  if (!p.online) throw ERR('offline');
  return p;
};
const phase = (state, ...allowed) => {
  if (!allowed.includes(state.phase)) throw ERR('wrongPhase');
};
const cleanName = (value) => Names.normalize(value, true) || '玩家';
const settingsOf = (s) => ({
  selection: s?.openResponse === 'oral' ? 'turn' : s?.selection === 'vote' ? 'vote' : 'host',
  answerSeconds: [30, 60, 120].includes(s?.answerSeconds) ? s.answerSeconds : 60,
  questionCount:
    Number.isInteger(s?.questionCount) &&
    s.questionCount >= 12 &&
    s.questionCount <= 96 &&
    s.questionCount % 12 === 0
      ? s.questionCount
      : 24,
  categoryIds: Array.isArray(s?.categoryIds) ? [...new Set(s.categoryIds.map(String))] : undefined,
  openResponse: s?.openResponse === 'oral' ? 'oral' : 'text',
  grading: s?.grading === 'host' ? 'host' : 'vote'
});
const makePlayer = (id, name, isHost = false, playing = true) => ({
  id,
  name: cleanName(name),
  host: isHost,
  player: playing,
  online: true,
  ready: false,
  score: 0
});
const requireRound = (state, command) => {
  if (!state.current || command.roundId !== state.current.id) throw ERR('staleRound');
};
const tile = (state, id) => state.board.find((t) => t.id === id) || null;
const submission = (state, id) =>
  Object.values(state.current?.submissions || {}).find((s) => s.id === id) || null;
const question = (state, t) => {
  const source = state.questions.find((q) => q.id === t?.qid);
  return source ? Core.variant(source, t.level) : null;
};
const qPrompt = (q) => Object.fromEntries(LANGS.map((l) => [l, q?.locales?.[l]?.prompt || '']));
const qAnswer = (q) =>
  Object.fromEntries(
    LANGS.map((l) => {
      const loc = q?.locales?.[l] || {};
      return [
        l,
        {
          answer: loc.answer ?? q?.answer ?? '',
          acceptedAnswers: Array.isArray(loc.acceptedAnswers ?? q?.acceptedAnswers)
            ? [...(loc.acceptedAnswers ?? q.acceptedAnswers)]
            : []
        }
      ];
    })
  );
const options = (q) =>
  (q?.options || []).map((id) => ({
    id,
    labels: Object.fromEntries(
      LANGS.map((l) => [l, q?.locales?.[l]?.optionLabels?.[id] ?? String(id)])
    )
  }));
const bump = (state, now) => {
  state.revision++;
  state.lastActivityAt = atTime(now);
};
const nextId = (state, prefix) => `${prefix}-${++state.sequence}`;
const hash = (value) =>
  Array.from(String(value)).reduce((n, c) => (n * 33 + c.charCodeAt(0)) >>> 0, 5381);
const randomIndex = (state, count) => {
  state.rngState = (1664525 * (state.rngState >>> 0) + 1013904223) >>> 0;
  return count ? state.rngState % count : 0;
};

export function createRoom({
  id,
  code,
  hostId,
  hostName,
  hostPlays = false,
  settings,
  now = Date.now()
}) {
  if (!id || !hostId || !CODE_RE.test(String(code))) throw ERR('invalidRoom');
  const state = {
    rulesVersion: 2,
    protocol: PROTOCOL,
    id: String(id),
    code: String(code),
    revision: 0,
    sequence: 0,
    rngState: hash(`${id}:${code}`),
    phase: 'lobby',
    hostId: String(hostId),
    hostOnline: true,
    hostPlays: !!hostPlays,
    players: {},
    settings: settingsOf(settings),
    board: [],
    questions: [],
    retired: [],
    packIdentity: null,
    current: null,
    votes: {},
    history: [],
    startedAt: null,
    finishedAt: null,
    selectionId: null,
    selectionDeadlineAt: null,
    pendingTileId: null,
    processed: {},
    lastActivityAt: atTime(now)
  };
  state.players[state.hostId] = makePlayer(hostId, hostName, true, !!hostPlays);
  return state;
}
export function join(state, { id, name }, now = Date.now()) {
  if (!id || !name || state.phase !== 'lobby')
    throw ERR(state.phase === 'lobby' ? 'invalidPlayer' : 'gameStarted');
  if (state.players[id]) throw ERR('alreadyJoined');
  const limit = state.settings.openResponse === 'oral' ? 8 : MAX_PLAYERS;
  if (players(state).length >= limit) throw ERR('roomFull');
  const normalized = cleanName(name),
    key = normalized.normalize('NFC').trim().toLocaleLowerCase();
  if (players(state).some((p) => p.name.normalize('NFC').trim().toLocaleLowerCase() === key))
    throw ERR('nameTaken');
  state.players[id] = makePlayer(String(id), normalized);
  bump(state, now);
  return state.players[id];
}
function reassignReviews(state) {
  const cur = state.current;
  if (!cur) return;
  for (const id of cur.reviewQueue) {
    const sub = cur.submissions[id];
    if (!sub || sub.correct !== undefined) continue;
    const currentReviewer = actor(state, sub.reviewerId);
    const stillEligible = currentReviewer?.online && currentReviewer.id !== sub.playerId &&
      (sub.playerId === state.hostId ? currentReviewer.player : currentReviewer.id === state.hostId);
    if (stillEligible) continue;
    if (sub.playerId === state.hostId)
      sub.reviewerId =
        activeIds(state).find((x) => x !== sub.playerId && state.players[x].online) || null;
    else sub.reviewerId = state.hostOnline ? state.hostId : null;
  }
  cur.pendingReview =
    cur.reviewQueue.find((id) => cur.submissions[id]?.correct === undefined) || null;
}
export function connect(state, actorId, online, now = Date.now()) {
  const p = actor(state, actorId);
  if (!p) throw ERR('unknownActor');
  p.online = !!online;
  if (actorId === state.hostId) state.hostOnline = !!online;
  reassignReviews(state);
  bump(state, now);
  return p;
}
function prepareBoard(state, context) {
  const plan = context?.boardPlan;
  if (!plan || !Array.isArray(plan.board) || !Array.isArray(plan.questions) || !plan.packIdentity)
    throw ERR('boardRequired');
  const targetCount =
    state.settings.openResponse === 'oral'
      ? Math.floor(state.settings.questionCount / Math.max(1, activeIds(state).length)) *
        Math.max(1, activeIds(state).length)
      : state.settings.questionCount;
  if (plan.board.length !== targetCount) throw ERR('boardCount');
  const ids = new Set(plan.questions.map((q) => q.id)),
    boardIds = new Set();
  if (
    plan.board.some((s) => {
      const source = plan.questions.find((q) => q.id === s?.qid);
      if (
        !s ||
        !ids.has(s.qid) ||
        boardIds.has(s.qid) ||
        !Number.isInteger(s.level) ||
        !source ||
        !Core.levels(source).includes(s.level)
      )
        return true;
      boardIds.add(s.qid);
      return false;
    })
  )
    throw ERR('invalidBoard');
  state.board = plan.board.map((s, i) => ({
    id: `tile-${i + 1}`,
    qid: s.qid,
    level: s.level,
    categoryGroup:
      s.categoryGroup || plan.questions.find((q) => q.id === s.qid)?.categoryGroup || null,
    number: i + 1,
    used: false
  }));
  state.questions = clone(plan.questions);
  state.packIdentity = clone(plan.packIdentity);
  state.settings.questionCount = targetCount;
}
function startQuestion(state, selected, now) {
  const q = question(state, selected);
  if (!q || selected.used) throw ERR('invalidTile');
  selected.used = true;
  state.votes = {};
  state.selectionDeadlineAt = null;
  state.selectionClosed = true;
  const ids = state.settings.openResponse === 'oral' ? [currentTurn(state)] : activeIds(state);
  state.current = {
    id: nextId(state, 'round'),
    tileId: selected.id,
    qid: selected.qid,
    level: selected.level,
    type: q.type,
    points: q.points,
    deadlineAt: atTime(now) + state.settings.answerSeconds * 1000,
    participantIds: ids,
    submissions: {},
    gradeVotes: {},
    assignments: {},
    gradingDeadlineAt: null,
    gradingClosed: false,
    revealed: false,
    reviewQueue: [],
    pendingReview: null,
    standardAnswer: null
  };
  state.phase = 'answering';
  state.pendingTileId = null;
}
function chooseVote(state, now) {
  const choices = state.board.filter((t) => !t.used),
    counts = new Map(choices.map((t) => [t.id, 0]));
  for (const voted of Object.values(state.votes))
    if (counts.has(voted)) counts.set(voted, counts.get(voted) + 1);
  const max = Math.max(0, ...counts.values());
  if (!max) return false;
  const tied = choices.filter((t) => counts.get(t.id) === max);
  prepareBriefing(state, tied[randomIndex(state, tied.length)]);
  return true;
}
function unanswered(state) {
  for (const id of state.current.participantIds || activeIds(state))
    if (!state.current.submissions[id])
      state.current.submissions[id] = {
        id: nextId(state, 'answer'),
        playerId: id,
        unanswered: true,
        text: null,
        optionId: null,
        status: 'timeout'
      };
}
function award(state, sub, correct) {
  if (sub.correct !== undefined) return;
  sub.correct = !!correct;
  sub.delta =
    sub.unanswered || sub.status === 'passed' || sub.status === 'timeout'
      ? 0
      : sub.correct
        ? state.current.points
        : state.current.type === 'open'
          ? -Math.floor(state.current.points / 2)
          : 0;
}
function prepareScoreReview(state, now) {
  const cur = state.current;
  unanswered(state);
  for (const sub of Object.values(cur.submissions)) award(state, sub, false);
  state.phase = 'scoreReview';
  bump(state, now);
}
function confirmRound(state, now) {
  const cur = state.current;
  for (const sub of Object.values(cur.submissions))
    state.players[sub.playerId].score += Number.isFinite(sub.delta) ? sub.delta : 0;
  const answers = clone(cur.submissions);
  for (const id of activeIds(state))
    if (!cur.participantIds?.includes(id)) {
      answers[id] = {
        id: `${cur.id}:notTurn:${id}`,
        playerId: id,
        status: 'notTurn',
        unanswered: true,
        correct: false,
        delta: 0,
        text: null,
        optionId: null
      };
    }
  state.history.push({
    id: cur.id,
    tileId: cur.tileId,
    qid: cur.qid,
    type: cur.type,
    points: cur.points,
    answers,
    scores: Object.fromEntries(activeIds(state).map((id) => [id, state.players[id].score]))
  });
  cur.scoreConfirmed = true;
  cur.reviewQueue = [];
  cur.pendingReview = null;
  state.phase = state.board.every((t) => t.used) ? 'finished' : 'results';
  if (state.phase === 'finished') state.finishedAt = atTime(now);
  bump(state, now);
}
export function finishInactive(state, now = Date.now()) {
  if (!state.startedAt || state.phase === 'finished') return state;
  state.phase = 'finished';
  state.finishedAt = atTime(now);
  state.endedByInactivity = true;
  state.current = null;
  state.pendingTileId = null;
  state.selectionDeadlineAt = null;
  bump(state, now);
  return state;
}
function finishChoice(state, now) {
  const q = question(state, tile(state, state.current.tileId));
  unanswered(state);
  for (const sub of Object.values(state.current.submissions))
    award(state, sub, !sub.unanswered && sub.optionId === q.correctOptionId);
  state.current.revealed = true;
  state.current.standardAnswer = qAnswer(q);
  prepareScoreReview(state, now);
}
function reviewerFor(state, authorId) {
  if (authorId === state.hostId)
    return activeIds(state).find((id) => id !== authorId && state.players[id].online) || null;
  return state.hostId && state.hostOnline ? state.hostId : null;
}
function beginGrading(state, now) {
  const cur = state.current;
  unanswered(state);
  cur.deadlineAt = null;
  cur.revealed = true;
  cur.standardAnswer = qAnswer(question(state, tile(state, cur.tileId)));
  const answered = Object.values(cur.submissions).filter((sub) => !sub.unanswered);
  for (const sub of Object.values(cur.submissions)) if (sub.unanswered) award(state, sub, false);
  if (!answered.length) {
    prepareScoreReview(state, now);
    return;
  }
  if (state.settings.grading === 'host') {
    cur.gradingDeadlineAt = null;
    if (answered.every((sub) => sub.playerId === state.hostId)) {
      finalizeOpen(state, now);
      return;
    }
  } else {
    const jurors = activeIds(state).filter((id) => state.players[id].online);
    cur.assignments = Object.fromEntries(jurors.map((id) => [id, []]));
    const load = Object.fromEntries(jurors.map((id) => [id, 0]));
    for (let pass = 0; pass < 3; pass++) {
      for (const sub of answered) {
        const authorIndex = Math.max(0, jurors.indexOf(sub.playerId));
        const order = (id) =>
          (jurors.indexOf(id) - authorIndex + jurors.length) % Math.max(1, jurors.length);
        const available = jurors.filter(
          (id) => id !== sub.playerId && load[id] < 3 && !cur.assignments[id].includes(sub.id)
        );
        available.sort((a, b) => load[a] - load[b] || order(a) - order(b));
        if (available[0]) {
          cur.assignments[available[0]].push(sub.id);
          load[available[0]]++;
        }
      }
    }
    cur.gradingDeadlineAt = atTime(now) + 90000;
    cur.gradingClosed = false;
    if (!Object.values(cur.assignments).some((ids) => ids.length)) {
      finalizeOpen(state, now);
      return;
    }
  }
  state.phase = 'grading';
  bump(state, now);
}
function finalizeOpen(state, now) {
  const cur = state.current;
  cur.gradingDeadlineAt = null;
  cur.gradingClosed = true;
  unanswered(state);
  for (const [id, sub] of Object.entries(cur.submissions)) {
    if (sub.unanswered || sub.correct !== undefined) continue;
    const ballots = Object.values(cur.gradeVotes).flatMap((b) =>
      typeof b[id] === 'boolean' ? [{ voter: b.voter, correct: b[id] }] : []
    );
    const yes = ballots.filter((v) => v.correct).length,
      no = ballots.length - yes;
    if (state.settings.grading === 'vote') {
      sub.votesFor = yes;
      sub.votesAgainst = no;
    }
    if (
      (id === state.hostId && state.settings.grading === 'host') ||
      yes === no ||
      ballots.length === 0
    ) {
      const reviewer = reviewerFor(state, id);
      if (reviewer) {
        sub.reviewerId = reviewer;
        if (!cur.reviewQueue.includes(id)) cur.reviewQueue.push(id);
        continue;
      }
      if (!cur.reviewQueue.includes(id)) cur.reviewQueue.push(id);
      continue;
    }
    award(state, sub, yes > no);
  }
  const q = question(state, tile(state, cur.tileId));
  cur.revealed = true;
  cur.standardAnswer = qAnswer(q);
  cur.pendingReview =
    cur.reviewQueue.find((id) => cur.submissions[id]?.correct === undefined) || null;
  if (cur.pendingReview) state.phase = 'review';
  else prepareScoreReview(state, now);
  bump(state, now);
}
const allVoted = (state) =>
  Object.entries(state.current.assignments || {})
    .filter(([, ids]) => ids.length > 0)
    .every(([id]) => state.current.gradeVotes[id]);
function markSuccess(state, actorId, commandId) {
  const key = String(actorId);
  state.processed[key] ||= {};
  state.processed[key][commandId] = true;
  const ids = Object.keys(state.processed[key]);
  if (ids.length > 500) delete state.processed[key][ids[0]];
}
const wasProcessed = (state, actorId, commandId) => !!state.processed[String(actorId)]?.[commandId];
const currentGameplayCommand = (state, command) => {
  if (command.type === 'pass' && state.phase === 'briefing') return;
  if (
    [
      'submit',
      'pass',
      'oralMark',
      'judge',
      'judgeAll',
      'gradeVote',
      'closeGrading',
      'review',
      'confirmScore',
      'voidQuestion'
    ].includes(command.type)
  ) {
    if (!state.current || command.roundId !== state.current.id) throw ERR('staleRound');
  }
};
function enterSelection(state, now) {
  state.current = null;
  state.pendingTileId = null;
  state.votes = {};
  state.phase = 'selecting';
  state.selectionId = nextId(state, 'selection');
  state.selectionClosed = false;
  state.selectionDeadlineAt = state.settings.selection === 'vote' ? now + 30000 : null;
}
function prepareBriefing(state, selected) {
  if (!selected || selected.used) throw ERR('invalidTile');
  state.pendingTileId = selected.id;
  state.selectionClosed = true;
  state.selectionDeadlineAt = null;
  state.phase = 'briefing';
}
function withdrawCurrentScore(state) {
  const cur = state.current;
  if (!cur?.scoreConfirmed) return;
  if (state.history.at(-1)?.id !== cur.id) throw ERR('wrongPhase');
  state.history.pop();
  for (const p of players(state)) p.score = state.history.at(-1)?.scores[p.id] || 0;
  cur.scoreConfirmed = false;
}
function completeSubmissions(state, now) {
  if (state.current.participantIds.every((id) => state.current.submissions[id])) {
    if (state.current.type === 'choice') finishChoice(state, now);
    else beginGrading(state, now);
  } else bump(state, now);
}

function applyCommand(state, actorId, command, now, context) {
  const payload = command.payload || {},
    t = command.type,
    time = atTime(now),
    p = actor(state, actorId);
  if (!p) throw ERR('unknownActor');
  if (t === 'ready') {
    phase(state, 'lobby');
    if (typeof payload.ready !== 'boolean') throw ERR('invalidReady');
    player(state, actorId).ready = payload.ready;
    bump(state, time);
    return;
  }
  if (t === 'start') {
    host(state, actorId);
    phase(state, 'lobby');
    if (players(state).length < 2) throw ERR('needTwoPlayers');
    if (players(state).some((x) => !x.online || !x.ready)) throw ERR('playersNotReady');
    prepareBoard(state, context);
    state.startedAt = time;
    enterSelection(state, time);
    bump(state, time);
    return;
  }
  if (t === 'kick') {
    host(state, actorId);
    phase(state, 'lobby');
    const victim = actor(state, payload.playerId);
    if (!victim || victim.id === state.hostId) throw ERR('invalidPlayer');
    delete state.players[victim.id];
    bump(state, time);
    return;
  }
  if (t === 'select') {
    if (actorId === state.hostId) host(state, actorId);
    else {
      player(state, actorId);
      if (state.settings.selection !== 'turn' || currentTurn(state) !== actorId)
        throw ERR('notYourTurn');
    }
    phase(state, 'selecting');
    if (command.selectionId !== state.selectionId) throw ERR('staleSelection');
    if (
      state.settings.selection === 'vote' &&
      (!state.selectionClosed || Object.keys(state.votes).length)
    )
      throw ERR('voteSelectionRequired');
    prepareBriefing(state, tile(state, payload.tileId));
    bump(state, time);
    return;
  }
  if (t === 'cancelSelection') {
    host(state, actorId);
    phase(state, 'briefing');
    if (command.selectionId !== state.selectionId) throw ERR('staleSelection');
    enterSelection(state, time);
    bump(state, time);
    return;
  }
  if (t === 'beginQuestion') {
    host(state, actorId);
    phase(state, 'briefing');
    if (command.selectionId !== state.selectionId) throw ERR('staleSelection');
    if (players(state).filter((p) => p.online).length < 2) throw ERR('needTwoOnline');
    if (state.settings.openResponse === 'oral' && !actor(state, currentTurn(state))?.online)
      throw ERR('speakerOffline');
    startQuestion(state, tile(state, state.pendingTileId), time);
    bump(state, time);
    return;
  }

  if (t === 'vote') {
    player(state, actorId);
    phase(state, 'selecting');
    if (state.settings.selection !== 'vote') throw ERR('hostSelection');
    if (command.selectionId !== state.selectionId) throw ERR('staleSelection');
    if (state.selectionClosed) throw ERR('selectionClosed');
    const selected = tile(state, payload.tileId);
    if (!selected || selected.used) throw ERR('invalidTile');
    state.votes[actorId] = selected.id;
    bump(state, time);
    return;
  }
  if (t === 'closeSelection') {
    host(state, actorId);
    phase(state, 'selecting');
    if (command.selectionId !== state.selectionId) throw ERR('staleSelection');
    state.selectionClosed = true;
    state.selectionDeadlineAt = null;
    chooseVote(state, time);
    bump(state, time);
    return;
  }
  currentGameplayCommand(state, command);
  if (
    state.current?.deadlineAt &&
    time >= state.current.deadlineAt &&
    ['submit', 'oralMark'].includes(t)
  ) {
    tick(state, time);
    throw ERR('deadlinePassed');
  }
  if (t === 'submit') {
    const pp = player(state, actorId);
    phase(state, 'answering');
    const cur = state.current;
    if (!cur.participantIds.includes(pp.id)) throw ERR('notYourTurn');
    if (state.settings.openResponse === 'oral' && cur.type === 'open') throw ERR('oralOnly');
    if (cur.submissions[pp.id]) throw ERR('alreadySubmitted');
    const q = question(state, tile(state, cur.tileId));
    let text = null,
      optionId = null;
    if (q.type === 'choice') {
      if (!q.options.includes(payload.optionId)) throw ERR('invalidOption');
      optionId = payload.optionId;
    } else {
      if (typeof payload.text !== 'string') throw ERR('invalidText');
      text = payload.text.normalize('NFC').trim();
      if (!text || [...text].length > 500) throw ERR('invalidText');
    }
    cur.submissions[pp.id] = {
      id: nextId(state, 'answer'),
      playerId: pp.id,
      text,
      optionId,
      status: 'answered',
      unanswered: false
    };
    completeSubmissions(state, time);
    return;
  }
  if (t === 'pass') {
    const oral = state.settings.openResponse === 'oral';
    if (state.phase === 'briefing') {
      if (!oral) throw ERR('wrongPhase');
      if (command.selectionId !== state.selectionId) throw ERR('staleSelection');
      if (actorId === state.hostId) host(state, actorId);
      else {
        player(state, actorId);
        if (actorId !== currentTurn(state)) throw ERR('notYourTurn');
      }
      startQuestion(state, tile(state, state.pendingTileId), time);
    } else phase(state, 'answering');
    const cur = state.current;
    const target = oral ? cur.participantIds[0] : actorId;
    if (actorId === state.hostId && oral) host(state, actorId);
    else {
      player(state, actorId);
      if (target !== actorId || !cur.participantIds.includes(actorId)) throw ERR('notYourTurn');
    }
    if (payload.playerId !== undefined && payload.playerId !== target) throw ERR('invalidPlayer');
    if (cur.submissions[target]) throw ERR('alreadySubmitted');
    cur.submissions[target] = {
      id: nextId(state, 'answer'),
      playerId: target,
      text: null,
      optionId: null,
      status: 'passed',
      unanswered: true
    };
    completeSubmissions(state, time);
    return;
  }
  if (t === 'oralMark') {
    phase(state, 'answering');
    const cur = state.current,
      target = cur.participantIds[0];
    if (state.settings.openResponse !== 'oral' || cur.type !== 'open') throw ERR('wrongPhase');
    if (actorId === state.hostId) host(state, actorId);
    else {
      player(state, actorId);
      if (actorId !== target) throw ERR('forbidden');
    }
    if (payload.playerId !== target || payload.answered !== true) throw ERR('invalidJudgment');
    if (cur.submissions[target]) throw ERR('alreadySubmitted');
    cur.submissions[target] = {
      id: nextId(state, 'answer'),
      playerId: target,
      text: null,
      optionId: null,
      status: 'answered',
      unanswered: false
    };
    completeSubmissions(state, time);
    return;
  }

  if (t === 'judge') {
    host(state, actorId);
    phase(state, 'grading');
    if (state.settings.grading !== 'host') throw ERR('voteGrading');
    if (typeof payload.correct !== 'boolean') throw ERR('invalidJudgment');
    const sub = submission(state, payload.answerId);
    if (!sub || sub.unanswered) throw ERR('invalidAnswer');
    if (sub.playerId === state.hostId) throw ERR('reviewRequired');
    if (sub.correct !== undefined) throw ERR('alreadyJudged');
    award(state, sub, payload.correct);
    const pending = Object.values(state.current.submissions).some(
      (s) =>
        !s.unanswered &&
        s.correct === undefined &&
        s.playerId !== state.hostId
    );
    if (!pending) finalizeOpen(state, time);
    else bump(state, time);
    return;
  }
  if (t === 'judgeAll') {
    host(state, actorId);
    phase(state, 'grading');
    if (state.settings.grading !== 'host') throw ERR('voteGrading');
    if (typeof payload.correct !== 'boolean') throw ERR('invalidJudgment');
    for (const sub of Object.values(state.current.submissions)) {
      if (sub.unanswered || sub.playerId === state.hostId || sub.correct !== undefined) continue;
        award(state, sub, payload.correct);
    }
    finalizeOpen(state, time);
    return;
  }
  if (t === 'gradeVote') {
    const pp = player(state, actorId);
    phase(state, 'grading');
    if (state.settings.grading !== 'vote') throw ERR('hostGrading');
    if (state.current.gradeVotes[pp.id]) throw ERR('alreadyVoted');
    if (!Array.isArray(payload.votes)) throw ERR('invalidVote');
    const ballot = { voter: pp.id };
    for (const v of payload.votes) {
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw ERR('invalidVote');
      const sub = submission(state, v.answerId);
      if (
        !sub ||
        sub.playerId === pp.id ||
        sub.unanswered ||
        typeof v.correct !== 'boolean' ||
        !state.current.assignments?.[pp.id]?.includes(sub.id)
      )
        throw ERR('invalidVote');
      ballot[sub.playerId] = v.correct;
    }
    state.current.gradeVotes[pp.id] = ballot;
    if (allVoted(state)) finalizeOpen(state, time);
    else bump(state, time);
    return;
  }
  if (t === 'closeGrading') {
    host(state, actorId);
    phase(state, 'grading');
    finalizeOpen(state, time);
    return;
  }
  if (t === 'review') {
    const reviewer = actor(state, actorId);
    phase(state, 'review');
    if (typeof payload.correct !== 'boolean') throw ERR('invalidJudgment');
    const sub = submission(state, payload.answerId);
    if (!reviewer?.online || !sub || sub.reviewerId !== actorId || sub.correct !== undefined)
      throw ERR('invalidReview');
    award(state, sub, payload.correct);
    state.current.reviewQueue = state.current.reviewQueue.filter(
      (id) => state.current.submissions[id]?.correct === undefined
    );
    state.current.pendingReview = state.current.reviewQueue[0] || null;
    if (!state.current.pendingReview) prepareScoreReview(state, time);
    else bump(state, time);
    return;
  }
  if (t === 'next') {
    host(state, actorId);
    phase(state, 'results');
    requireRound(state, command);
    if (!state.current.scoreConfirmed) throw ERR('wrongPhase');
    enterSelection(state, time);
    bump(state, time);
    return;
  }

  if (t === 'confirmScore') {
    host(state, actorId);
    phase(state, 'scoreReview');
    if (state.current?.scoreConfirmed) throw ERR('alreadyConfirmed');
    confirmRound(state, time);
    return;
  }
  if (t === 'voidQuestion') {
    host(state, actorId);
    phase(state, 'answering', 'grading', 'review', 'scoreReview', 'results');
    requireRound(state, command);
    const cur = state.current,
      replacement = context?.replacement;
    const old = tile(state, cur.tileId);
    if (
      !old ||
      !replacement?.question ||
      replacement.qid !== replacement.question.id ||
      replacement.level !== old.level ||
      !Core.levels(replacement.question).includes(old.level)
    )
      throw ERR('invalidReplacement');
    const oldQuestion = question(state, old),
      newQuestion = Core.variant(replacement.question, old.level);
    if (
      state.board.some((t) => t.qid === replacement.qid) ||
      state.retired.includes(replacement.qid) ||
      newQuestion.type !== oldQuestion.type ||
      newQuestion.points !== oldQuestion.points ||
      replacement.categoryGroup !== old.categoryGroup
    )
      throw ERR('invalidReplacement');
    withdrawCurrentScore(state);
    state.retired.push(old.qid);
    old.used = false;
    old.qid = replacement.qid;
    state.questions = state.questions.filter((q) => state.board.some((t) => t.qid === q.id));
    state.questions.push(clone(replacement.question));
    enterSelection(state, time);
    bump(state, time);
    return;
  }
  if (t === 'reopenGrading') {
    host(state, actorId);
    phase(state, 'results', 'scoreReview');
    requireRound(state, command);
    const cur = state.current;
    if (cur.type !== 'open') throw ERR('wrongPhase');
    if (typeof payload.answerId !== 'string') throw ERR('invalidAnswer');
    const sub = submission(state, payload.answerId);
    if (!sub || sub.unanswered) throw ERR('invalidAnswer');
    withdrawCurrentScore(state);
    cur.id = nextId(state, 'round');
    delete sub.correct;
    delete sub.delta;
    delete sub.votesFor;
    delete sub.votesAgainst;
    sub.reviewerId = reviewerFor(state, sub.playerId);
    cur.reviewQueue = [sub.playerId];
    cur.pendingReview = sub.playerId;
    cur.gradingDeadlineAt = null;
    cur.deadlineAt = null;
    cur.gradingClosed = true;
    state.phase = 'review';
    bump(state, time);
    return;
  }

  if (t === 'finish') {
    host(state, actorId);
    phase(
      state,
      'selecting',
      'briefing',
      'answering',
      'grading',
      'review',
      'scoreReview',
      'results'
    );
    state.phase = 'finished';
    state.finishedAt = time;
    state.current = null;
    state.selectionDeadlineAt = null;
    bump(state, time);
    return;
  }
  throw ERR('unknownCommand');
}
export function apply(state, actorId, command, now = Date.now(), context = {}) {
  if (state.rulesVersion !== 2) throw ERR('ROOM_VERSION_UNSUPPORTED');
  if (
    !command ||
    typeof command.id !== 'string' ||
    command.id.length < 1 ||
    command.id.length > 120
  )
    throw ERR('invalidCommand');
  if (wasProcessed(state, actorId, command.id)) return state;
  if (!actor(state, actorId)) throw ERR('unknownActor');
  currentGameplayCommand(state, command);
  tick(state, now);
  const before = state.revision;
  applyCommand(state, actorId, command, now, context);
  if (state.revision === before) bump(state, now);
  markSuccess(state, actorId, command.id);
  return state;
}
export function tick(state, now = Date.now()) {
  const time = atTime(now);
  if (
    state.phase === 'selecting' &&
    state.settings.selection === 'vote' &&
    state.selectionDeadlineAt &&
    time >= state.selectionDeadlineAt
  ) {
    state.selectionDeadlineAt = null;
    state.selectionClosed = true;
    if (state.hostOnline) chooseVote(state, time);
    bump(state, time);
  }
  const cur = state.current;
  if (!cur) return state;
  if (state.phase === 'grading' && cur.gradingDeadlineAt && time >= cur.gradingDeadlineAt) {
    cur.gradingClosed = true;
    cur.gradingDeadlineAt = null;
    finalizeOpen(state, time);
    return state;
  }
  if (state.phase === 'answering' && cur.deadlineAt && time >= cur.deadlineAt) {
    cur.deadlineAt = null;
    if (cur.type === 'choice') finishChoice(state, time);
    else {
      beginGrading(state, time);
    }
  }
  return state;
}
export function nextDeadline(state) {
  if (state.phase === 'answering') return state.current?.deadlineAt ?? null;
  if (state.phase === 'grading') return state.current?.gradingDeadlineAt ?? null;
  if (state.phase === 'selecting' && !state.selectionClosed)
    return state.selectionDeadlineAt ?? null;
  return null;
}
function answerProjection(sub, viewerId, reveal) {
  if (!reveal && sub.playerId !== viewerId)
    return {
      id: sub.id,
      playerId: sub.playerId,
      submitted: !sub.unanswered,
      unanswered: !!sub.unanswered,
      status: sub.status || (sub.unanswered ? 'timeout' : 'answered')
    };
  return {
    id: sub.id,
    playerId: sub.playerId,
    submitted: !sub.unanswered,
    unanswered: !!sub.unanswered,
    status: sub.status || (sub.unanswered ? 'timeout' : 'answered'),
    optionId: reveal || sub.playerId === viewerId ? (sub.optionId ?? null) : undefined,
    text: reveal || sub.playerId === viewerId ? (sub.text ?? null) : undefined,
    correct: reveal && sub.correct !== undefined ? sub.correct : null,
    delta: reveal && sub.delta !== undefined ? sub.delta : null,
    reviewerId: reveal ? (sub.reviewerId ?? null) : null,
    votesFor: reveal ? (sub.votesFor ?? null) : null,
    votesAgainst: reveal ? (sub.votesAgainst ?? null) : null
  };
}
export function snapshot(state, viewerId, now = Date.now(), { includeHistory = true } = {}) {
  const view = actor(state, viewerId),
    cur = state.current,
    reveal =
      !!cur?.revealed || ['scoreReview', 'results', 'review', 'finished'].includes(state.phase);
  const board = state.board.map((t) => {
    const q = question(state, t);
    return {
      id: t.id,
      number: t.number,
      type: q?.type,
      points: q?.points,
      tag: q?.tag || {},
      used: !!t.used,
      votes: Object.values(state.votes).filter((v) => v === t.id).length
    };
  });
  let current = null;
  if (state.phase === 'briefing' && state.pendingTileId) {
    const bt = tile(state, state.pendingTileId),
      bq = question(state, bt);
    current = {
      id: null,
      tileId: bt.id,
      number: bt.number,
      type: bq.type,
      points: bq.points,
      tag: bq.tag || {},
      participantIds:
        state.settings.openResponse === 'oral' ? [currentTurn(state)] : activeIds(state),
      prompt: null,
      options: [],
      deadlineAt: null,
      submittedCount: 0,
      mySubmission: null,
      oralPlayerId: currentTurn(state) || null,
      turnPlayerId: currentTurn(state) || null,
      answers: [],
      reviewAnswerIds: [],
      gradingSubmittedCount: 0,
      eligibleReviewerCount: 0,
      provisionalDeltas: {},
      scoreConfirmed: false
    };
  }
  if (cur) {
    const q = question(state, tile(state, cur.tileId));
    current = {
      id: cur.id,
      tileId: cur.tileId,
      number: tile(state, cur.tileId)?.number,
      type: q.type,
      points: q.points,
      prompt: state.phase === 'briefing' ? null : qPrompt(q),
      options: state.phase === 'briefing' ? [] : q.type === 'choice' ? options(q) : [],
      participantIds: clone(cur.participantIds || activeIds(state)),
      oralPlayerId: cur.participantIds?.[0] || null,
      turnPlayerId: cur.participantIds?.[0] || null,
      deadlineAt: cur.deadlineAt || null,
      submittedCount: Object.keys(cur.submissions).length,
      mySubmission: clone(cur.submissions[viewerId] || null),
      standardAnswer: reveal ? cur.standardAnswer || qAnswer(q) : null,
      answers: Object.values(cur.submissions)
        .map((s) => answerProjection(s, viewerId, reveal))
        .concat(
          cur.participantIds?.length === 1
            ? activeIds(state)
                .filter((id) => id !== cur.participantIds[0])
                .map((id) => ({
                  id: null,
                  playerId: id,
                  submitted: false,
                  unanswered: true,
                  status: 'notTurn',
                  optionId: null,
                  text: null,
                  correct: false,
                  delta: 0
                }))
            : []
        ),
      gradingSubmittedCount: Object.entries(cur.assignments || {}).filter(
        ([id, ids]) => ids.length > 0 && cur.gradeVotes[id]
      ).length,
      eligibleReviewerCount: Object.values(cur.assignments || {}).filter((ids) => ids.length > 0)
        .length,
      gradingDeadlineAt: cur.gradingDeadlineAt || null,
      gradingClosed: !!cur.gradingClosed,
      reviewAnswerIds: clone(cur.assignments?.[viewerId] || []),
      provisionalDeltas: reveal ? Object.fromEntries(Object.values(cur.submissions).filter(sub => Number.isFinite(sub.delta)).map(sub => [sub.playerId, sub.delta])) : {},
      scoreConfirmed: !!cur.scoreConfirmed
    };
  }
  return {
    protocol: PROTOCOL,
    rulesVersion: state.rulesVersion || 2,
    id: state.id,
    code: state.code,
    revision: state.revision,
    serverNow: atTime(now),
    phase: state.phase,
    hostId: state.hostId,
    hostOnline: state.hostOnline,
    hostName: state.players[state.hostId].name,
    selectionId: state.selectionId,
    selectionClosed: !!state.selectionClosed,
    selectionDeadlineAt: state.selectionDeadlineAt,
    pendingTileId: state.pendingTileId,
    playerLimit: state.settings.openResponse === 'oral' ? 8 : MAX_PLAYERS,
    turnPlayerId: currentTurn(state) || null,
    settings: clone(state.settings),
    viewer: {
      id: viewerId,
      isHost: viewerId === state.hostId,
      isPlayer: !!view?.player,
      submitted: !!cur?.submissions?.[viewerId],
      gradeSubmitted: !!cur?.gradeVotes?.[viewerId],
      voteTileId: state.votes[viewerId] || null,
      canAnswer:
        !!cur?.participantIds?.includes(viewerId) ||
        (state.phase === 'briefing' && state.settings.openResponse !== 'oral'),
      reviewAnswerIds: clone(cur?.assignments?.[viewerId] || [])
    },
    players: players(state).map((p) => ({
      id: p.id,
      name: p.name,
      online: p.online,
      ready: p.ready,
      score: p.score
    })),
    board,
    current,
    ...(includeHistory ? { history: clone(state.history) } : {}),
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
    durationMs: state.startedAt
      ? Math.max(0, (state.finishedAt || atTime(now)) - state.startedAt)
      : 0,
    ...(state.endedByInactivity ? { endedByInactivity: true } : {})
  };
}
