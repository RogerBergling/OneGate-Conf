#!/usr/bin/env python3
"""Start the real static server and verify its HTTP and security behaviour."""

from __future__ import annotations

import contextlib
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def wait_for_port(port: int, timeout: float = 8.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(0.25)
            if sock.connect_ex(("127.0.0.1", port)) == 0:
                return
        time.sleep(0.1)
    raise RuntimeError(f"server did not start on port {port}")


def request(url: str, method: str = "GET", data: bytes | None = None) -> tuple[int, dict[str, str], bytes]:
    req = urllib.request.Request(url, method=method, data=data)
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            return response.status, dict(response.headers.items()), response.read()
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers.items()), error.read()


def main() -> int:
    port = free_port()
    process = subprocess.Popen(
        [sys.executable, "start.py", "--no-browser", "--host", "127.0.0.1", "--port", str(port)],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    try:
        wait_for_port(port)
        base = f"http://127.0.0.1:{port}"
        failures: list[str] = []

        status, headers, body = request(f"{base}/")
        if status != 200:
            failures.append(f"GET / returned {status}")
        if b"OneGate Config Compare" not in body:
            failures.append("GET / did not contain the application title")
        csp = headers.get("Content-Security-Policy", "")
        for token in ("connect-src 'none'", "frame-ancestors 'none'", "form-action 'none'"):
            if token not in csp:
                failures.append(f"CSP missing {token!r}")
        if "no-store" not in headers.get("Cache-Control", ""):
            failures.append("Cache-Control is not no-store")
        if headers.get("X-Content-Type-Options") != "nosniff":
            failures.append("X-Content-Type-Options is not nosniff")

        status, headers, _ = request(f"{base}/assets/js/app.js", method="HEAD")
        if status != 200:
            failures.append(f"HEAD /assets/js/app.js returned {status}")
        if "text/javascript" not in headers.get("Content-Type", ""):
            failures.append("app.js has the wrong content type")

        status, _, _ = request(f"{base}/assets/js/worker.js")
        if status != 200:
            failures.append(f"GET /assets/js/worker.js returned {status}")

        status, _, _ = request(f"{base}/does-not-exist")
        if status != 404:
            failures.append(f"GET missing file returned {status}")

        status, _, _ = request(f"{base}/..%2Fstart.py")
        if status not in (403, 404):
            failures.append(f"Path traversal returned {status}")

        status, _, _ = request(f"{base}/", method="POST", data=b"test")
        if status != 405:
            failures.append(f"POST / returned {status}, expected 405")

        if failures:
            print("Smoke test FAILED")
            for failure in failures:
                print(f"  - {failure}")
            return 1

        print("Smoke test passed")
        print("  Static shell, JS, CSP, cache and method restrictions verified")
        print("  Path traversal and missing-file handling verified")
        return 0
    finally:
        process.terminate()
        with contextlib.suppress(subprocess.TimeoutExpired):
            process.wait(timeout=5)
        with contextlib.suppress(Exception):
            process.kill()


if __name__ == "__main__":
    raise SystemExit(main())
