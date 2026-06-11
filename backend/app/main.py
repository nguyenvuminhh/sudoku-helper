from __future__ import annotations

import os
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.app.ocr import DigitClassifierUnavailable, recognize_sudoku_image
from backend.app.sudoku.engine import EngineError, EngineUnavailable, generate_puzzle, hint_with_engine
from backend.app.sudoku.grid import candidate_map, parse_candidate_map, parse_grid, validate_grid
from backend.app.sudoku.solver import next_hint


class GridRequest(BaseModel):
    grid: str | list[int | str | None]
    candidates: dict[str, list[int | str]] | None = None


class GenerateRequest(BaseModel):
    level: str
    seed: int | None = None


def create_app(cors_origins: list[str] | None = None) -> FastAPI:
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
        candidates = _parse_candidates_or_422(grid, payload.candidates) if payload.candidates is not None else None
        try:
            return hint_with_engine(grid, candidates=candidates)
        except EngineUnavailable:
            return next_hint(grid, candidates=candidates).to_dict()
        except EngineError as exc:
            raise HTTPException(status_code=502, detail=[{"message": str(exc)}]) from exc

    @app.post("/api/sudoku/generate")
    def generate(payload: GenerateRequest) -> dict[str, object]:
        try:
            return generate_puzzle(payload.level, seed=payload.seed).to_dict()
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=[{"message": str(exc)}]) from exc
        except EngineUnavailable as exc:
            raise HTTPException(status_code=503, detail=[{"message": str(exc)}]) from exc
        except EngineError as exc:
            raise HTTPException(status_code=502, detail=[{"message": str(exc)}]) from exc

    @app.post("/api/sudoku/ocr")
    async def ocr(file: UploadFile = File(...)) -> dict[str, object]:
        image_bytes = await file.read()
        try:
            return recognize_sudoku_image(image_bytes, file.filename or "upload").to_dict()
        except DigitClassifierUnavailable as exc:
            raise HTTPException(status_code=503, detail=[{"message": str(exc)}]) from exc

    return app


def _parse_or_422(raw_grid: str | list[int | str | None]) -> list[int]:
    try:
        return parse_grid(raw_grid)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=[{"message": str(exc)}]) from exc


def _parse_candidates_or_422(raw_grid: list[int], raw_candidates: dict[str, list[int | str]]) -> dict[int, set[int]]:
    try:
        return parse_candidate_map(raw_grid, raw_candidates)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=[{"message": str(exc)}]) from exc


def _parse_cors_origins(raw_origins: str | None) -> list[str]:
    if raw_origins is None or not raw_origins.strip() or raw_origins.strip() == "*":
        return ["*"]
    origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
    return origins or ["*"]


app = create_app()
