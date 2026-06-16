#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import os
import shlex
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable, Sequence

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.generate_hard_sudoku_corpus import (
    SerateRating,
    iter_candidate_puzzles,
    rate_batch,
    solve_unique,
    summarize_ratings,
)


@dataclass(frozen=True)
class Bucket:
    id: str
    label: str
    lower: float
    upper: float | None


DEFAULT_BUCKETS = (
    Bucket("easy", "Easy", 1.0, 2.0),
    Bucket("medium", "Medium", 2.0, 3.0),
    Bucket("hard", "Hard", 3.0, 4.0),
    Bucket("expert", "Expert", 4.0, 5.0),
    Bucket("master", "Master", 5.0, 6.0),
    Bucket("extreme", "Extreme", 6.0, 7.0),
    Bucket("advanced_7_8", "Advanced 7-8", 7.0, 8.0),
    Bucket("advanced_8_plus", "Advanced 8+", 8.0, None),
)


def default_candidate_command() -> str:
    generator = PROJECT_ROOT / "tdoku" / "build" / "generate"
    return f"{generator} -p0 -c0 -g1 -d1 -n500 -e100 -s0 -a1"


def default_java_bin() -> str:
    homebrew_java = Path("/opt/homebrew/opt/openjdk/bin/java")
    return str(homebrew_java) if homebrew_java.exists() else "java"


def bucket_for_rating(rating: float, buckets: Sequence[Bucket]) -> Bucket | None:
    for bucket in buckets:
        if rating < bucket.lower:
            continue
        if bucket.upper is None or rating < bucket.upper:
            return bucket
    return None


def write_bucket_record(
    output_dir: Path,
    bucket: Bucket,
    record_index: int,
    rating: SerateRating,
    solution: str,
    chunk_size: int,
) -> Path:
    bucket_dir = output_dir / bucket.id
    bucket_dir.mkdir(parents=True, exist_ok=True)

    chunk_index = record_index // chunk_size
    path = bucket_dir / f"part-{chunk_index:06d}.ndjson.gz"

    record = {
        "id": f"{bucket.id}-{record_index:09d}",
        "bucket": bucket.id,
        "bucket_label": bucket.label,
        "range": {"lower": bucket.lower, "upper": bucket.upper},
        "puzzle": rating.puzzle,
        "solution": solution,
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


def generate_bucket_corpus(args: argparse.Namespace) -> dict[str, int]:
    started_at = time.time()

    buckets = tuple(args.buckets)
    targets = {bucket.id: args.target_per_bucket for bucket in buckets}

    counts, seen = load_existing(args.output_dir, buckets)
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
            bucket = bucket_for_rating(rating.rating, buckets)

            if bucket is None:
                rejected += 1
                continue

            if counts[bucket.id] >= targets[bucket.id]:
                rejected += 1
                continue

            if rating.puzzle in seen:
                rejected += 1
                continue

            try:
                solution = solve_unique(rating.puzzle)
            except ValueError:
                rejected += 1
                continue

            write_bucket_record(
                args.output_dir,
                bucket,
                counts[bucket.id],
                rating,
                solution,
                args.chunk_size,
            )

            counts[bucket.id] += 1
            accepted += 1
            seen.add(rating.puzzle)

        return ratings

    for puzzle in iter_candidate_puzzles(candidate_command):
        if should_stop(counts, targets, generated, args.max_candidates):
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
                buckets=buckets,
                counts=counts,
                targets=targets,
                generated=generated,
                accepted=accepted,
                rejected=rejected,
                candidate_command=candidate_command,
                started_at=started_at,
            )

            print_progress(
                counts,
                generated,
                accepted,
                rejected,
                ratings,
                started_at,
            )

    if batch:
        ratings = process_batch(batch)

        print_progress(
            counts,
            generated,
            accepted,
            rejected,
            ratings,
            started_at,
        )

    write_manifest(
        args.output_dir,
        buckets=buckets,
        counts=counts,
        targets=targets,
        generated=generated,
        accepted=accepted,
        rejected=rejected,
        candidate_command=candidate_command,
        started_at=started_at,
    )

    return counts


def load_existing(output_dir: Path, buckets: Iterable[Bucket]) -> tuple[dict[str, int], set[str]]:
    counts = {bucket.id: 0 for bucket in buckets}
    seen: set[str] = set()

    for bucket in buckets:
        bucket_dir = output_dir / bucket.id

        if not bucket_dir.exists():
            continue

        for path in sorted(bucket_dir.glob("part-*.ndjson.gz")):
            with gzip.open(path, "rt", encoding="utf-8") as handle:
                for line in handle:
                    if not line.strip():
                        continue

                    record = json.loads(line)
                    counts[bucket.id] += 1
                    seen.add(str(record["puzzle"]))

    return counts, seen


def should_stop(
    counts: dict[str, int],
    targets: dict[str, int],
    generated: int,
    max_candidates: int | None,
) -> bool:
    if all(counts[bucket_id] >= target for bucket_id, target in targets.items()):
        return True

    return max_candidates is not None and generated >= max_candidates


def format_duration(seconds: float) -> str:
    seconds_int = int(seconds)

    hours, remainder = divmod(seconds_int, 3600)
    minutes, seconds = divmod(remainder, 60)

    if hours > 0:
        return f"{hours}h{minutes:02d}m{seconds:02d}s"

    if minutes > 0:
        return f"{minutes}m{seconds:02d}s"

    return f"{seconds}s"


def write_manifest(
    output_dir: Path,
    *,
    buckets: Sequence[Bucket],
    counts: dict[str, int],
    targets: dict[str, int],
    generated: int,
    accepted: int,
    rejected: int,
    candidate_command: Sequence[str],
    started_at: float,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    now = time.time()

    manifest = {
        "format": "ndjson.gz",
        "buckets": [
            {
                "id": bucket.id,
                "label": bucket.label,
                "lower": bucket.lower,
                "upper": bucket.upper,
            }
            for bucket in buckets
        ],
        "counts": counts,
        "targets": targets,
        "generated_candidates": generated,
        "accepted_records": accepted,
        "rejected_candidates": rejected,
        "candidate_command": list(candidate_command),
        "rating_engine": "Sukaku Explainer serate",
        "solution_engine": "built-in bitmask backtracking uniqueness solver",
        "started_at_unix": int(started_at),
        "updated_at_unix": int(now),
        "elapsed_seconds": int(now - started_at),
    }

    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True),
        encoding="utf-8",
    )


def print_progress(
    counts: dict[str, int],
    generated: int,
    accepted: int,
    rejected: int,
    ratings: Sequence[SerateRating],
    started_at: float,
) -> None:
    now = time.time()
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    elapsed = format_duration(now - started_at)

    summary = summarize_ratings(ratings)

    average = summary["average"] if summary["average"] is not None else "n/a"
    maximum = summary["maximum"] if summary["maximum"] is not None else "n/a"
    bucket_counts = " ".join(f"{key}={value}" for key, value in sorted(counts.items()))

    print(
        f"[{timestamp}] elapsed={elapsed} "
        f"progress candidates={generated} accepted={accepted} rejected={rejected} "
        f"rated={summary['rated']} avg_se={average} max_se={maximum} {bucket_counts}",
        file=sys.stderr,
        flush=True,
    )


def parse_bucket_ids(raw_ids: Sequence[str]) -> tuple[Bucket, ...]:
    by_id = {bucket.id: bucket for bucket in DEFAULT_BUCKETS}
    buckets: list[Bucket] = []

    for raw_id in raw_ids:
        if raw_id not in by_id:
            raise SystemExit(f"unknown bucket: {raw_id}")

        buckets.append(by_id[raw_id])

    return tuple(buckets)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Generate Sudoku puzzles into Sukaku Explainer rating buckets."
    )

    parser.add_argument("--candidate-command", default=default_candidate_command())
    parser.add_argument("--serate-jar", type=Path, default=PROJECT_ROOT / "SukakuExplainer.jar")
    parser.add_argument("--java-bin", default=default_java_bin())
    parser.add_argument("--java-heap", default="2g")
    parser.add_argument("--threads", type=int, default=min(10, max(1, os.cpu_count() or 1)))
    parser.add_argument("--target-per-bucket", type=int, default=1_000_000)
    parser.add_argument("--chunk-size", type=int, default=10_000)
    parser.add_argument("--batch-size", type=int, default=250)
    parser.add_argument("--max-candidates", type=int, default=None)
    parser.add_argument("--output-dir", type=Path, default=Path("data/puzzles/serate-buckets"))

    parser.add_argument(
        "--buckets",
        nargs="+",
        default=[bucket.id for bucket in DEFAULT_BUCKETS],
        help="Subset of bucket ids to fill.",
    )

    return parser


def validate_args(args: argparse.Namespace) -> None:
    if args.target_per_bucket <= 0:
        raise SystemExit("--target-per-bucket must be positive")

    if args.chunk_size <= 0:
        raise SystemExit("--chunk-size must be positive")

    if args.batch_size <= 0:
        raise SystemExit("--batch-size must be positive")

    if args.max_candidates is not None and args.max_candidates <= 0:
        raise SystemExit("--max-candidates must be positive")

    if args.threads <= 0:
        raise SystemExit("--threads must be positive")

    if not args.serate_jar.exists():
        raise SystemExit(f"serate jar not found: {args.serate_jar}")


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    args.buckets = parse_bucket_ids(args.buckets)

    validate_args(args)

    try:
        counts = generate_bucket_corpus(args)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    print(json.dumps(counts, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())