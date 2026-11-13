#!/usr/bin/env python3
"""Create the reviewed public and source release packages."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import urllib.parse
import zipfile
from pathlib import Path


SOURCE = Path(__file__).resolve().parent.parent
PRIVATE = (SOURCE / "private").resolve()
MARKER = ".package-online-owned"

PUBLIC_ROOT = {
    "index.html",
    "config.js",
    "admin.enc.js",
    "README.html",
    ".nojekyll",
}
PUBLIC_ONLINE = {
    "i18n.js",
    "ui.js",
    "keys.js",
    "history.js",
    "history-store.js",
    "results.js",
    "online.css",
    "access.js",
    "transport.js",
    "main.js",
    "application.css",
    "audio.js",
    "player-names.js",
}
PUBLIC_ASSETS = {
    "audio": {"BGM01.mp3"},
    "fonts": {"LICENSE.txt", "SourceHanSansSC-VF.ttf.woff2"},
    "vendor": {"html2canvas.min.js", "html2canvas.LICENSE"},
}
PUBLIC_DOCS = {"题库来源与许可.txt", "PageCrypt-LICENSE.txt"}
SOURCE_ROOT = {
    "index.html",
    "README.md",
    "README.html",
    ".gitignore",
    "package.json",
    "pnpm-lock.yaml",
}
FORBIDDEN_PARTS = {
    ".git",
    ".wrangler",
    "node_modules",
    "__pycache__",
    "private",
    "tests",
}
SENSITIVE_SUFFIXES = {
    ".map",
    ".sqlite",
    ".sqlite-shm",
    ".sqlite-wal",
    ".db",
    ".secret",
    ".pem",
    ".key",
}


class PackageError(RuntimeError):
    pass


def fail(message: str) -> "NoReturn":
    raise PackageError(message)


def inside(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return path != parent
    except ValueError:
        return False


def safe_output(raw: str | None) -> Path:
    path = (Path(raw) if raw else PRIVATE / "release").resolve()
    if not inside(path, PRIVATE):
        fail(f"output must be inside {PRIVATE}: {path}")
    if path.name in {"private", ".", ".."}:
        fail("invalid output directory")
    if path.exists():
        if not path.is_dir():
            fail(f"output is not a directory: {path}")
        marker = path / MARKER
        children = list(path.iterdir())
        if children and not marker.is_file():
            fail(f"refusing to clean unowned output: {path}")
        if marker.is_file():
            for child in children:
                if child.is_symlink():
                    fail(f"refusing to remove symlink/junction: {child}")
                resolved = child.resolve()
                if resolved != path and not inside(resolved, path):
                    fail(f"output child resolves outside output: {child}")
                if child.is_dir():
                    shutil.rmtree(child)
                else:
                    child.unlink()
    else:
        path.mkdir(parents=True)
    return path


def rel_files(root: Path) -> set[str]:
    return {
        p.relative_to(root).as_posix()
        for p in root.rglob("*")
        if p.is_file()
    }


def reject_sensitive(rel: str) -> None:
    parts = Path(rel).parts
    if any(part in FORBIDDEN_PARTS for part in parts):
        fail(f"forbidden path: {rel}")
    name = parts[-1].lower()
    if any(name.endswith(suffix) for suffix in SENSITIVE_SUFFIXES):
        fail(f"forbidden sensitive file: {rel}")
    if name.endswith(".tmp") or name.endswith(".bak"):
        fail(f"forbidden cache/backup file: {rel}")


def copy_file(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def validate_public_build() -> None:
    root = SOURCE / "dist-online"
    if not root.is_dir():
        fail(f"missing public build: {root}")
    expected = set(PUBLIC_ROOT)
    expected |= {f"online/{x}" for x in PUBLIC_ONLINE}
    expected |= {f"assets/{group}/{x}" for group, names in PUBLIC_ASSETS.items() for x in names}
    expected |= {f"docs/{x}" for x in PUBLIC_DOCS}
    actual = rel_files(root)
    # Keep the private JSON form available for local tests, but never stage it.
    unexpected = sorted(actual - expected - {"admin.enc.json"})
    missing = sorted(expected - actual)
    if unexpected:
        fail("unexpected public build files: " + ", ".join(unexpected))
    if missing:
        fail("missing public build files: " + ", ".join(missing))
    for rel in actual:
        reject_sensitive(rel)

    config = (root / "config.js").read_text(encoding="utf-8")
    match = re.fullmatch(r"window\.QuizConfig=(\{.*\});\s*", config, re.S)
    if not match:
        fail("config.js is not the expected QuizConfig assignment")
    try:
        value = json.loads(match.group(1))
    except json.JSONDecodeError as exc:
        fail(f"invalid config.js JSON: {exc}")
    api = value.get("apiBase")
    parsed = urllib.parse.urlparse(api) if isinstance(api, str) else None
    if not parsed or parsed.scheme != "https" or not parsed.netloc:
        fail("formal release requires an HTTPS config.apiBase")
    if parsed.hostname and parsed.hostname.lower() in {"localhost", "127.0.0.1", "::1"}:
        fail("formal release cannot target localhost config.apiBase")
    namespace = value.get("storageNamespace", "")
    if not isinstance(namespace, str):
        fail("config.storageNamespace must be a string")

    admin = (root / "admin.enc.js").read_text(encoding="utf-8")
    am = re.fullmatch(r"window\.QuizEncryptedAdmin=(\{.*\});\s*", admin, re.S)
    if not am:
        fail("admin.enc.js is not the expected encrypted assignment")
    try:
        envelope = json.loads(am.group(1))
    except json.JSONDecodeError as exc:
        fail(f"invalid admin envelope JSON: {exc}")
    if envelope.get("format") != "quizparty-admin-v1":
        fail("unexpected admin envelope format")
    if not isinstance(envelope.get("payload"), str) or not envelope["payload"]:
        fail("admin envelope payload is missing")
    if any(token in admin for token in ("adminPrivateKeyJwk", "privateKeyJwk", '"d"')):
        fail("private signing key appears in plaintext public assets")


def stage_public(stage: Path) -> None:
    src = SOURCE / "dist-online"
    for rel in sorted(PUBLIC_ROOT):
        copy_file(src / rel, stage / rel)
    for name in sorted(PUBLIC_ONLINE):
        copy_file(src / "online" / name, stage / "online" / name)
    for group, names in PUBLIC_ASSETS.items():
        for name in sorted(names):
            copy_file(src / "assets" / group / name, stage / "assets" / group / name)
    for name in sorted(PUBLIC_DOCS):
        copy_file(src / "docs" / name, stage / "docs" / name)


def source_allowed(rel: str) -> bool:
    parts = Path(rel).parts
    top = parts[0]
    if top in FORBIDDEN_PARTS or any(part in FORBIDDEN_PARTS for part in parts):
        return False
    if any(part.lower().endswith(s) for part in parts for s in SENSITIVE_SUFFIXES):
        return False
    if top == "data" and rel == "data/builtin.js":
        return False
    if top == "tools":
        return parts[-1].endswith((".py", ".mjs")) and "__pycache__" not in parts
    if top == "worker":
        return (
            parts[-1].endswith(".mjs")
            or parts[-1].endswith(".sql")
            or parts[-1] in {"admin-public-jwk.json"}
            or parts[-1].startswith("wrangler.") and parts[-1].endswith(".jsonc")
        )
    return top in {"src", "online", "assets", "data", "docs"} or rel in SOURCE_ROOT


def stage_source(stage: Path) -> None:
    tops = ("src", "online", "assets", "data", "docs", "tools", "worker")
    for top in tops:
        base = SOURCE / top
        for current, dirs, files in os.walk(base):
            current_path = Path(current)
            dirs[:] = [d for d in dirs if d not in {"__pycache__", ".wrangler", "node_modules"}]
            for name in files:
                src = current_path / name
                rel = src.relative_to(SOURCE).as_posix()
                if rel in {"data/builtin.js", "worker/.dev.vars"}:
                    continue
                if not source_allowed(rel):
                    fail(f"unexpected or sensitive source file: {rel}")
    for rel in sorted(SOURCE_ROOT):
        if not (SOURCE / rel).is_file():
            fail(f"missing source root file: {rel}")
        copy_file(SOURCE / rel, stage / rel)
    for top in tops:
        base = SOURCE / top
        for current, dirs, files in os.walk(base):
            current_path = Path(current)
            dirs[:] = [d for d in dirs if d not in {"__pycache__", ".wrangler", "node_modules"}]
            for name in files:
                src = current_path / name
                rel = src.relative_to(SOURCE).as_posix()
                if rel in {"data/builtin.js", "worker/.dev.vars"}:
                    continue
                if source_allowed(rel):
                    copy_file(src, stage / rel)


def zip_tree(directory: Path, archive: Path, root_name: str) -> None:
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for file in sorted(directory.rglob("*")):
            if file.is_file():
                rel = file.relative_to(directory).as_posix()
                zf.write(file, f"{root_name}/{rel}")


def manifest(output: Path, public: Path, source: Path) -> None:
    def digest_tree(root: Path) -> list[dict[str, object]]:
        result = []
        for file in sorted(root.rglob("*")):
            if file.is_file():
                data = file.read_bytes()
                result.append({"path": file.relative_to(root).as_posix(), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
        return result
    record = {
        "format": "quiz-party-release-manifest-v1",
        "public": digest_tree(public),
        "source": digest_tree(source),
        "archives": ["Quiz-Party-v6.0-Release.zip", "Quiz-Party-v6.0-Source.zip"],
    }
    (output / "manifest.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", help="owned output directory under source/private")
    parser.add_argument("--stage-only", action="store_true")
    parser.add_argument("--preview", action="store_true")
    args = parser.parse_args()
    output = safe_output(args.output)
    # Claim the freshly-created/previously-owned directory before doing any
    # further work, so a failed build can be safely retried and cleaned.
    (output / MARKER).write_text("owned by tools/package-online.py\n", encoding="utf-8")
    validate_public_build()
    if not args.preview:
        config = json.loads(
            re.fullmatch(
                r"window\.QuizConfig=(\{.*\});\s*",
                (SOURCE / "dist-online" / "config.js").read_text(encoding="utf-8"),
                re.S,
            ).group(1)
        )
        if config.get("storageNamespace", "") != "":
            fail("formal release requires empty config.storageNamespace; use --preview")
    public_stage = output / "Quiz-Party"
    public_stage.mkdir()
    stage_public(public_stage)
    if args.stage_only:
        print(f"Staged public release under: {public_stage}")
        return 0
    source_stage = output / "Quiz-Party-Source"
    source_stage.mkdir()
    stage_source(source_stage)
    zip_tree(public_stage, output / "Quiz-Party-v6.0-Release.zip", "Quiz-Party")
    zip_tree(source_stage, output / "Quiz-Party-v6.0-Source.zip", "Quiz-Party-Source")
    manifest(output, public_stage, source_stage)
    print(f"Created release packages under {output}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except PackageError as exc:
        print(f"package-online: error: {exc}", file=sys.stderr)
        raise SystemExit(2)
