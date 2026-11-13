import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import './build-readme.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  out = path.join(root, 'dist-online');
const apiBase = process.argv[2] || 'http://127.0.0.1:8787';
const storageNamespace = process.argv[3] || '';
if (!/^[a-z0-9-]{0,32}$/.test(storageNamespace)) throw new Error('Invalid storage namespace');
if (!/^https?:\/\//.test(apiBase)) throw new Error('API URL must be HTTP or HTTPS');
fs.mkdirSync(out, { recursive: true });
for (const folder of ['audio', 'fonts'])
  fs.cpSync(path.join(root, 'assets', folder), path.join(out, 'assets', folder), {
    recursive: true
  });
fs.mkdirSync(path.join(out, 'online'), { recursive: true });
fs.mkdirSync(path.join(out, 'assets/vendor'), { recursive: true });
fs.mkdirSync(path.join(out, 'docs'), { recursive: true });
for (const name of [
  'i18n.js',
  'ui.js',
  'keys.js',
  'history.js',
  'history-store.js',
  'results.js',
  'online.css',
  'access.js',
  'transport.js',
  'main.js',
  'application.css'
])
  fs.copyFileSync(path.join(root, 'online', name), path.join(out, 'online', name));
fs.copyFileSync(path.join(root, 'src/audio.js'), path.join(out, 'online/audio.js'));
fs.copyFileSync(path.join(root, 'src/player-names.js'), path.join(out, 'online/player-names.js'));
for (const name of ['html2canvas.min.js', 'html2canvas.LICENSE'])
  fs.copyFileSync(path.join(root, 'src/vendor', name), path.join(out, 'assets/vendor', name));
fs.copyFileSync(
  path.join(root, 'docs/题库来源与许可.txt'),
  path.join(out, 'docs/题库来源与许可.txt')
);
fs.copyFileSync(
  path.join(root, 'docs/PageCrypt-LICENSE.txt'),
  path.join(out, 'docs/PageCrypt-LICENSE.txt')
);
fs.writeFileSync(
  path.join(out, 'README.html'),
  fs
    .readFileSync(path.join(root, 'README.html'), 'utf8')
    .replaceAll('src/vendor/html2canvas.LICENSE', 'assets/vendor/html2canvas.LICENSE')
);
fs.writeFileSync(path.join(out, '.nojekyll'), '');
const shell = fs.readFileSync(path.join(root, 'online/shell.html'), 'utf8');
const asset = (name) =>
  name +
  '?v=' +
  crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(out, name)))
    .digest('hex')
    .slice(0, 12);
const adminAsset = fs.existsSync(path.join(out, 'admin.enc.js'))
  ? asset('admin.enc.js')
  : 'admin.enc.js';
fs.writeFileSync(
  path.join(out, 'config.js'),
  'window.QuizConfig=' + JSON.stringify({ apiBase, adminAsset, storageNamespace }) + ';\n'
);
const html =
  '<!doctype html>\n<html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="referrer" content="no-referrer"><title>问答派对 · Quiz Party</title>' +
  ['online/online.css', 'online/application.css']
    .map((name) => '<link rel="stylesheet" href="' + asset(name) + '">')
    .join('') +
  '</head><body>' +
  shell +
  [
    'config.js',
    'assets/vendor/html2canvas.min.js',
    'online/audio.js',
    'online/player-names.js',
    'online/i18n.js',
    'online/access.js',
    'online/transport.js',
    'online/keys.js',
    'online/results.js',
    'online/history.js',
    'online/history-store.js',
    'online/ui.js',
    'online/main.js'
  ]
    .map((name) => '<script src="' + asset(name) + '"></script>')
    .join('') +
  '</body></html>';
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log('Built public online client. Administrator payload is built separately.');
