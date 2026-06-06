from __future__ import annotations

import uvicorn

from backend.app.main import create_app

DESKTOP_HOST = "127.0.0.1"
DESKTOP_PORT = 48731

app = create_app(cors_origins=["*"])


def main() -> None:
    uvicorn.run(app, host=DESKTOP_HOST, port=DESKTOP_PORT, log_level="info")


if __name__ == "__main__":
    main()
