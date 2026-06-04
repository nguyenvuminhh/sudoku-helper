from __future__ import annotations

import os
from dataclasses import asdict
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.app.ocr import recognize_sudoku_image
from backend.app.sudoku.grid import candidate_map, parse_grid, validate_grid
from backend.app.sudoku.solver import next_hint

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_STATIC_DIR = PROJECT_ROOT / "frontend" / "out"


class GridRequest(BaseModel):
    grid: str | list[int | str | None]


def create_app(static_dir: Path | None = DEFAULT_STATIC_DIR, cors_origins: list[str] | None = None) -> FastAPI:
    app = FastAPI(title="Puzzle Hint", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins if cors_origins is not None else _parse_cors_origins(os.getenv("PUZZLE_HINT_CORS_ORIGINS")),
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "puzzle-hint"}

    @app.post("/api/sudoku/validate")
    def validate(payload: GridRequest) -> dict[str, Any]:
        grid = _parse_or_422(payload.grid)
        validation = validate_grid(grid)
        return {
            "valid": validation.valid,
            "conflicts": validation.conflicts,
            "candidates": {
                str(index): sorted(digits)
                for index, digits in candidate_map(grid).items()
            }
            if validation.valid
            else {},
        }

    @app.post("/api/sudoku/hint")
    def hint(payload: GridRequest) -> dict[str, object]:
        grid = _parse_or_422(payload.grid)
        validation = validate_grid(grid)
        if not validation.valid:
            raise HTTPException(
                status_code=422,
                detail=[{"message": "Grid has conflicts.", "conflicts": validation.conflicts}],
            )
        return next_hint(grid).to_dict()

    @app.post("/api/sudoku/ocr")
    async def ocr(file: UploadFile = File(...)) -> dict[str, object]:
        image_bytes = await file.read()
        return recognize_sudoku_image(image_bytes, file.filename or "upload").to_dict()

    _mount_frontend(app, static_dir)
    return app


def _parse_or_422(raw_grid: str | list[int | str | None]) -> list[int]:
    try:
        return parse_grid(raw_grid)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=[{"message": str(exc)}]) from exc


def _parse_cors_origins(raw_origins: str | None) -> list[str]:
    if raw_origins is None or not raw_origins.strip() or raw_origins.strip() == "*":
        return ["*"]
    origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
    return origins or ["*"]


def _static_dir_from_env() -> Path | None:
    raw_static_dir = os.getenv("PUZZLE_HINT_STATIC_DIR")
    if raw_static_dir is None:
        return DEFAULT_STATIC_DIR
    if not raw_static_dir.strip():
        return None
    return Path(raw_static_dir)


def _mount_frontend(app: FastAPI, static_dir: Path | None) -> None:
    if static_dir is None:
        return

    static_dir = static_dir.resolve()
    index_file = static_dir / "index.html"
    if not index_file.exists():
        return

    next_dir = static_dir / "_next"
    if next_dir.exists():
        app.mount("/_next", StaticFiles(directory=next_dir), name="next-static")

    @app.get("/{full_path:path}", include_in_schema=False)
    def frontend(full_path: str) -> FileResponse:
        requested = (static_dir / full_path).resolve()
        if requested.is_file() and static_dir in requested.parents:
            return FileResponse(requested)
        return FileResponse(index_file)


app = create_app(static_dir=_static_dir_from_env())
