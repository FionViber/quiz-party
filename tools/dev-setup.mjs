import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const password = fs.readFileSync(0, 'utf8').trim();
if (!password) throw new Error('Provide build password on stdin');
function run(args, input) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env
  });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout).slice(-5000));
  console.log(
    result.stdout.length > 3000 ? 'Completed: ' + args.slice(0, 4).join(' ') : result.stdout.trim()
  );
}
run(
  [
    'tools/build-admin.mjs',
    '--source',
    root,
    '--admin-script',
    path.join(root, 'online/admin.js'),
    '--output',
    path.join(root, 'dist-online'),
    '--public-key',
    path.join(root, 'worker/admin-public-jwk.json')
  ],
  password
);
run(['tools/build-online.mjs', 'http://127.0.0.1:8787']);
const publicJwk = JSON.parse(
  fs.readFileSync(path.join(root, 'worker/admin-public-jwk.json'), 'utf8')
);
const configPath = path.join(root, 'worker/wrangler.jsonc'),
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
config.vars.ADMIN_PUBLIC_JWK = JSON.stringify(publicJwk);
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
const varsPath = path.join(root, 'worker/.dev.vars');
if (!fs.existsSync(varsPath))
  fs.writeFileSync(
    varsPath,
    'TOKEN_SECRET="' +
      crypto.randomBytes(48).toString('base64url') +
      '"\nALLOWED_ORIGINS="http://127.0.0.1:8610,http://localhost:8610,https://fionviber.github.io"\n'
  );
if (!process.argv.includes('--skip-db')) {
  run(['tools/seed-bank.mjs']);
  const wrangler = path.join(root, 'node_modules/wrangler/bin/wrangler.js');
  run([wrangler, 'd1', 'migrations', 'apply', 'quiz-party', '--local', '--config', configPath]);
  run([
    wrangler,
    'd1',
    'execute',
    'quiz-party',
    '--local',
    '--config',
    configPath,
    '--file',
    path.join(root, 'private/bank.sql')
  ]);
}
console.log('Local bank, credentials and encrypted client prepared.');
