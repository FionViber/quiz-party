import Core from '../src/core.js';
import { error } from './auth.mjs';
export async function metadata(db) {
  const row = await db.prepare('SELECT value FROM metadata WHERE key = ?').bind('catalog').first();
  if (!row) throw error('BANK_NOT_READY', 503);
  return JSON.parse(row.value);
}
export async function boardPlan(db, settings) {
  const meta = await metadata(db),
    all = meta.categories.map((x) => x.id);
  const selected = settings.categoryIds === undefined ? all : settings.categoryIds;
  if (
    !Array.isArray(selected) ||
    !selected.length ||
    selected.some((x) => typeof x !== 'string' || !all.includes(x))
  )
    throw error('INVALID_CATEGORIES');
  const placeholders = selected.map(() => '?').join(',');
  const rows = await db
    .prepare(
      'SELECT id,difficulty,formats,open_points,tag FROM questions WHERE category_group IN (' +
        placeholders +
        ') ORDER BY id'
    )
    .bind(...selected)
    .all();
  const questions = rows.results.map((q) => ({
    id: q.id,
    difficulty: q.difficulty,
    formats: JSON.parse(q.formats),
    openPoints: q.open_points,
    tag: JSON.parse(q.tag)
  }));
  const plan = Core.planBoard({ questions }, [], settings.questionCount, secureRandom);
  if (!plan.feasible) throw error('INSUFFICIENT_QUESTIONS');
  const board = plan.board.slice();
  for (let i = board.length - 1; i > 0; i--) {
    const j = Math.floor(secureRandom() * (i + 1));
    [board[i], board[j]] = [board[j], board[i]];
  }
  const full = [];
  for (let at = 0; at < board.length; at += 40) {
    const ids = board.slice(at, at + 40).map((x) => x.qid);
    const batch = await db
      .prepare('SELECT content FROM questions WHERE id IN (' + ids.map(() => '?').join(',') + ')')
      .bind(...ids)
      .all();
    full.push(...batch.results.map((x) => JSON.parse(x.content)));
  }
  if (full.length !== board.length) throw error('BANK_NOT_READY', 503);
  return { board, questions: full, packIdentity: meta.packIdentity };
}
function secureRandom() {
  const data = new Uint32Array(1);
  crypto.getRandomValues(data);
  return data[0] / 4294967296;
}
