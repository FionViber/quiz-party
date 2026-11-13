import Core from '../src/core.js';
import Names from '../src/player-names.js';

const PROTOCOL = 1,
  MAX_PLAYERS = 32,
  CODE_RE = /^\d{6}$/;
const LANGS = ['en', 'zh-Hans', 'zh-Hant'];
const ERR = (code, message = code) => Object.assign(new Error(message), { code });
const clone = (value) => (value == null ? value : JSON.parse(JSON.stringify(value)));
const atTime = (value) => (Number.isFinite(value) ? value : Date.now());
const players = (state) => Object.values(state.players).filter((p) => p.player);
const actor = (state, id) => state.players[id] || null;
const activeIds = (state) => players(state).map((p) => p.id);
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
  selection: s?.selection === 'vote' ? 'vote' : 'host',
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
    packIdentity: null,
    current: null,
    votes: {},
    history: [],
    startedAt: null,
    finishedAt: null,
    selectionId: null,
    selectionDeadlineAt: null,
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
  if (players(state).length >= MAX_PLAYERS) throw ERR('roomFull');
  state.players[id] = makePlayer(String(id), name);
  bump(state, now);
  return state.players[id];
}
function reassignReviews(state) {
  const cur = state.current;
  if (!cur) return;
  for (const id of cur.reviewQueue) {
    const sub = cur.submissions[id];
    if (!sub || sub.correct !== undefined) continue;
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
  if (plan.board.length !== state.settings.questionCount) throw ERR('boardCount');
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
    number: i + 1,
    used: false
  }));
  state.questions = clone(plan.questions);
  state.packIdentity = clone(plan.packIdentity);
}
function startQuestion(state, selected, now) {
  const q = question(state, selected);
  if (!q || selected.used) throw ERR('invalidTile');
  selected.used = true;
  state.votes = {};
  state.selectionDeadlineAt = null;
  state.selectionClosed = true;
  state.current = {
    id: nextId(state, 'round'),
    tileId: selected.id,
    qid: selected.qid,
    level: selected.level,
    type: q.type,
    points: q.points,
    deadlineAt: atTime(now) + state.settings.answerSeconds * 1000,
    submissions: {},
    oralStage: q.type === 'open' && state.settings.openResponse === 'oral' ? 'thinking' : null,
    oralIndex: 0,
    oralMarked: {},
    gradeVotes: {},
    judges: {},
    revealed: false,
    reviewQueue: [],
    pendingReview: null,
    standardAnswer: null
  };
  state.phase = 'answering';
}
function chooseVote(state, now) {
  const choices = state.board.filter((t) => !t.used),
    counts = new Map(choices.map((t) => [t.id, 0]));
  for (const voted of Object.values(state.votes))
    if (counts.has(voted)) counts.set(voted, counts.get(voted) + 1);
  const max = Math.max(0, ...counts.values());
  if (!max) return false;
  const tied = choices.filter((t) => counts.get(t.id) === max);
  startQuestion(state, tied[randomIndex(state, tied.length)], now);
  return true;
}
function unanswered(state) {
  for (const id of activeIds(state))
    if (!state.current.submissions[id])
      state.current.submissions[id] = {
        id: nextId(state, 'answer'),
        playerId: id,
        unanswered: true,
        text: null,
        optionId: null
      };
}
function award(state, sub, correct) {
  if (sub.correct !== undefined) return;
  sub.correct = !!correct;
  sub.delta = sub.correct
    ? state.current.points
    : state.current.type === 'open'
      ? -Math.floor(state.current.points / 2)
      : 0;
}
function finishRound(state, now) {
  const cur = state.current;
  unanswered(state);
  for (const sub of Object.values(cur.submissions)) award(state, sub, false);
  for (const sub of Object.values(cur.submissions))
    state.players[sub.playerId].score += Number.isFinite(sub.delta) ? sub.delta : 0;
  state.history.push({
    id: cur.id,
    tileId: cur.tileId,
    qid: cur.qid,
    type: cur.type,
    points: cur.points,
    answers: clone(cur.submissions),
    scores: Object.fromEntries(activeIds(state).map((id) => [id, state.players[id].score]))
  });
  cur.reviewQueue = [];
  cur.pendingReview = null;
  state.phase = 'results';
  bump(state, now);
}
function finishChoice(state, now) {
  const q = question(state, tile(state, state.current.tileId));
  unanswered(state);
  for (const sub of Object.values(state.current.submissions))
    award(state, sub, !sub.unanswered && sub.optionId === q.correctOptionId);
  state.current.revealed = true;
  state.current.standardAnswer = qAnswer(q);
  finishRound(state, now);
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
    finishRound(state, now);
    return;
  }
  if (state.settings.grading === 'host' && answered.every((sub) => sub.playerId === state.hostId)) {
    finalizeOpen(state, now);
    return;
  }
  if (state.settings.grading === 'vote') {
    for (const id of activeIds(state))
      if (!answered.some((sub) => sub.playerId !== id)) cur.gradeVotes[id] = { voter: id };
  }
  state.phase = 'grading';
  bump(state, now);
}
function finalizeOpen(state, now) {
  const cur = state.current;
  unanswered(state);
  for (const [id, sub] of Object.entries(cur.submissions)) {
    if (sub.unanswered || sub.correct !== undefined) continue;
    if (typeof cur.judges[id] === 'boolean') {
      award(state, sub, cur.judges[id]);
      continue;
    }
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
  else finishRound(state, now);
  bump(state, now);
}
const allVoted = (state) => activeIds(state).every((id) => state.current.gradeVotes[id]);
function markSuccess(state, actorId, commandId) {
  const key = String(actorId);
  state.processed[key] ||= {};
  state.processed[key][commandId] = true;
  const ids = Object.keys(state.processed[key]);
  if (ids.length > 500) delete state.processed[key][ids[0]];
}
const wasProcessed = (state, actorId, commandId) => !!state.processed[String(actorId)]?.[commandId];
const currentGameplayCommand = (state, command) => {
  if (
    ['submit', 'oralMark', 'judge', 'judgeAll', 'gradeVote', 'closeGrading', 'review'].includes(
      command.type
    )
  ) {
    if (!state.current || command.roundId !== state.current.id) throw ERR('staleRound');
  }
};
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
    state.phase = 'selecting';
    state.selectionId = nextId(state, 'selection');
    state.selectionClosed = false;
    state.selectionDeadlineAt = state.settings.selection === 'vote' ? time + 30000 : null;
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
    host(state, actorId);
    phase(state, 'selecting');
    if (command.selectionId !== state.selectionId) throw ERR('staleSelection');
    if (
      state.settings.selection === 'vote' &&
      (!state.selectionClosed || Object.keys(state.votes).length)
    )
      throw ERR('voteSelectionRequired');
    const selected = tile(state, payload.tileId);
    if (!selected || selected.used) throw ERR('invalidTile');
    startQuestion(state, selected, time);
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
    if (state.current.oralStage) throw ERR('oralOnly');
    if (state.current.submissions[pp.id]) throw ERR('alreadySubmitted');
    const q = question(state, tile(state, state.current.tileId));
    if (q.type === 'choice') {
      if (!q.options.includes(payload.optionId)) throw ERR('invalidOption');
      state.current.submissions[pp.id] = {
        id: nextId(state, 'answer'),
        playerId: pp.id,
        optionId: payload.optionId,
        text: null,
        unanswered: false
      };
    } else {
      const text = String(payload.text ?? '')
        .normalize('NFC')
        .trim();
      if (!text || [...text].length > 500) throw ERR('invalidText');
      state.current.submissions[pp.id] = {
        id: nextId(state, 'answer'),
        playerId: pp.id,
        text,
        optionId: null,
        unanswered: false
      };
    }
    if (activeIds(state).every((id) => state.current.submissions[id]))
      state.current.type === 'choice' ? finishChoice(state, time) : beginGrading(state, time);
    else bump(state, time);
    return;
  }
  if (t === 'oralMark') {
    host(state, actorId);
    phase(state, 'oral');
    if (typeof payload.answered !== 'boolean') throw ERR('invalidJudgment');
    const id = payload.playerId,
      ids = activeIds(state);
    if (id !== ids[state.current.oralIndex]) throw ERR('wrongOralPlayer');
    state.current.submissions[id] = {
      id: nextId(state, 'answer'),
      playerId: id,
      text: null,
      optionId: null,
      unanswered: !payload.answered
    };
    state.current.oralMarked[id] = { answered: payload.answered };
    state.current.oralIndex++;
    if (state.current.oralIndex >= ids.length) {
      beginGrading(state, time);
    } else bump(state, time);
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
    if (state.current.judges[sub.playerId] !== undefined) throw ERR('alreadyJudged');
    state.current.judges[sub.playerId] = payload.correct;
    award(state, sub, payload.correct);
    const pending = Object.values(state.current.submissions).some(
      (s) =>
        !s.unanswered &&
        s.correct === undefined &&
        s.playerId !== state.hostId &&
        state.current.judges[s.playerId] === undefined
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
      state.current.judges[sub.playerId] = payload.correct;
      award(state, sub, payload.correct);
    }
    finalizeOpen(state, time);
    return;
  }
  if (t === 'gradeVote') {
    const pp = player(state, actorId);
    phase(state, 'grading');
    if (!state.hostOnline) throw ERR('hostOffline');
    if (state.settings.grading !== 'vote') throw ERR('hostGrading');
    if (state.current.gradeVotes[pp.id]) throw ERR('alreadyVoted');
    if (!Array.isArray(payload.votes)) throw ERR('invalidVote');
    const ballot = { voter: pp.id };
    for (const v of payload.votes) {
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw ERR('invalidVote');
      const sub = submission(state, v.answerId);
      if (!sub || sub.playerId === pp.id || sub.unanswered || typeof v.correct !== 'boolean')
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
    if (!state.hostOnline) throw ERR('hostOffline');
    if (typeof payload.correct !== 'boolean') throw ERR('invalidJudgment');
    const sub = submission(state, payload.answerId);
    if (!reviewer?.online || !sub || sub.reviewerId !== actorId || sub.correct !== undefined)
      throw ERR('invalidReview');
    award(state, sub, payload.correct);
    state.current.reviewQueue = state.current.reviewQueue.filter(
      (id) => state.current.submissions[id]?.correct === undefined
    );
    state.current.pendingReview = state.current.reviewQueue[0] || null;
    if (!state.current.pendingReview) finishRound(state, time);
    else bump(state, time);
    return;
  }
  if (t === 'next') {
    host(state, actorId);
    phase(state, 'results');
    if (command.roundId !== state.current?.id) throw ERR('staleRound');
    if (state.board.every((t) => t.used)) {
      state.phase = 'finished';
      state.finishedAt = time;
      state.current = null;
      bump(state, time);
      return;
    }
    state.current = null;
    state.votes = {};
    state.phase = 'selecting';
    state.selectionId = nextId(state, 'selection');
    state.selectionClosed = false;
    state.selectionDeadlineAt = state.settings.selection === 'vote' ? time + 30000 : null;
    bump(state, time);
    return;
  }
  if (t === 'reopenGrading') {
    host(state, actorId);
    phase(state, 'results');
    requireRound(state, command);
    const cur = state.current,
      last = state.history[state.history.length - 1];
    if (cur.type !== 'open' || last?.id !== cur.id) throw ERR('wrongPhase');
    state.history.pop();
    for (const p of players(state))
      p.score = state.history.reduce((sum, h) => sum + (h.answers[p.id]?.delta || 0), 0);
    cur.id = nextId(state, 'round');
    cur.judges = {};
    cur.gradeVotes = {};
    cur.reviewQueue = [];
    cur.pendingReview = null;
    cur.deadlineAt = null;
    for (const sub of Object.values(cur.submissions)) {
      delete sub.correct;
      delete sub.delta;
      delete sub.reviewerId;
      delete sub.votesFor;
      delete sub.votesAgainst;
    }
    beginGrading(state, time);
    return;
  }
  if (t === 'finish') {
    host(state, actorId);
    phase(state, 'selecting', 'answering', 'oral', 'grading', 'review', 'results');
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
  if (state.phase === 'answering' && cur.oralStage === 'thinking' && time >= cur.deadlineAt) {
    cur.oralStage = 'oral';
    cur.deadlineAt = null;
    state.phase = 'oral';
    bump(state, time);
  } else if (state.phase === 'answering' && !cur.oralStage && time >= cur.deadlineAt) {
    if (cur.type === 'choice') finishChoice(state, time);
    else {
      beginGrading(state, time);
    }
  }
  return state;
}
export function nextDeadline(state) {
  if (state.phase === 'answering') return state.current?.deadlineAt ?? null;
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
      unanswered: !!sub.unanswered
    };
  return {
    id: sub.id,
    playerId: sub.playerId,
    submitted: !sub.unanswered,
    unanswered: !!sub.unanswered,
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
    reveal = !!cur?.revealed || ['results', 'review', 'finished'].includes(state.phase);
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
  if (cur) {
    const q = question(state, tile(state, cur.tileId));
    current = {
      id: cur.id,
      tileId: cur.tileId,
      number: tile(state, cur.tileId)?.number,
      type: q.type,
      points: q.points,
      prompt: qPrompt(q),
      options: q.type === 'choice' ? options(q) : [],
      deadlineAt: cur.deadlineAt || null,
      submittedCount: Object.keys(cur.submissions).length,
      mySubmission: clone(cur.submissions[viewerId] || null),
      oralPlayerId: state.phase === 'oral' ? activeIds(state)[cur.oralIndex] || null : null,
      standardAnswer: reveal ? cur.standardAnswer || qAnswer(q) : null,
      answers: Object.values(cur.submissions).map((s) => answerProjection(s, viewerId, reveal)),
      gradingSubmittedCount: Object.keys(cur.gradeVotes).length
    };
  }
  return {
    protocol: PROTOCOL,
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
    settings: clone(state.settings),
    viewer: {
      id: viewerId,
      isHost: viewerId === state.hostId,
      isPlayer: !!view?.player,
      submitted: !!cur?.submissions?.[viewerId],
      gradeSubmitted: !!cur?.gradeVotes?.[viewerId],
      voteTileId: state.votes[viewerId] || null
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
      : 0
  };
}
