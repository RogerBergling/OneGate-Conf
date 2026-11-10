#!/usr/bin/env python3
"""Local static server for OneGate Config Compare.

The server only serves files from public/. It has no upload endpoint, no
database, no write path and no configuration storage. Configuration files are
read by the browser and parsed in a Web Worker.
"""

from __future__ import annotations

import argparse
import mimetypes
import socket
import sys
import threading
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = (ROOT / "public").resolve()

SECURITY_HEADERS = {
    "Content-Security-Policy": (
        "default-src 'none'; "
        "script-src 'self'; "
        "style-src 'self'; "
        "img-src 'self' data:; "
        "font-src 'self'; "
        "worker-src 'self'; "
        "connect-src 'none'; "
        "object-src 'none'; "
        "base-uri 'none'; "
        "frame-ancestors 'none'; "
        "form-action 'none'"
    ),
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
}

MIME_OVERRIDES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
}


class OneGateHandler(BaseHTTPRequestHandler):
    server_version = ""
    sys_version = ""
    protocol_version = "HTTP/1.1"

    def version_string(self) -> str:
        return ""

    def log_message(self, fmt: str, *args: object) -> None:
        # Request paths never contain configuration data. Suppress the default
        # noisy log; the app is local-first and does not need access logs.
        return

    def _send_common_headers(self) -> None:
        for key, value in SECURITY_HEADERS.items():
            self.send_header(key, value)

    def _send_text(self, status: HTTPStatus, text: str, head_only: bool = False) -> None:
        body = text.encode("utf-8")
        self.send_response(status)
        self._send_common_headers()
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if not head_only:
            self.wfile.write(body)

    def _resolve_path(self, path: str) -> Path | None:
        decoded = unquote(path)
        if "\x00" in decoded:
            return None
        relative = decoded.lstrip("/")
        if not relative:
            relative = "index.html"
        candidate = (PUBLIC_DIR / relative).resolve()
        try:
            candidate.relative_to(PUBLIC_DIR)
        except ValueError:
            return None
        if any(part.startswith(".") for part in candidate.relative_to(PUBLIC_DIR).parts):
            return None
        return candidate

    def _serve(self, head_only: bool = False) -> None:
        parsed = urlsplit(self.path)
        candidate = self._resolve_path(parsed.path)
        if candidate is None or candidate.is_dir() or not candidate.is_file():
            self._send_text(HTTPStatus.NOT_FOUND, "Not found", head_only)
            return

        try:
            data = candidate.read_bytes()
        except OSError:
            self._send_text(HTTPStatus.NOT_FOUND, "Not found", head_only)
            return

        suffix = candidate.suffix.lower()
        content_type = MIME_OVERRIDES.get(suffix) or mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
        self.send_response(HTTPStatus.OK)
        self._send_common_headers()
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if not head_only:
            self.wfile.write(data)

    def do_GET(self) -> None:  # noqa: N802
        self._serve(head_only=False)

    def do_HEAD(self) -> None:  # noqa: N802
        self._serve(head_only=True)

    def do_POST(self) -> None:  # noqa: N802
        self._send_text(HTTPStatus.METHOD_NOT_ALLOWED, "Method not allowed")

    def do_PUT(self) -> None:  # noqa: N802
        self._send_text(HTTPStatus.METHOD_NOT_ALLOWED, "Method not allowed")

    def do_DELETE(self) -> None:  # noqa: N802
        self._send_text(HTTPStatus.METHOD_NOT_ALLOWED, "Method not allowed")

    def do_PATCH(self) -> None:  # noqa: N802
        self._send_text(HTTPStatus.METHOD_NOT_ALLOWED, "Method not allowed")

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._send_text(HTTPStatus.METHOD_NOT_ALLOWED, "Method not allowed")


def port_is_free(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((host, port))
        except OSError:
            return False
    return True


def pick_port(host: str, preferred: int) -> int:
    for port in range(preferred, preferred + 100):
        if port_is_free(host, port):
            return port
    raise SystemExit(f"No free port found in {preferred}-{preferred + 99}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve OneGate Config Compare locally.")
    parser.add_argument("--host", default="127.0.0.1", help="Bind address (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8008, help="Preferred port (default: 8008)")
    parser.add_argument("--no-browser", action="store_true", help="Do not open a browser")
    args = parser.parse_args()

    if not PUBLIC_DIR.is_dir():
        print(f"Missing public directory: {PUBLIC_DIR}", file=sys.stderr)
        return 1

    port = pick_port(args.host, args.port)
    server = ThreadingHTTPServer((args.host, port), OneGateHandler)
    server.daemon_threads = True
    url = f"http://{args.host}:{port}/"

    print("OneGate Config Compare")
    print(f"Serving {PUBLIC_DIR}")
    print(f"Open {url}")
    print("Configuration files stay in the browser. Nothing is uploaded or stored.")
    print("Press Ctrl+C to stop.")

    if not args.no_browser:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
