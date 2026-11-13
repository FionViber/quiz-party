import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const databaseId = process.argv[2];
if (!/^[0-9a-f-]{36}$/i.test(databaseId || '')) throw new Error('Provide the D1 database ID');
const config = JSON.parse(fs.readFileSync(path.join(root, 'worker/wrangler.jsonc'), 'utf8'));
config.d1_databases[0].database_id = databaseId;
config.vars.ALLOWED_ORIGINS = 'https://fionviber.github.io';
config.vars.ADMIN_PUBLIC_JWK = JSON.stringify(
  JSON.parse(fs.readFileSync(path.join(root, 'worker/admin-public-jwk.json'), 'utf8'))
);
fs.writeFileSync(
  path.join(root, 'worker/wrangler.production.jsonc'),
  JSON.stringify(config, null, 2) + '\n'
);
console.log('Production configuration prepared.');
