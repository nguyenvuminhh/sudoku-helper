#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import os
import re
import shlex
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Iterator, Sequence


MASTER_MIN_RATING = 8.0
EXTREME_MIN_RATING = 10.0
SERATE_FORMAT = "%i%t%r%t%p%t%d%t%S%t%R"
PUZZLE_PATTERN = re.compile(r"[0-9.]{81}")
FULL_MASK = sum(1 << digit for digit in range(1, 10))


@dataclass(frozen=True)
class SerateRating:
    puzzle: str
    rating: float
    pearl: float
    diamond: float
    technique_short: str
    technique: str


def classify_rating(rating: float, *, master_min: float = MASTER_MIN_RATING, extreme_min: float = EXTREME_MIN_RATING) -> str | None:
    if rating >= extreme_min:
        return "extreme"
    if rating >= master_min:
        return "master"
    return None


def normalize_puzzle(value: str) -> str:
    puzzle = value.strip().replace(".", "0")
    if len(puzzle) != 81 or any(cell not in "0123456789" for cell in puzzle):
        raise ValueError("puzzle must contain exactly 81 digits, zeroes, or dots")
    return puzzle


def extract_puzzle(value: str) -> str:
    match = PUZZLE_PATTERN.search(value)
    if not match:
        raise ValueError("line does not contain an 81-character puzzle")
    return normalize_puzzle(match.group(0))


def parse_serate_line(line: str) -> SerateRating:
    parts = line.rstrip("\n").split("\t")
    if len(parts) != 6:
        raise ValueError(f"expected 6 tab-separated serate fields, got {len(parts)}: {line!r}")
    puzzle, rating, pearl, diamond, technique_short, technique = parts
    return SerateRating(
        puzzle=normalize_puzzle(puzzle),
        rating=float(rating),
        pearl=float(pearl),
        diamond=float(diamond),
        technique_short=technique_short,
        technique=technique,
    )


def solve_unique(puzzle: str) -> str:
    grid = [int(cell) for cell in normalize_puzzle(puzzle)]
    row_masks = [0] * 9
    col_masks = [0] * 9
    box_masks = [0] * 9

    for index, digit in enumerate(grid):
        if digit == 0:
            continue
        row = index // 9
        col = index % 9
        box = (row // 3) * 3 + (col // 3)
        bit = 1 << digit
        if row_masks[row] & bit or col_masks[col] & bit or box_masks[box] & bit:
            raise ValueError("puzzle has conflicting givens")
        row_masks[row] |= bit
        col_masks[col] |= bit
        box_masks[box] |= bit

    solutions: list[str] = []

    def search() -> None:
        if len(solutions) > 1:
            return

        best_index = -1
        best_mask = 0
        best_count = 10
        for index, digit in enumerate(grid):
            if digit != 0:
                continue
            row = index // 9
            col = index % 9
            box = (row // 3) * 3 + (col // 3)
            mask = FULL_MASK & ~(row_masks[row] | col_masks[col] | box_masks[box])
            count = mask.bit_count()
            if count == 0:
                return
            if count < best_count:
                best_index = index
                best_mask = mask
                best_count = count
                if count == 1:
                    break

        if best_index == -1:
            solutions.append("".join(str(digit) for digit in grid))
            return

        row = best_index // 9
        col = best_index % 9
        box = (row // 3) * 3 + (col // 3)
        mask = best_mask
        while mask:
            bit = mask & -mask
            digit = bit.bit_length() - 1
            grid[best_index] = digit
            row_masks[row] |= bit
            col_masks[col] |= bit
            box_masks[box] |= bit

            search()

            row_masks[row] ^= bit
            col_masks[col] ^= bit
            box_masks[box] ^= bit
            grid[best_index] = 0
            mask ^= bit

    search()
    if len(solutions) != 1:
        raise ValueError(f"expected exactly one solution, found {len(solutions)}")
    return solutions[0]


def write_record(
    output_dir: Path,
    level: str,
    record_index: int,
    rating: SerateRating,
    solution: str,
    chunk_size: int,
) -> Path:
    level_dir = output_dir / level
    level_dir.mkdir(parents=True, exist_ok=True)
    chunk_index = record_index // chunk_size
    path = level_dir / f"part-{chunk_index:06d}.ndjson.gz"
    record = {
        "id": f"{level}-{record_index:09d}",
        "puzzle": rating.puzzle,
        "solution": solution,
        "level": level,
        "se_rating": rating.rating,
        "pearl_rating": rating.pearl,
        "diamond_rating": rating.diamond,
        "highest_technique_short": rating.technique_short,
        "highest_technique": rating.technique,
    }
    with gzip.open(path, "at", encoding="utf-8") as handle:
        handle.write(json.dumps(record, sort_keys=True, separators=(",", ":")))
        handle.write("\n")
    return path


def summarize_ratings(ratings: Sequence[SerateRating]) -> dict[str, float | int | None]:
    if not ratings:
        return {"rated": 0, "average": None, "maximum": None}
    values = [rating.rating for rating in ratings]
    return {
        "rated": len(values),
        "average": round(sum(values) / len(values), 2),
        "maximum": round(max(values), 2),
    }


def iter_candidate_puzzles(command: Sequence[str]) -> Iterator[str]:
    process = subprocess.Popen(
        list(command),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
    )
    assert process.stdout is not None
    assert process.stderr is not None
    stopped_early = False
    try:
        for line in process.stdout:
            try:
                yield extract_puzzle(line)
            except ValueError:
                continue
    except GeneratorExit:
        stopped_early = True
        raise
    finally:
        if stopped_early and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        stderr = process.stderr.read()
        process.stdout.close()
        process.stderr.close()
        return_code = process.wait()
        if return_code != 0 and not stopped_early:
            raise RuntimeError(f"candidate command exited with {return_code}: {stderr.strip()}")


def rate_batch(
    puzzles: Sequence[str],
    serate_jar: Path,
    *,
    java_bin: str,
    java_heap: str,
    threads: int,
) -> list[SerateRating]:
    if not puzzles:
        return []

    with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False) as input_file:
        input_path = Path(input_file.name)
        for puzzle in puzzles:
            input_file.write(f"{puzzle}\n")

    try:
        command = [
            java_bin,
            "-Xrs",
            f"-Xmx{java_heap}",
            "-cp",
            str(serate_jar),
            "diuf.sudoku.test.serate",
            f"--format={SERATE_FORMAT}",
            f"--input={input_path}",
            "--output=-",
            f"--threads={threads}",
        ]
        try:
            completed = subprocess.run(
                command,
                check=True,
                capture_output=True,
                encoding="utf-8",
                timeout=None,
            )
        except subprocess.CalledProcessError as exc:
            message = (exc.stderr or exc.stdout or str(exc)).strip()
            raise RuntimeError(f"serate command failed with exit code {exc.returncode}: {message}") from exc
        parsed_ratings: list[SerateRating] = []
        for line in completed.stdout.splitlines():
            if not line.strip():
                continue
            parsed_ratings.append(parse_serate_line(line))
        if len(parsed_ratings) != len(puzzles):
            raise RuntimeError(f"serate returned {len(parsed_ratings)} ratings for {len(puzzles)} input puzzles")
        return [
            SerateRating(
                puzzle=puzzle,
                rating=rating.rating,
                pearl=rating.pearl,
                diamond=rating.diamond,
                technique_short=rating.technique_short,
                technique=rating.technique,
            )
            for puzzle, rating in zip(puzzles, parsed_ratings)
        ]
    finally:
        input_path.unlink(missing_ok=True)


def load_existing(output_dir: Path, levels: Iterable[str]) -> tuple[dict[str, int], set[str]]:
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


def write_manifest(
    output_dir: Path,
    *,
    counts: dict[str, int],
    targets: dict[str, int],
    generated: int,
    accepted: int,
    rejected: int,
    candidate_command: Sequence[str],
    master_min_rating: float,
    extreme_min_rating: float,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "format": "ndjson.gz",
        "levels": counts,
        "targets": targets,
        "generated_candidates": generated,
        "accepted_records": accepted,
        "rejected_candidates": rejected,
        "candidate_command": list(candidate_command),
        "rating_engine": "Sukaku Explainer serate",
        "solution_engine": "built-in bitmask backtracking uniqueness solver",
        "master_min_se_rating": master_min_rating,
        "extreme_min_se_rating": extreme_min_rating,
        "updated_at_unix": int(time.time()),
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")


def should_stop(
    counts: dict[str, int],
    targets: dict[str, int],
    levels: Sequence[str],
    generated: int,
    max_candidates: int | None,
) -> bool:
    if all(counts[level] >= targets[level] for level in levels):
        return True
    return max_candidates is not None and generated >= max_candidates


def print_progress(counts: dict[str, int], generated: int, accepted: int, rejected: int) -> None:
    levels = " ".join(f"{level}={count}" for level, count in sorted(counts.items()))
    print(
        f"progress candidates={generated} accepted={accepted} rejected={rejected} {levels}",
        file=sys.stderr,
        flush=True,
    )


def print_batch_progress(
    counts: dict[str, int],
    generated: int,
    accepted: int,
    rejected: int,
    ratings: Sequence[SerateRating],
) -> None:
    summary = summarize_ratings(ratings)
    levels = " ".join(f"{level}={count}" for level, count in sorted(counts.items()))
    average = summary["average"] if summary["average"] is not None else "n/a"
    maximum = summary["maximum"] if summary["maximum"] is not None else "n/a"
    print(
        f"progress candidates={generated} accepted={accepted} rejected={rejected} "
        f"rated={summary['rated']} avg_se={average} max_se={maximum} {levels}",
        file=sys.stderr,
        flush=True,
    )


def generate_corpus(args: argparse.Namespace) -> dict[str, int]:
    levels = tuple(args.levels)
    targets = {level: args.target_per_level for level in levels}
    counts, seen = load_existing(args.output_dir, levels)
    candidate_command = shlex.split(args.candidate_command)
    generated = 0
    accepted = sum(counts.values())
    rejected = 0
    batch: list[str] = []

    def process_batch(puzzles: Sequence[str]) -> list[SerateRating]:
        nonlocal accepted, rejected
        ratings = rate_batch(
            puzzles,
            args.serate_jar,
            java_bin=args.java_bin,
            java_heap=args.java_heap,
            threads=args.threads,
        )
        for rating in ratings:
            level = classify_rating(
                rating.rating,
                master_min=args.master_min_rating,
                extreme_min=args.extreme_min_rating,
            )
            if level not in targets or counts[level] >= targets[level] or rating.puzzle in seen:
                rejected += 1
                continue
            try:
                solution = solve_unique(rating.puzzle)
            except ValueError:
                rejected += 1
                continue
            write_record(args.output_dir, level, counts[level], rating, solution, args.chunk_size)
            counts[level] += 1
            accepted += 1
            seen.add(rating.puzzle)
        return ratings

    for puzzle in iter_candidate_puzzles(candidate_command):
        if should_stop(counts, targets, levels, generated, args.max_candidates):
            break
        generated += 1
        if puzzle in seen:
            rejected += 1
            continue
        batch.append(puzzle)
        if len(batch) >= args.batch_size:
            ratings = process_batch(batch)
            batch = []
            write_manifest(
                args.output_dir,
                counts=counts,
                targets=targets,
                generated=generated,
                accepted=accepted,
                rejected=rejected,
                candidate_command=candidate_command,
                master_min_rating=args.master_min_rating,
                extreme_min_rating=args.extreme_min_rating,
            )
            print_batch_progress(counts, generated, accepted, rejected, ratings)

    if batch:
        ratings = process_batch(batch)
        print_batch_progress(counts, generated, accepted, rejected, ratings)
    write_manifest(
        args.output_dir,
        counts=counts,
        targets=targets,
        generated=generated,
        accepted=accepted,
        rejected=rejected,
        candidate_command=candidate_command,
        master_min_rating=args.master_min_rating,
        extreme_min_rating=args.extreme_min_rating,
    )
    return counts


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Generate a chunked master/extreme Sudoku corpus using Tdoku candidates and serate ratings."
    )
    parser.add_argument(
        "--candidate-command",
        required=True,
        help="Command that writes candidate puzzle lines to stdout, for example a Tdoku generate command.",
    )
    parser.add_argument("--serate-jar", required=True, type=Path, help="Path to SukakuExplainer.jar.")
    parser.add_argument("--output-dir", type=Path, default=Path("data/puzzles/serate-hard"))
    parser.add_argument("--target-per-level", type=int, default=1_000_000)
    parser.add_argument("--levels", nargs="+", choices=("master", "extreme"), default=["master", "extreme"])
    parser.add_argument("--chunk-size", type=int, default=10_000)
    parser.add_argument("--batch-size", type=int, default=1_000)
    parser.add_argument(
        "--max-candidates",
        type=int,
        default=None,
        help="Stop after this many candidates even if target counts were not reached.",
    )
    parser.add_argument("--threads", type=int, default=max(1, os.cpu_count() or 1))
    parser.add_argument("--java-bin", default="java")
    parser.add_argument("--java-heap", default="2g")
    parser.add_argument("--master-min-rating", type=float, default=MASTER_MIN_RATING)
    parser.add_argument("--extreme-min-rating", type=float, default=EXTREME_MIN_RATING)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.chunk_size <= 0:
        raise SystemExit("--chunk-size must be positive")
    if args.batch_size <= 0:
        raise SystemExit("--batch-size must be positive")
    if args.target_per_level <= 0:
        raise SystemExit("--target-per-level must be positive")
    if args.max_candidates is not None and args.max_candidates <= 0:
        raise SystemExit("--max-candidates must be positive")
    if args.master_min_rating <= 0:
        raise SystemExit("--master-min-rating must be positive")
    if args.extreme_min_rating <= args.master_min_rating:
        raise SystemExit("--extreme-min-rating must be greater than --master-min-rating")
    if not args.serate_jar.exists():
        raise SystemExit(f"serate jar not found: {args.serate_jar}")

    try:
        counts = generate_corpus(args)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print(json.dumps(counts, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
