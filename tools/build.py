#!/usr/bin/env python3
"""Validate registered UTF-8 JSON packs and regenerate data/builtin.js. Standard library only."""
from __future__ import annotations
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LANGS = ('en', 'zh-Hans', 'zh-Hant')
ID = re.compile(r'^[A-Za-z0-9._-]{1,120}$')

def validate(pack: object) -> list[str]:
    """Validate canonical version-2 packs. Includes cross-field references."""
    errors: list[str] = []
    def text(v: object) -> bool:
        return isinstance(v, str) and bool(v.strip()) and len(v) <= 12000
    def identifier(v: object) -> bool:
        return isinstance(v, str) and ID.fullmatch(v) is not None
    def triple(v: object, path: str) -> None:
        for lang in LANGS:
            if not isinstance(v, dict) or not text(v.get(lang)):
                errors.append(f'{path}.{lang}: missing translated text')
    if not isinstance(pack, dict):
        return ['pack: expected a JSON object']
    if type(pack.get('schemaVersion')) is not int or pack['schemaVersion'] not in (2, 3):
        errors.append('schemaVersion: expected 2 or 3. Import legacy packs in the game and export to convert them.')
    canonical = pack.get('schemaVersion') == 3
    if not identifier(pack.get('id')):
        errors.append('id: invalid identifier')
    if not text(pack.get('version')):
        errors.append('version: required string')
    triple(pack.get('title'), 'title')
    if 'description' in pack:
        triple(pack['description'], 'description')
    locales = pack.get('locales')
    if not isinstance(locales, list) or len(locales) != 3 or any(l not in locales for l in LANGS):
        errors.append('locales: include exactly en, zh-Hans, and zh-Hant')
    categories = pack.get('categories')
    if not isinstance(categories, list) or not categories:
        errors.append('categories: expected a nonempty array')
        categories = []
    cat_ids: set[str] = set()
    for i, c in enumerate(categories):
        path = f'categories[{i}]'
        if not isinstance(c, dict):
            errors.append(f'{path}: expected an object')
            continue
        cid = c.get('id')
        if not identifier(cid):
            errors.append(f'{path}.id: invalid identifier')
        elif cid in cat_ids:
            errors.append(f'{path}.id: duplicate')
        else:
            cat_ids.add(cid)
        triple(c.get('name'), path + '.name')
    questions = pack.get('questions')
    if not isinstance(questions, list) or len(questions) > 50000:
        errors.append('questions: expected an array with at most 50000 items')
        questions = []
    qids: set[str] = set()
    for i, q in enumerate(questions):
        path = f'questions[{i}]'
        if not isinstance(q, dict):
            errors.append(f'{path}: expected an object')
            continue
        qid = q.get('id')
        if not identifier(qid):
            errors.append(f'{path}.id: invalid identifier')
        elif qid in qids:
            errors.append(f'{path}.id: duplicate')
        else:
            qids.add(qid)
        if not isinstance(q.get('categoryId'), str) or q['categoryId'] not in cat_ids:
            errors.append(f'{path}.categoryId: unknown category')
        if type(q.get('difficulty')) is not int or q['difficulty'] not in (1, 2, 3, 4):
            errors.append(f'{path}.difficulty: expected integer 1 to 4')
        if any(k in q for k in ('type', 'points', 'level')):
            errors.append(f'{path}: type, points, and level are derived, not stored')
        forms = q.get('formats', ['choice', 'open'])
        if not isinstance(forms, list) or not forms or len(forms) > 2 or any(f not in ('choice', 'open') for f in forms) or len(set(forms)) != len(forms):
            errors.append(f'{path}.formats: invalid formats list')
            forms = []
        if 'tag' in q:
            tag = q['tag']
            if isinstance(tag, str):
                if not text(tag):
                    errors.append(f'{path}.tag: expected nonempty text')
            elif isinstance(tag, dict):
                triple(tag, path + '.tag')
            else:
                errors.append(f'{path}.tag: expected text or three translated labels')
        choice, spoken = 'choice' in forms, 'open' in forms
        if canonical and spoken and (type(q.get('openPoints')) is not int or q['openPoints'] != q['difficulty'] * 200):
            errors.append(f'{path}.openPoints: schema 3 spoken points must equal difficulty × 200')
        if 'openPoints' in q and (not canonical or type(q['openPoints']) is not int or q['openPoints'] not in (200, 400, 600, 800)):
            errors.append(f'{path}.openPoints: expected 200, 400, 600, or 800')
        options = q.get('options') if isinstance(q.get('options'), list) else []
        if choice:
            if not 3 <= len(options) <= 6:
                errors.append(f'{path}.options: provide 3 to 6 options')
            if any(not identifier(o) for o in options):
                errors.append(f'{path}.options: invalid identifier')
            elif len(set(options)) != len(options):
                errors.append(f'{path}.options: duplicate identifier')
            if q.get('correctOptionId') not in options:
                errors.append(f'{path}.correctOptionId: unknown option')
        elif 'options' in q or 'correctOptionId' in q:
            errors.append(f'{path}: open-only questions cannot contain option fields')
        trs = q.get('locales') if isinstance(q.get('locales'), dict) else {}
        any_ex = any(isinstance(trs.get(l), dict) and text(trs[l].get('explanation')) for l in LANGS)
        any_open = any(isinstance(trs.get(l), dict) and 'openPrompt' in trs[l] for l in LANGS)
        any_answer = any(isinstance(trs.get(l), dict) and 'answer' in trs[l] for l in LANGS)
        for l in LANGS:
            tr = trs.get(l) if isinstance(trs.get(l), dict) else {}
            lp = f'{path}.locales.{l}'
            if not text(tr.get('prompt')):
                errors.append(f'{lp}.prompt: required translated question')
            if choice:
                labels = tr.get('optionLabels') if isinstance(tr.get('optionLabels'), dict) else {}
                for o in options:
                    if not isinstance(o, str) or not text(labels.get(o)):
                        errors.append(f'{lp}.optionLabels.{o}: required translated option')
            if ((spoken and not choice) or any_answer) and not text(tr.get('answer')):
                errors.append(f'{lp}.answer: required translated answer')
            if any_open and not text(tr.get('openPrompt')):
                errors.append(f'{lp}.openPrompt: supply all three open prompts')
            if any_ex and not text(tr.get('explanation')):
                errors.append(f'{lp}.explanation: supply all three explanations or omit all three')
            if 'explanation' in tr and (not isinstance(tr['explanation'], str) or len(tr['explanation']) > 12000):
                errors.append(f'{lp}.explanation: invalid text')
            if 'acceptedAnswers' in tr and (not isinstance(tr['acceptedAnswers'], list) or not tr['acceptedAnswers'] or any(not text(a) for a in tr['acceptedAnswers'])):
                errors.append(f'{lp}.acceptedAnswers: expected a nonempty array of strings')
            if 'rubric' in tr and not text(tr['rubric']):
                errors.append(f'{lp}.rubric: expected nonempty text')
    return errors

def load_packs() -> list[dict]:
    data_root = (ROOT / 'data').resolve()
    manifest = json.loads((data_root / 'manifest.json').read_text(encoding='utf-8-sig'))
    if manifest.get('schemaVersion') != 2 or not isinstance(manifest.get('packs'), list) or not manifest['packs']:
        raise ValueError('data/manifest.json: expected schemaVersion 2 and a nonempty packs array')
    packs = []
    ids = set()
    for relative in manifest['packs']:
        if not isinstance(relative, str):
            raise ValueError('Manifest pack paths must be strings')
        path = (data_root / relative).resolve()
        if not path.is_relative_to(data_root):
            raise ValueError(f'Pack path must stay inside data/: {relative}')
        if path.stat().st_size > 20 * 1024 * 1024:
            raise ValueError(f'Pack exceeds 20 MB: {relative}')
        pack = json.loads(path.read_text(encoding='utf-8-sig'))
        errors = validate(pack)
        if errors:
            raise ValueError(relative + '\n' + '\n'.join(errors[:50]))
        if pack['id'] in ids:
            raise ValueError(f'Duplicate pack ID: {pack["id"]}')
        ids.add(pack['id'])
        packs.append(pack)
    return packs

def build() -> Path:
    """Generate only the browser-readable offline JS data module from editable JSON."""
    packs = load_packs()
    json_text = json.dumps(packs, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
    output = ROOT / 'data' / 'builtin.js'
    output.write_text('window.NEO_BUILTIN = ' + json_text + ';\n', encoding='utf-8')
    print(f'Updated {output.relative_to(ROOT)}: {len(packs)} packs, {sum(len(p["questions"]) for p in packs)} questions')
    return output

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--validate-only', action='store_true', help='Validate every pack in the manifest without rebuilding')
    parser.add_argument('--validate', type=Path, help='Validate one standalone question-pack JSON file')
    args = parser.parse_args()
    try:
        if args.validate:
            p = json.loads(args.validate.read_text(encoding='utf-8-sig'))
            errors = validate(p)
            if errors:
                raise ValueError('\n'.join(errors))
            print(f'Valid: {args.validate}')
        elif args.validate_only:
            packs = load_packs()
            print(f'Valid: {len(packs)} packs')
        else:
            build()
    except (OSError, ValueError, TypeError) as error:
        parser.exit(1, f'Error: {error}\n')

if __name__ == '__main__':
    main()
