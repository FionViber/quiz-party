#!/usr/bin/env python3
"""Build the offline game into a separate, empty output directory."""
from pathlib import Path
import argparse
import hashlib
import re
import shutil
import build

ROOT = Path(__file__).resolve().parents[1]


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:10]


def package(output: Path) -> None:
    output = output.resolve()
    if output == ROOT or ROOT in output.parents:
        raise ValueError('Choose an output directory outside the source folder')
    if output.exists() and any(output.iterdir()):
        raise ValueError('Output directory must be empty')
    build.build()
    output.mkdir(parents=True, exist_ok=True)
    (output / '.nojekyll').write_text('', encoding='utf-8')
    (output / 'assets/vendor').mkdir(parents=True)
    (output / 'docs').mkdir()
    for directory in ('audio', 'fonts'):
        shutil.copytree(ROOT / 'assets' / directory, output / 'assets' / directory)
    for name in ('html2canvas.min.js', 'html2canvas.LICENSE'):
        shutil.copy2(ROOT / 'src/vendor' / name, output / 'assets/vendor' / name)
    shutil.copy2(ROOT / 'docs/题库来源与许可.txt', output / 'docs/题库来源与许可.txt')
    about = (ROOT / 'README.html').read_text(encoding='utf-8').replace('src/vendor/html2canvas.LICENSE', 'assets/vendor/html2canvas.LICENSE')
    (output / 'README.html').write_text(about, encoding='utf-8')

    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    scripts = re.findall(r'<script src="([^"?]+)(?:\?[^"]*)?"></script>', html)
    if len(scripts) != len(set(scripts)):
        raise ValueError('Duplicate script in index.html')
    modules = [p for p in scripts if p != 'data/builtin.js' and '/vendor/' not in p]
    javascript = '\n;\n'.join((ROOT / p).read_text(encoding='utf-8') for p in modules)
    (output / 'assets/game.js').write_text(javascript, encoding='utf-8')
    shutil.copy2(ROOT / 'src/style.css', output / 'assets/game.css')
    shutil.copy2(ROOT / 'data/builtin.js', output / 'assets/questions.js')

    html = re.sub(r'^[ \t]*<script src="[^"\r\n]+"></script>[ \t]*\r?\n?', '', html, flags=re.MULTILINE)
    references = []
    for file in ('assets/questions.js', 'assets/vendor/html2canvas.min.js', 'assets/game.js'):
        references.append(f'  <script src="{file}?v={digest((output / file).read_bytes())}"></script>')
    html = html.replace('<!-- SCRIPTS -->', '<!-- SCRIPTS -->\n' + '\n'.join(references))
    html = re.sub(r'href="src/style.css[^\"]*"', f'href="assets/game.css?v={digest((output / "assets/game.css").read_bytes())}"', html)
    if re.search(r'(?:src|href)="(?:src|data)/', html):
        raise ValueError('Source-only references remain in the built page')
    (output / 'index.html').write_text(html, encoding='utf-8')
    print(f'Built game: {output}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    try:
        package(args.output)
    except (OSError, ValueError) as error:
        parser.exit(1, f'Error: {error}\n')
