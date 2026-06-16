from __future__ import annotations

import json
import os
import random
import subprocess
from dataclasses import asdict, dataclass
from functools import lru_cache
from gzip import open as gzip_open
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_ENGINE_BIN = PROJECT_ROOT / "bin" / "sudoku-engine"
DEFAULT_SERATE_CORPUS_DIR = PROJECT_ROOT / "data" / "puzzles" / "serate-buckets"
ENGINE_GENERATION_LEVEL_IDS = frozenset({"easy", "medium", "hard", "expert", "master"})


class EngineUnavailable(RuntimeError):
    pass


class EngineError(RuntimeError):
    pass


@dataclass(frozen=True)
class Attribution:
    name: str
    url: str
    license: str
    copyright: str

    @classmethod
    def ukodus(cls) -> "Attribution":
        return cls(
            name="Ukodus sudoku-core",
            url="https://github.com/kcirtapfromspace/sudoku-core",
            license="MIT",
            copyright="Copyright (c) 2026 Patrick Deutsch",
        )

    @classmethod
    def serate_corpus(cls) -> "Attribution":
        return cls(
            name="Puzzle Hint SE bucket corpus",
            url="data/puzzles/serate-buckets",
            license="Generated puzzle corpus",
            copyright="",
        )

    def to_dict(self) -> dict[str, str]:
        return asdict(self)


@dataclass(frozen=True)
class DifficultyLevel:
    id: str
    name: str
    description: str
    techniques: tuple[str, ...]

    @classmethod
    def catalog(cls) -> tuple["DifficultyLevel", ...]:
        return tuple(DIFFICULTY_LEVELS.values())

    @classmethod
    def for_id(cls, level_id: str) -> "DifficultyLevel":
        normalized = level_id.strip().lower()
        if normalized not in DIFFICULTY_LEVELS:
            raise ValueError(f"Unknown Sudoku difficulty level: {level_id}")
        return DIFFICULTY_LEVELS[normalized]

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "techniques": list(self.techniques),
        }


@dataclass(frozen=True)
class GeneratedPuzzle:
    puzzle: str
    solution: str
    level: DifficultyLevel
    requested_level: DifficultyLevel
    se_rating: float
    techniques: list[str]
    technique_profile: dict[str, int]
    attribution: Attribution

    def to_dict(self) -> dict[str, object]:
        return {
            "puzzle": self.puzzle,
            "solution": self.solution,
            "level": self.level.to_dict(),
            "requested_level": self.requested_level.to_dict(),
            "se_rating": self.se_rating,
            "techniques": self.techniques,
            "technique_profile": self.technique_profile,
            "attribution": self.attribution.to_dict(),
        }


DIFFICULTY_LEVELS: dict[str, DifficultyLevel] = {
    "easy": DifficultyLevel(
        id="easy",
        name="Easy",
        description="Scanning, naked singles, and hidden singles.",
        techniques=("naked_single", "hidden_single"),
    ),
    "medium": DifficultyLevel(
        id="medium",
        name="Medium",
        description="Singles plus box-line eliminations and early pairs.",
        techniques=("naked_single", "hidden_single", "locked_candidate", "naked_pair"),
    ),
    "hard": DifficultyLevel(
        id="hard",
        name="Hard",
        description="Pairs, tuples, pointing pairs, and disciplined candidate work.",
        techniques=(
            "naked_single",
            "hidden_single",
            "locked_candidate",
            "pointing_pair",
            "box_line_reduction",
            "naked_pair",
            "hidden_pair",
            "naked_tuple",
            "hidden_tuple",
        ),
    ),
    "expert": DifficultyLevel(
        id="expert",
        name="Expert",
        description="Fish, coloring, rectangles, wings, and chain-based eliminations.",
        techniques=(
            "naked_single",
            "hidden_single",
            "locked_candidate",
            "naked_pair",
            "hidden_pair",
            "naked_tuple",
            "hidden_tuple",
            "x_wing",
            "finned_x_wing",
            "swordfish",
            "finned_swordfish",
            "coloring",
            "x_chain",
            "empty_rectangle",
            "hidden_rectangle",
            "xy_wing",
            "xyz_wing",
            "w_wing",
        ),
    ),
    "master": DifficultyLevel(
        id="master",
        name="Master",
        description="Advanced fish, ALS, uniqueness, and forcing-chain techniques.",
        techniques=(
            "naked_single",
            "hidden_single",
            "locked_candidate",
            "naked_pair",
            "hidden_pair",
            "naked_tuple",
            "hidden_tuple",
            "x_wing",
            "finned_x_wing",
            "swordfish",
            "finned_swordfish",
            "jellyfish",
            "finned_jellyfish",
            "franken_fish",
            "siamese_fish",
            "mutant_fish",
            "coloring",
            "aic",
            "als_xz",
            "als_xy_wing",
            "als_chain",
            "unique_rectangle",
            "extended_unique_rectangle",
            "bug_plus_one",
            "forcing_chain",
            "nishio_forcing_chain",
            "kraken_fish",
            "region_forcing_chain",
            "cell_forcing_chain",
            "dynamic_forcing_chain",
        ),
    ),
    "extreme": DifficultyLevel(
        id="extreme",
        name="Extreme",
        description="SE 6.x puzzles with forcing chains and advanced contradiction patterns.",
        techniques=(
            "naked_single",
            "hidden_single",
            "locked_candidate",
            "naked_pair",
            "hidden_pair",
            "naked_tuple",
            "hidden_tuple",
            "x_wing",
            "swordfish",
            "jellyfish",
            "coloring",
            "aic",
            "als_xz",
            "als_chain",
            "unique_rectangle",
            "forcing_chain",
            "region_forcing_chain",
            "cell_forcing_chain",
            "dynamic_forcing_chain",
        ),
    ),
    "advanced_7_8": DifficultyLevel(
        id="advanced_7_8",
        name="Advanced 7-8",
        description="SE 7.x puzzles that lean on forcing chains and layered candidate logic.",
        techniques=(
            "naked_single",
            "hidden_single",
            "locked_candidate",
            "naked_pair",
            "hidden_pair",
            "naked_tuple",
            "hidden_tuple",
            "x_wing",
            "swordfish",
            "jellyfish",
            "coloring",
            "aic",
            "als_xz",
            "als_chain",
            "unique_rectangle",
            "forcing_chain",
            "nishio_forcing_chain",
            "region_forcing_chain",
            "cell_forcing_chain",
            "dynamic_forcing_chain",
        ),
    ),
    "advanced_8_plus": DifficultyLevel(
        id="advanced_8_plus",
        name="Advanced 8+",
        description="SE 8.0+ puzzles from the pregenerated corpus; expect extended forcing logic.",
        techniques=(
            "naked_single",
            "hidden_single",
            "locked_candidate",
            "naked_pair",
            "hidden_pair",
            "naked_tuple",
            "hidden_tuple",
            "x_wing",
            "swordfish",
            "jellyfish",
            "coloring",
            "aic",
            "als_xz",
            "als_chain",
            "unique_rectangle",
            "forcing_chain",
            "nishio_forcing_chain",
            "region_forcing_chain",
            "cell_forcing_chain",
            "dynamic_forcing_chain",
        ),
    ),
}


def generate_puzzle(level: str, seed: int | None = None) -> GeneratedPuzzle:
    requested = DifficultyLevel.for_id(level)
    corpus_puzzle = _generate_from_serate_corpus(requested, seed=seed)
    if corpus_puzzle is not None:
        return corpus_puzzle
    if requested.id not in ENGINE_GENERATION_LEVEL_IDS:
        raise EngineUnavailable(
            f"SE bucket corpus not found for {requested.name}. Set PUZZLE_HINT_SERATE_CORPUS_DIR to data/puzzles/serate-buckets."
        )
    args = ["generate", "--level", requested.id]
    if seed is not None:
        args.extend(["--seed", str(seed)])
    return _parse_engine_puzzle(_run_engine(args), requested)


def rate_puzzle(grid: str) -> GeneratedPuzzle:
    return _parse_engine_puzzle(_run_engine(["rate", grid]), None)


def _run_engine(args: list[str]) -> dict[str, Any]:
    engine_bin = Path(os.getenv("SUDOKU_ENGINE_BIN", str(DEFAULT_ENGINE_BIN)))
    if not engine_bin.exists():
        raise EngineUnavailable(
            f"Sudoku engine binary not found at {engine_bin}. Build tools/sudoku-engine-cli or set SUDOKU_ENGINE_BIN."
        )

    try:
        completed = subprocess.run(
            [str(engine_bin), *args],
            check=True,
            capture_output=True,
            encoding="utf-8",
            timeout=float(os.getenv("SUDOKU_ENGINE_TIMEOUT", "20")),
        )
    except FileNotFoundError as exc:
        raise EngineUnavailable(f"Sudoku engine binary not found at {engine_bin}.") from exc
    except subprocess.TimeoutExpired as exc:
        raise EngineUnavailable("Sudoku engine timed out while generating, rating, or hinting a puzzle.") from exc
    except subprocess.CalledProcessError as exc:
        message = exc.stderr.strip() or exc.stdout.strip() or "Sudoku engine failed."
        raise EngineError(message) from exc

    try:
        return json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise EngineError("Sudoku engine returned invalid JSON.") from exc


def _parse_engine_puzzle(raw: dict[str, Any], requested_level: DifficultyLevel | None) -> GeneratedPuzzle:
    rated_level = DifficultyLevel.for_id(str(raw.get("level", requested_level.id if requested_level else "easy")))
    requested = DifficultyLevel.for_id(str(raw.get("requested_level", requested_level.id if requested_level else rated_level.id)))
    techniques = [str(technique) for technique in raw.get("techniques", [])]
    profile = {str(key): int(value) for key, value in dict(raw.get("technique_profile", {})).items()}
    attribution = Attribution.ukodus()

    return GeneratedPuzzle(
        puzzle=_normalize_grid_string(str(raw["puzzle"])),
        solution=_normalize_grid_string(str(raw["solution"])),
        level=rated_level,
        requested_level=requested,
        se_rating=float(raw.get("se_rating", 0)),
        techniques=techniques,
        technique_profile=profile,
        attribution=attribution,
    )


def _generate_from_serate_corpus(requested: DifficultyLevel, seed: int | None) -> GeneratedPuzzle | None:
    corpus_dir = _serate_corpus_dir()
    records = _load_serate_bucket_records(str(corpus_dir), requested.id)
    if not records:
        return None

    record = records[seed % len(records)] if seed is not None else random.choice(records)
    return _parse_serate_record(record, requested)


def _serate_corpus_dir() -> Path:
    raw_path = os.getenv("PUZZLE_HINT_SERATE_CORPUS_DIR")
    return Path(raw_path) if raw_path and raw_path.strip() else DEFAULT_SERATE_CORPUS_DIR


@lru_cache(maxsize=32)
def _load_serate_bucket_records(corpus_dir: str, bucket_id: str) -> tuple[dict[str, Any], ...]:
    bucket_dir = Path(corpus_dir) / bucket_id
    if not bucket_dir.exists():
        return ()

    records: list[dict[str, Any]] = []
    for path in sorted(bucket_dir.glob("part-*.ndjson.gz")):
        with gzip_open(path, "rt", encoding="utf-8") as handle:
            for line in handle:
                if line.strip():
                    records.append(json.loads(line))
    return tuple(records)


def _parse_serate_record(record: dict[str, Any], requested: DifficultyLevel) -> GeneratedPuzzle:
    level = DifficultyLevel.for_id(str(record.get("bucket", requested.id)))
    highest_technique = str(record.get("highest_technique", "")).strip()
    techniques = [highest_technique] if highest_technique else []

    return GeneratedPuzzle(
        puzzle=_normalize_grid_string(str(record["puzzle"])),
        solution=_normalize_grid_string(str(record["solution"])),
        level=level,
        requested_level=requested,
        se_rating=float(record.get("se_rating", 0)),
        techniques=techniques,
        technique_profile={technique: 1 for technique in techniques},
        attribution=Attribution.serate_corpus(),
    )


def _normalize_grid_string(value: str) -> str:
    compact = "".join("0" if char == "." else char for char in value if char in "0123456789.")
    if len(compact) != 81:
        raise EngineError("Sudoku engine returned a grid that does not contain 81 cells.")
    return compact
