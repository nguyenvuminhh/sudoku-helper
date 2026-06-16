#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import random
import sys
import time
import zipfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable, Iterator, Sequence

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.generate_hard_sudoku_corpus import (
    EXTREME_MIN_RATING,
    MASTER_MIN_RATING,
    SerateRating,
    classify_rating,
    extract_puzzle,
    rate_batch,
    solve_unique,
)


DEFAULT_SEED_ZIP = Path("tdoku/data.zip")
DEFAULT_SEED_MEMBER = "data/puzzles5_forum_hardest_1905_11+"


@dataclass(frozen=True)
class SeedRecord:
    puzzle: str
    solution: str
    level: str
    se_rating: float
    pearl_rating: float
    diamond_rating: float
    highest_technique_short: str
    highest_technique: str


@dataclass(frozen=True)
class SudokuTransform:
    digit_map: tuple[int, ...]
    row_order: tuple[int, ...]
    col_order: tuple[int, ...]
    transpose: bool


def identity_transform() -> SudokuTransform:
    return SudokuTransform(
        digit_map=tuple(range(10)),
        row_order=tuple(range(9)),
        col_order=tuple(range(9)),
        transpose=False,
    )


def random_transform(seed: int) -> SudokuTransform:
    rng = random.Random(seed)
    digit_values = list(range(1, 10))
    rng.shuffle(digit_values)
    digit_map = [0, *digit_values]
    return SudokuTransform(
        digit_map=tuple(digit_map),
        row_order=tuple(_house_order(rng)),
        col_order=tuple(_house_order(rng)),
        transpose=bool(rng.getrandbits(1)),
    )


def apply_transform(grid: str, transform: SudokuTransform) -> str:
    if len(grid) != 81:
        raise ValueError("grid must contain exactly 81 cells")

    transformed: list[str] = []
    for row in range(9):
        for col in range(9):
            source_row = transform.row_order[row]
            source_col = transform.col_order[col]
            source_index = source_col * 9 + source_row if transform.transpose else source_row * 9 + source_col
            value = grid[source_index]
            if value in ".0":
                transformed.append("0")
            else:
                transformed.append(str(transform.digit_map[int(value)]))
    return "".join(transformed)


def read_seed_puzzles(
    *,
    seed_zip: Path | None,
    seed_member: str | None,
    seed_file: Path | None,
    max_seeds: int | None,
) -> Iterator[str]:
    count = 0
    for line in _iter_seed_lines(seed_zip=seed_zip, seed_member=seed_member, seed_file=seed_file):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        try:
            yield extract_puzzle(stripped)
        except ValueError:
            continue
        count += 1
        if max_seeds is not None and count >= max_seeds:
            break


def verify_seed_catalog(
    puzzles: Iterable[str],
    *,
    catalog_path: Path,
    serate_jar: Path,
    java_bin: str,
    java_heap: str,
    threads: int,
    batch_size: int,
    master_min_rating: float,
    extreme_min_rating: float,
) -> list[SeedRecord]:
    catalog_path.parent.mkdir(parents=True, exist_ok=True)
    existing = load_seed_catalog(catalog_path) if catalog_path.exists() else []
    seen = {record.puzzle for record in existing}
    records = list(existing)
    batch: list[str] = []
    processed = 0

    def flush() -> None:
        nonlocal batch, processed
        if not batch:
            return
        ratings = rate_batch(batch, serate_jar, java_bin=java_bin, java_heap=java_heap, threads=threads)
        with gzip.open(catalog_path, "at", encoding="utf-8") as handle:
            for rating in ratings:
                level = classify_rating(rating.rating, master_min=master_min_rating, extreme_min=extreme_min_rating)
                if level is None:
                    continue
                try:
                    solution = solve_unique(rating.puzzle)
                except ValueError:
                    continue
                record = _seed_record_from_rating(rating, solution, level)
                records.append(record)
                handle.write(json.dumps(asdict(record), sort_keys=True, separators=(",", ":")))
                handle.write("\n")
        processed += len(batch)
        print(f"verified seeds={processed} accepted={len(records)}", file=sys.stderr, flush=True)
        batch = []

    for puzzle in puzzles:
        if puzzle in seen:
            continue
        seen.add(puzzle)
        batch.append(puzzle)
        if len(batch) >= batch_size:
            flush()
    flush()
    return records


def load_seed_catalog(path: Path) -> list[SeedRecord]:
    if not path.exists():
        return []
    records: list[SeedRecord] = []
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            records.append(SeedRecord(**json.loads(line)))
    return records


def expand_seed_records(
    seeds: Sequence[SeedRecord],
    *,
    output_dir: Path,
    levels: Sequence[str],
    targets: dict[str, int],
    chunk_size: int,
    random_seed: int,
) -> dict[str, int]:
    counts, seen = _load_existing_output(output_dir, levels)
    eligible = [record for record in seeds if record.level in levels]
    if not eligible:
        raise RuntimeError(f"no verified seed records match requested levels: {', '.join(levels)}")

    variant_round = 0
    while not all(counts[level] >= targets[level] for level in levels):
        wrote_this_round = False
        for seed_index, seed in enumerate(eligible):
            if counts[seed.level] >= targets[seed.level]:
                continue
            transform_seed = random_seed + variant_round * 1_000_003 + seed_index
            transform = random_transform(transform_seed)
            puzzle = apply_transform(seed.puzzle, transform)
            if puzzle in seen:
                continue
            solution = apply_transform(seed.solution, transform)
            _write_variant_record(
                output_dir=output_dir,
                level=seed.level,
                record_index=counts[seed.level],
                chunk_size=chunk_size,
                seed=seed,
                puzzle=puzzle,
                solution=solution,
                source_index=seed_index,
                variant_round=variant_round,
                transform_seed=transform_seed,
            )
            counts[seed.level] += 1
            seen.add(puzzle)
            wrote_this_round = True
        if not wrote_this_round:
            raise RuntimeError("could not create a new unique variant from the verified seed records")
        variant_round += 1
        if variant_round % 10 == 0:
            _print_expand_progress(counts)

    _write_expand_manifest(output_dir, counts=counts, targets=targets, seed_count=len(eligible), random_seed=random_seed)
    return counts


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Verify hard-rated Sudoku seeds with serate and expand them with difficulty-preserving transformations."
    )
    parser.add_argument("--seed-zip", type=Path, default=DEFAULT_SEED_ZIP)
    parser.add_argument("--seed-member", default=DEFAULT_SEED_MEMBER)
    parser.add_argument("--seed-file", type=Path, default=None)
    parser.add_argument("--seed-catalog", type=Path, default=Path("data/puzzles/verified-hard-seeds.ndjson.gz"))
    parser.add_argument("--serate-jar", type=Path, default=Path("SukakuExplainer.jar"))
    parser.add_argument("--java-bin", default="java")
    parser.add_argument("--java-heap", default="2g")
    parser.add_argument("--threads", type=int, default=1)
    parser.add_argument("--verify-batch-size", type=int, default=250)
    parser.add_argument("--max-seeds", type=int, default=None)
    parser.add_argument("--levels", nargs="+", choices=("master", "extreme"), default=["extreme"])
    parser.add_argument("--target-per-level", type=int, default=1_000_000)
    parser.add_argument("--chunk-size", type=int, default=10_000)
    parser.add_argument("--output-dir", type=Path, default=Path("data/puzzles/expanded-hard"))
    parser.add_argument("--random-seed", type=int, default=20260615)
    parser.add_argument("--master-min-rating", type=float, default=MASTER_MIN_RATING)
    parser.add_argument("--extreme-min-rating", type=float, default=EXTREME_MIN_RATING)
    parser.add_argument(
        "--catalog-only",
        action="store_true",
        help="Verify and write the seed catalog without expanding variants.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        _validate_args(args)
        puzzles = read_seed_puzzles(
            seed_zip=args.seed_zip if args.seed_file is None else None,
            seed_member=args.seed_member,
            seed_file=args.seed_file,
            max_seeds=args.max_seeds,
        )
        seeds = verify_seed_catalog(
            puzzles,
            catalog_path=args.seed_catalog,
            serate_jar=args.serate_jar,
            java_bin=args.java_bin,
            java_heap=args.java_heap,
            threads=args.threads,
            batch_size=args.verify_batch_size,
            master_min_rating=args.master_min_rating,
            extreme_min_rating=args.extreme_min_rating,
        )
        if args.catalog_only:
            print(json.dumps({"verified_seeds": len(seeds)}, sort_keys=True))
            return 0
        targets = {level: args.target_per_level for level in args.levels}
        counts = expand_seed_records(
            seeds,
            output_dir=args.output_dir,
            levels=tuple(args.levels),
            targets=targets,
            chunk_size=args.chunk_size,
            random_seed=args.random_seed,
        )
        print(json.dumps(counts, sort_keys=True))
        return 0
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1


def _house_order(rng: random.Random) -> list[int]:
    houses = [0, 1, 2]
    rng.shuffle(houses)
    order: list[int] = []
    for house in houses:
        offsets = [0, 1, 2]
        rng.shuffle(offsets)
        order.extend(house * 3 + offset for offset in offsets)
    return order


def _iter_seed_lines(*, seed_zip: Path | None, seed_member: str | None, seed_file: Path | None) -> Iterator[str]:
    if seed_file is not None:
        with seed_file.open("rt", encoding="utf-8") as handle:
            yield from handle
        return
    if seed_zip is None or seed_member is None:
        raise RuntimeError("provide either --seed-file or --seed-zip with --seed-member")
    with zipfile.ZipFile(seed_zip) as archive:
        with archive.open(seed_member) as handle:
            for raw_line in handle:
                yield raw_line.decode("utf-8")


def _seed_record_from_rating(rating: SerateRating, solution: str, level: str) -> SeedRecord:
    return SeedRecord(
        puzzle=rating.puzzle,
        solution=solution,
        level=level,
        se_rating=rating.rating,
        pearl_rating=rating.pearl,
        diamond_rating=rating.diamond,
        highest_technique_short=rating.technique_short,
        highest_technique=rating.technique,
    )


def _write_variant_record(
    *,
    output_dir: Path,
    level: str,
    record_index: int,
    chunk_size: int,
    seed: SeedRecord,
    puzzle: str,
    solution: str,
    source_index: int,
    variant_round: int,
    transform_seed: int,
) -> None:
    level_dir = output_dir / level
    level_dir.mkdir(parents=True, exist_ok=True)
    chunk_index = record_index // chunk_size
    path = level_dir / f"part-{chunk_index:06d}.ndjson.gz"
    record = {
        "id": f"{level}-{record_index:09d}",
        "puzzle": puzzle,
        "solution": solution,
        "level": level,
        "se_rating": seed.se_rating,
        "pearl_rating": seed.pearl_rating,
        "diamond_rating": seed.diamond_rating,
        "highest_technique_short": seed.highest_technique_short,
        "highest_technique": seed.highest_technique,
        "source_puzzle": seed.puzzle,
        "source_index": source_index,
        "variant_round": variant_round,
        "transform_seed": transform_seed,
    }
    with gzip.open(path, "at", encoding="utf-8") as handle:
        handle.write(json.dumps(record, sort_keys=True, separators=(",", ":")))
        handle.write("\n")


def _load_existing_output(output_dir: Path, levels: Iterable[str]) -> tuple[dict[str, int], set[str]]:
    counts = {level: 0 for level in levels}
    seen: set[str] = set()
    for level in levels:
        level_dir = output_dir / level
        if not level_dir.exists():
            continue
        for path in sorted(level_dir.glob("part-*.ndjson.gz")):
            with gzip.open(path, "rt", encoding="utf-8") as handle:
                for line in handle:
                    if not line.strip():
                        continue
                    record = json.loads(line)
                    counts[level] += 1
                    seen.add(str(record["puzzle"]))
    return counts, seen


def _write_expand_manifest(
    output_dir: Path,
    *,
    counts: dict[str, int],
    targets: dict[str, int],
    seed_count: int,
    random_seed: int,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "format": "ndjson.gz",
        "levels": counts,
        "targets": targets,
        "verified_seed_count": seed_count,
        "random_seed": random_seed,
        "transformations": [
            "digit relabeling",
            "row swaps within bands",
            "column swaps within stacks",
            "band swaps",
            "stack swaps",
            "transpose",
        ],
        "updated_at_unix": int(time.time()),
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")


def _print_expand_progress(counts: dict[str, int]) -> None:
    levels = " ".join(f"{level}={count}" for level, count in sorted(counts.items()))
    print(f"expanded {levels}", file=sys.stderr, flush=True)


def _validate_args(args: argparse.Namespace) -> None:
    if args.seed_file is None and not args.seed_zip.exists():
        raise RuntimeError(f"seed zip not found: {args.seed_zip}")
    if args.seed_file is not None and not args.seed_file.exists():
        raise RuntimeError(f"seed file not found: {args.seed_file}")
    if not args.serate_jar.exists():
        raise RuntimeError(f"serate jar not found: {args.serate_jar}")
    if args.verify_batch_size <= 0:
        raise RuntimeError("--verify-batch-size must be positive")
    if args.max_seeds is not None and args.max_seeds <= 0:
        raise RuntimeError("--max-seeds must be positive")
    if args.target_per_level <= 0:
        raise RuntimeError("--target-per-level must be positive")
    if args.chunk_size <= 0:
        raise RuntimeError("--chunk-size must be positive")
    if args.extreme_min_rating <= args.master_min_rating:
        raise RuntimeError("--extreme-min-rating must be greater than --master-min-rating")


if __name__ == "__main__":
    sys.exit(main())
