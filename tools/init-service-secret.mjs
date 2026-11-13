import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'node_modules/wrangler/bin/wrangler.js'),
  config = path.join(root, 'worker/wrangler.production.jsonc');
const listed = spawnSync(process.execPath, [cli, 'secret', 'list', '--config', config], {
  cwd: root,
  encoding: 'utf8',
  windowsHide: true
});
if (listed.status !== 0) throw new Error('Could not inspect service secrets');
const secrets = JSON.parse(listed.stdout);
if (secrets.some((s) => s.name === 'TOKEN_SECRET'))
  console.log('Existing service secret retained.');
else {
  const secret = crypto.randomBytes(48).toString('base64url');
  const result = spawnSync(
    process.execPath,
    [cli, 'secret', 'put', 'TOKEN_SECRET', '--config', config],
    { cwd: root, encoding: 'utf8', input: secret + '\n', windowsHide: true }
  );
  if (result.status !== 0)
    throw new Error((result.stderr || result.stdout).replaceAll(secret, '[redacted]'));
  console.log('Service signing secret stored in Cloudflare.');
}
