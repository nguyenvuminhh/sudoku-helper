#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import math
import os
import sys
import tempfile
from argparse import Namespace
from pathlib import Path
from typing import Any, Sequence

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.generate_hard_sudoku_corpus import generate_corpus


DEFAULT_TARGETS = (7.0, 8.0, 9.0)
DEFAULT_TOLERANCE = 0.2


def default_candidate_command() -> str:
    generator = PROJECT_ROOT / "tdoku" / "build" / "generate"
    return f"{generator} -p0 -c0 -g1 -d1 -n500 -e100 -s0 -l 50000 -a1"


def default_java_bin() -> str:
    homebrew_java = Path("/opt/homebrew/opt/openjdk/bin/java")
    return str(homebrew_java) if homebrew_java.exists() else "java"


def format_target(target: float) -> str:
    return f"{target:g}"


def rating_window(target: float, tolerance: float) -> tuple[float, float]:
    lower = round(target - tolerance, 10)
    inclusive_upper = round(target + tolerance, 10)
    return lower, math.nextafter(inclusive_upper, math.inf)


def build_generator_args(args: argparse.Namespace, *, target: float, output_dir: Path) -> argparse.Namespace:
    lower, upper = rating_window(target, args.tolerance)
    return Namespace(
        output_dir=output_dir,
        levels=["master"],
        target_per_level=1,
        candidate_command=args.candidate_command,
        serate_jar=args.serate_jar,
        java_bin=args.java_bin,
        java_heap=args.java_heap,
        threads=args.threads,
        chunk_size=args.chunk_size,
        batch_size=args.batch_size,
        max_candidates=args.max_candidates,
        master_min_rating=lower,
        extreme_min_rating=upper,
    )


def read_first_record(output_dir: Path) -> dict[str, Any]:
    level_dir = output_dir / "master"
    for path in sorted(level_dir.glob("part-*.ndjson.gz")):
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            for line in handle:
                if line.strip():
                    return json.loads(line)
    raise RuntimeError(f"no accepted target puzzle found in {level_dir}")


def generate_target_record(args: argparse.Namespace, *, target: float, root_output_dir: Path) -> dict[str, Any]:
    target_output_dir = root_output_dir / f"se-{format_target(target)}"
    generator_args = build_generator_args(args, target=target, output_dir=target_output_dir)
    counts = generate_corpus(generator_args)
    if counts.get("master", 0) < 1:
        lower, upper = rating_window(target, args.tolerance)
        raise RuntimeError(
            f"no puzzle found for SE {target:g} +/- {args.tolerance:g} "
            f"after {args.max_candidates} candidates; searched [{lower:g}, {upper:g})"
        )
    return read_first_record(target_output_dir)


def validate_args(args: argparse.Namespace) -> None:
    if args.tolerance <= 0:
        raise SystemExit("--tolerance must be positive")
    if args.batch_size <= 0:
        raise SystemExit("--batch-size must be positive")
    if args.chunk_size <= 0:
        raise SystemExit("--chunk-size must be positive")
    if args.max_candidates <= 0:
        raise SystemExit("--max-candidates must be positive")
    if args.threads <= 0:
        raise SystemExit("--threads must be positive")
    if not args.serate_jar.exists():
        raise SystemExit(f"serate jar not found: {args.serate_jar}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Generate one 81-character puzzle string near each requested Sukaku Explainer rating."
    )
    parser.add_argument("--targets", nargs="+", type=float, default=list(DEFAULT_TARGETS), help="Target SE ratings.")
    parser.add_argument("--tolerance", type=float, default=DEFAULT_TOLERANCE, help="Inclusive +/- rating tolerance.")
    parser.add_argument("--candidate-command", default=default_candidate_command())
    parser.add_argument("--serate-jar", type=Path, default=PROJECT_ROOT / "SukakuExplainer.jar")
    parser.add_argument("--java-bin", default=default_java_bin())
    parser.add_argument("--java-heap", default="2g")
    parser.add_argument("--threads", type=int, default=min(10, max(1, os.cpu_count() or 1)))
    parser.add_argument("--batch-size", type=int, default=100)
    parser.add_argument("--chunk-size", type=int, default=1)
    parser.add_argument("--max-candidates", type=int, default=50_000)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Optional directory to keep intermediate gzip NDJSON output. Defaults to a temporary directory.",
    )
    return parser


def run(args: argparse.Namespace) -> int:
    validate_args(args)
    temp_dir: tempfile.TemporaryDirectory[str] | None = None
    if args.output_dir is None:
        temp_dir = tempfile.TemporaryDirectory(prefix="serate-targets.")
        root_output_dir = Path(temp_dir.name)
    else:
        root_output_dir = args.output_dir
        root_output_dir.mkdir(parents=True, exist_ok=True)

    try:
        for target in args.targets:
            record = generate_target_record(args, target=target, root_output_dir=root_output_dir)
            print(f"{format_target(target)}\t{record['se_rating']}\t{record['puzzle']}")
    finally:
        if temp_dir is not None:
            temp_dir.cleanup()
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return run(args)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
