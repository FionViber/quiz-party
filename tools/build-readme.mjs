import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'README.md'), 'utf8').replaceAll('\r\n', '\n');
const escape = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const inline = (value) => escape(value).replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
function renderBlocks(text) {
  const output = [];
  let list = [];
  const flush = () => {
    if (list.length) {
      output.push('<ol>' + list.join('') + '</ol>');
      list = [];
    }
  };
  for (const paragraph of text.trim().split(/\n\s*\n/)) {
    const step = paragraph.match(/^(\d+)\.\s+([\s\S]+)$/);
    if (step) {
      list.push('<li value="' + step[1] + '">' + inline(step[2].replaceAll('\n', ' ')) + '</li>');
      continue;
    }
    flush();
    if (paragraph.startsWith('#### ')) output.push('<h3>' + inline(paragraph.slice(5)) + '</h3>');
    else if (paragraph.startsWith('### '))
      output.push('<h2>' + inline(paragraph.slice(4)) + '</h2>');
    else output.push('<p>' + inline(paragraph.replaceAll('\n', ' ')) + '</p>');
  }
  flush();
  return output.join('\n');
}
const ids = { 简体中文: 'zh-hans', English: 'en', 繁體中文: 'zh-hant' },
  blocks = source.split(/\n## /).slice(1);
const sections = blocks
  .map((block) => {
    const end = block.indexOf('\n'),
      name = block.slice(0, end),
      id = ids[name];
    if (!id) throw new Error('Unknown README language');
    const body = renderBlocks(block.slice(end));
    return (
      '<section id="' +
      id +
      '" lang="' +
      (id === 'en' ? 'en' : id === 'zh-hans' ? 'zh-Hans' : 'zh-Hant') +
      '">' +
      body +
      '</section>'
    );
  })
  .join('\n');
const html =
  '<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quiz Party · 问答派对</title>' +
  '<style>@font-face{font-family:SourceHan;src:url(assets/fonts/SourceHanSansSC-VF.ttf.woff2)}*{box-sizing:border-box}body{margin:0;background:#f5f0e6;color:#000;font:18px/1.7 SourceHan,sans-serif}main{max-width:1000px;margin:32px auto;padding:32px;border:3px solid #000;box-shadow:6px 6px #000;background:white}header{display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between}h1{font-size:32px;margin:0}nav{display:flex;flex-wrap:wrap;gap:10px}a{color:inherit}nav a,.home{padding:6px 12px;border:2px solid #000;text-decoration:none;font-weight:800}nav a[aria-current=true]{background:#ffeb3b}h2{margin:30px 0 12px;font-size:26px}p{margin:12px 0}kbd{font-size:12px;border:1px solid;padding:1px 4px}section[hidden]{display:none}@media(max-width:700px){main{margin:16px;padding:22px}body{font-size:17px}h1{font-size:26px}}</style></head><body><main><header><h1>Quiz Party · 问答派对</h1><a class="home" href="index.html">← <kbd>Q</kbd></a></header>' +
  '<nav aria-label="Language"><a href="#zh-hans">简体中文 <kbd>1</kbd></a><a href="#en">English <kbd>2</kbd></a><a href="#zh-hant">繁體中文 <kbd>3</kbd></a></nav>' +
  sections +
  '<script>function show(){var id=location.hash.slice(1)||"zh-hans";if(!["zh-hans","en","zh-hant"].includes(id))id="zh-hans";document.querySelectorAll("section").forEach(s=>s.hidden=s.id!==id);document.querySelectorAll("nav a").forEach(a=>a.setAttribute("aria-current",a.hash==="#"+id));document.documentElement.lang=document.getElementById(id).lang;}addEventListener("hashchange",show);addEventListener("keydown",e=>{if(e.ctrlKey||e.metaKey||e.altKey||e.shiftKey||e.repeat)return;var id={Digit1:"zh-hans",Digit2:"en",Digit3:"zh-hant"}[e.code];if(id){e.preventDefault();location.hash=id;}if(e.code==="KeyQ")location.href="index.html";});show();</script></main></body></html>';
fs.writeFileSync(path.join(root, 'README.html'), html);
console.log('Generated the three-language About page.');
