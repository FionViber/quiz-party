import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { encryptEnvelope, decryptEnvelope, generateSigningKey } from './admin-crypto.mjs';

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const sourceRoot = resolve(arg('--source') || process.cwd());
const adminScriptPath = resolve(arg('--admin-script') || join(sourceRoot, 'online/admin.js'));
const outputDir = resolve(arg('--output') || join(sourceRoot, 'dist'));
const publicKeyPath = resolve(arg('--public-key') || join(outputDir, 'admin-public-jwk.json'));
if (!arg('--source') || !arg('--admin-script') || !arg('--output')) {
  throw new Error(
    'Usage: build-admin.mjs --source ROOT --admin-script FILE --output DIR --public-key FILE'
  );
}
const tempBase = resolve(tmpdir());

const password = readFileSync(0, 'utf8').replace(/\r?\n$/, '');
if (!password) throw new Error('Administrator password must be provided through stdin');
mkdirSync(outputDir, { recursive: true });
const temp = mkdtempSync(join(tmpdir(), 'quiz-party-admin-'));
if (!temp.startsWith(tempBase + '\\') && !temp.startsWith(tempBase + '/')) {
  throw new Error('Unexpected temporary build directory');
}
try {
  const packageScript = join(sourceRoot, 'tools', 'package.py');
  execFileSync(process.env.PYTHON || 'python', [packageScript, '--output', temp], {
    cwd: sourceRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8'
  });
  const inlineScript = (path) => readFileSync(path, 'utf8').replace(/<\/script/gi, '<\\/script');
  const page = readFileSync(join(temp, 'index.html'), 'utf8')
    .replace(
      /<script[^>]+src="assets\/questions\.js[^"]*"[^>]*><\/script>/g,
      () => `<script>${inlineScript(join(temp, 'assets/questions.js'))}</script>`
    )
    .replace(
      /<script[^>]+src="assets\/vendor\/html2canvas\.min\.js[^"]*"[^>]*><\/script>/g,
      () => `<script>${inlineScript(join(temp, 'assets/vendor/html2canvas.min.js'))}</script>`
    )
    .replace(
      /<script[^>]+src="assets\/game\.js[^"]*"[^>]*><\/script>/g,
      () => `<script>${inlineScript(join(temp, 'assets/game.js'))}</script>`
    )
    .replace(
      /<link[^>]+href="assets\/game\.css[^"]*"[^>]*>/g,
      () =>
        `<style>${readFileSync(join(temp, 'assets/game.css'), 'utf8').replaceAll('../assets/', 'assets/')}</style>`
    );
  const previousPath = join(outputDir, 'admin.enc.json');
  const previousScript = join(outputDir, 'admin.enc.js');
  let keys;
  if (
    (existsSync(previousPath) || existsSync(previousScript)) &&
    !process.argv.includes('--rotate-credential')
  ) {
    let previousEnvelope;
    if (existsSync(previousPath)) previousEnvelope = JSON.parse(readFileSync(previousPath, 'utf8'));
    else {
      const script = readFileSync(previousScript, 'utf8').trim();
      const prefix = 'window.QuizEncryptedAdmin=';
      if (!script.startsWith(prefix) || !script.endsWith(';'))
        throw new Error('Invalid previous administrator script');
      previousEnvelope = JSON.parse(script.slice(prefix.length, -1));
    }
    const previous = await decryptEnvelope(previousEnvelope, password);
    const privateKeyJwk = previous.adminPrivateKeyJwk;
    if (!privateKeyJwk?.d) throw new Error('Previous administrator credential is missing');
    const { d: _private, ...publicParts } = privateKeyJwk;
    keys = { privateKeyJwk, publicKeyJwk: { ...publicParts, key_ops: ['verify'] } };
  } else keys = await generateSigningKey();
  const envelope = await encryptEnvelope(
    {
      offlineHtml: page,
      adminScript: readFileSync(adminScriptPath, 'utf8'),
      adminPrivateKeyJwk: keys.privateKeyJwk
    },
    password
  );
  writeFileSync(join(outputDir, 'admin.enc.json'), JSON.stringify(envelope) + '\n', 'utf8');
  writeFileSync(
    join(outputDir, 'admin.enc.js'),
    `window.QuizEncryptedAdmin=${JSON.stringify(envelope)};\n`,
    'utf8'
  );
  writeFileSync(publicKeyPath, JSON.stringify(keys.publicKeyJwk) + '\n', 'utf8');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
