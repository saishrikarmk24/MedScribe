"""Windows-safe backend launcher.

``uvicorn app.main:app --reload`` binds port 8000. On Windows that often fails
with WinError 10013: Hyper-V / WinNAT reserved the port, a leftover Python
process is still listening, or the wildcard bind is blocked. This script binds
127.0.0.1 only and falls back to the next free port if 8000 is forbidden.
"""

from __future__ import annotations

import socket

import uvicorn

PREFERRED_PORTS = (8000, 8001, 8080, 8010, 8888)
HOST = "127.0.0.1"


def _can_bind(host: str, port: int) -> bool:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind((host, port))
        return True
    except OSError:
        return False
    finally:
        sock.close()


def pick_port() -> int:
    for port in PREFERRED_PORTS:
        if _can_bind(HOST, port):
            return port
    raise SystemExit("No free local port in 8000/8001/8080/8010/8888. Close the process holding them and retry.")


if __name__ == "__main__":
    port = pick_port()
    if port != 8000:
        print(
            f"Port 8000 is blocked by Windows (WinError 10013 style bind failure). "
            f"Serving on http://{HOST}:{port} instead.\n"
            "If the Vite app cannot reach the API, set the proxy target in "
            "frontend/vite.config.ts to this port, or free 8000:\n"
            "  netstat -ano | findstr :8000\n"
            "  net stop winnat   (Administrator, then: net start winnat)"
        )
    uvicorn.run("app.main:app", host=HOST, port=port, reload=True, reload_dirs=["."])
