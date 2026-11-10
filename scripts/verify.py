#!/usr/bin/env python3
"""Repository and security checks that do not need Node or Docker."""

from __future__ import annotations

import py_compile
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
JS = PUBLIC / "assets" / "js"

REQUIRED = [
    "README.md",
    ".gitignore",
    "start.py",
    "public/index.html",
    "public/assets/css/app.css",
    "public/assets/js/app.js",
    "public/assets/js/worker.js",
    "public/assets/js/demo.js",
    "public/assets/js/export.js",
    "public/assets/js/parser/tokenize.js",
    "public/assets/js/parser/schema.js",
    "public/assets/js/parser/secrets.js",
    "public/assets/js/parser/values.js",
    "public/assets/js/parser/parse.js",
    "public/assets/js/parser/build.js",
    "public/assets/js/parser/compare.js",
    "scripts/verify.py",
    "scripts/smoke.py",
    "tests/parser.test.mjs",
    "tests/export.test.mjs",
    "Dockerfile",
    ".dockerignore",
    "compose.yaml",
    ".gitleaks.toml",
    "LICENSE",
    ".github/workflows/ci.yml",
    ".github/workflows/docker-publish.yml",
]

FORBIDDEN_JS = [
    (re.compile(r"\blocalStorage\b"), "localStorage"),
    (re.compile(r"\bsessionStorage\b"), "sessionStorage"),
    (re.compile(r"\bindexedDB\b"), "indexedDB"),
    (re.compile(r"\bXMLHttpRequest\b"), "XMLHttpRequest"),
    (re.compile(r"\bsendBeacon\b"), "sendBeacon"),
    (re.compile(r"\bnew\s+Function\b"), "new Function"),
    (re.compile(r"\beval\s*\("), "eval("),
    (re.compile(r"\binnerHTML\b"), "innerHTML"),
]

EXTERNAL_ASSET = re.compile(r"""(?:src|href)\s*=\s*["']https?://""", re.IGNORECASE)


def fail(errors: list[str], message: str) -> None:
    errors.append(message)


def main() -> int:
    errors: list[str] = []

    for relative in REQUIRED:
        if not (ROOT / relative).is_file():
            fail(errors, f"missing required file: {relative}")

    py_compile.compile(str(ROOT / "start.py"), doraise=True)
    py_compile.compile(str(ROOT / "scripts" / "verify.py"), doraise=True)
    py_compile.compile(str(ROOT / "scripts" / "smoke.py"), doraise=True)

    index = (PUBLIC / "index.html").read_text(encoding="utf-8")
    if EXTERNAL_ASSET.search(index):
        fail(errors, "index.html references an external asset")
    if 'connect-src' not in (ROOT / "start.py").read_text(encoding="utf-8"):
        fail(errors, "start.py does not define a Content-Security-Policy")

    for path in sorted(JS.rglob("*.js")):
        text = path.read_text(encoding="utf-8")
        relative = path.relative_to(ROOT)
        for pattern, label in FORBIDDEN_JS:
            if pattern.search(text):
                fail(errors, f"{relative}: forbidden browser API or sink: {label}")

    ignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
    for entry in ("fixtures/private/", "local-configs/", ".env"):
        if entry not in ignore:
            fail(errors, f".gitignore is missing {entry!r}")

    compose = (ROOT / "compose.yaml").read_text(encoding="utf-8")
    for token in ("127.0.0.1:8008:8008", "read_only: true", "cap_drop:", "no-new-privileges:true"):
        if token not in compose:
            fail(errors, f"compose.yaml is missing hardening token: {token}")

    dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    for token in ("USER app", "HEALTHCHECK", "EXPOSE 8008"):
        if token not in dockerfile:
            fail(errors, f"Dockerfile is missing: {token}")

    dockerignore = (ROOT / ".dockerignore").read_text(encoding="utf-8")
    for token in ("fixtures", "local-configs", ".env", ".git"):
        if token not in dockerignore:
            fail(errors, f".dockerignore is missing {token!r}")

    ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    for token in ("secret-scan", "gitleaks", ".gitleaks.toml", "--redact"):
        if token not in ci:
            fail(errors, f"CI secret scan is missing: {token}")

    gitleaks = (ROOT / ".gitleaks.toml").read_text(encoding="utf-8")
    for token in ("useDefault = true", "demo-only-not-a-real-secret"):
        if token not in gitleaks:
            fail(errors, f".gitleaks.toml is missing: {token}")

    if "MIT License" not in (ROOT / "LICENSE").read_text(encoding="utf-8"):
        fail(errors, "LICENSE does not contain the MIT license text")

    html_files = list(PUBLIC.rglob("*.html"))
    for path in html_files:
        text = path.read_text(encoding="utf-8")
        if EXTERNAL_ASSET.search(text):
            fail(errors, f"{path.relative_to(ROOT)} references an external asset")

    if errors:
        print("Repository verification FAILED")
        for error in errors:
            print(f"  - {error}")
        return 1

    js_files = sorted(JS.rglob("*.js"))
    print(f"Repository verification passed")
    print(f"  Python entry point: start.py")
    print(f"  HTML files: {len(html_files)}")
    print(f"  JavaScript modules: {len(js_files)}")
    print(f"  Required files: {len(REQUIRED)}")
    print("  No forbidden storage, network or HTML-injection APIs found")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
