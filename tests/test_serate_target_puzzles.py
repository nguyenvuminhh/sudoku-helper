import gzip
import json
import tempfile
import unittest
from argparse import Namespace
from pathlib import Path
from unittest.mock import patch

from scripts.generate_hard_sudoku_corpus import classify_rating
from scripts.generate_serate_target_puzzles import (
    build_generator_args,
    default_candidate_command,
    generate_target_record,
    rating_window,
)


PUZZLE = "0" * 80 + "1"


class SerateTargetPuzzleTests(unittest.TestCase):
    def test_rating_window_accepts_target_plus_or_minus_tolerance(self):
        lower, upper = rating_window(7.0, 0.2)

        self.assertIsNone(classify_rating(6.7, master_min=lower, extreme_min=upper))
        self.assertEqual(classify_rating(6.8, master_min=lower, extreme_min=upper), "master")
        self.assertEqual(classify_rating(7.2, master_min=lower, extreme_min=upper), "master")
        self.assertEqual(classify_rating(7.3, master_min=lower, extreme_min=upper), "extreme")

    def test_build_generator_args_uses_narrow_master_band(self):
        with tempfile.TemporaryDirectory() as tmp:
            args = Namespace(
                batch_size=100,
                candidate_command="generate",
                chunk_size=1,
                java_bin="java",
                java_heap="2g",
                max_candidates=50000,
                serate_jar=Path("SukakuExplainer.jar"),
                threads=10,
                tolerance=0.2,
            )

            generator_args = build_generator_args(args, target=8.0, output_dir=Path(tmp))

        self.assertEqual(generator_args.levels, ["master"])
        self.assertEqual(generator_args.target_per_level, 1)
        self.assertEqual(generator_args.master_min_rating, 7.8)
        self.assertGreater(generator_args.extreme_min_rating, 8.2)
        self.assertLess(generator_args.extreme_min_rating, 8.21)

    def test_generate_target_record_returns_record_written_by_generator(self):
        def fake_generate_corpus(generator_args):
            output = generator_args.output_dir / "master"
            output.mkdir(parents=True)
            with gzip.open(output / "part-000000.ndjson.gz", "wt", encoding="utf-8") as handle:
                handle.write(json.dumps({"puzzle": PUZZLE, "se_rating": 8.9}))
                handle.write("\n")
            return {"master": 1}

        args = Namespace(
            batch_size=100,
            candidate_command="generate",
            chunk_size=1,
            java_bin="java",
            java_heap="2g",
            max_candidates=50000,
            serate_jar=Path("SukakuExplainer.jar"),
            threads=10,
            tolerance=0.2,
        )
        with tempfile.TemporaryDirectory() as tmp:
            with patch("scripts.generate_serate_target_puzzles.generate_corpus", side_effect=fake_generate_corpus):
                record = generate_target_record(args, target=9.0, root_output_dir=Path(tmp))

        self.assertEqual(record["puzzle"], PUZZLE)
        self.assertEqual(record["se_rating"], 8.9)

    def test_default_candidate_command_uses_repo_local_tdoku(self):
        command = default_candidate_command()

        self.assertIn("tdoku/build/generate", command)
        self.assertIn("-n500", command)


if __name__ == "__main__":
    unittest.main()
