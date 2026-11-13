import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Core from '../src/core.js';
import Categories from '../src/category-filter.js';
import Archive from '../src/archive.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = JSON.parse(fs.readFileSync(path.join(root, 'data/packs/builtin-bank.json'), 'utf8'));
const issues = Core.validatePack(source);
if (issues.length) throw new Error('Invalid bank: ' + JSON.stringify(issues.slice(0, 3)));
const pack = Core.normalizePack(source),
  groups = Categories.listGroups(pack);
const sql = (value) => (value == null ? 'NULL' : "'" + String(value).replaceAll("'", "''") + "'");
const meta = {
  packIdentity: {
    id: pack.id,
    version: pack.version,
    schemaVersion: pack.schemaVersion,
    fingerprint: Archive.fingerprint(pack)
  },
  categories: groups.map((g) => ({ id: g.id, labels: g.labels, name: g.labels, count: g.count }))
};
const lines = ['DELETE FROM questions;'];
lines.push(
  'INSERT OR REPLACE INTO metadata(key,value) VALUES(' +
    sql('catalog') +
    ',' +
    sql(JSON.stringify(meta)) +
    ');'
);
for (const q of pack.questions) {
  const group = Categories.groupForQuestion(pack, q);
  lines.push(
    'INSERT INTO questions(id,category_group,difficulty,formats,open_points,tag,content) VALUES(' +
      [
        q.id,
        group.id,
        q.difficulty,
        JSON.stringify(Core.forms(q)),
        q.openPoints,
        JSON.stringify(group.labels),
        JSON.stringify(q)
      ]
        .map(sql)
        .join(',') +
      ');'
  );
}
const output = path.join(root, 'private');
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'bank.sql'), lines.join('\n') + '\n');
fs.writeFileSync(path.join(output, 'catalog.json'), JSON.stringify(meta));
console.log(
  JSON.stringify({
    questions: pack.questions.length,
    categories: groups.length,
    fingerprint: meta.packIdentity.fingerprint
  })
);
