import gzip
import io
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.generate_hard_sudoku_corpus import (
    SerateRating,
    classify_rating,
    generate_corpus,
    iter_candidate_puzzles,
    main,
    normalize_puzzle,
    parse_serate_line,
    rate_batch,
    should_stop,
    solve_unique,
    summarize_ratings,
    write_manifest,
    write_record,
)


MASTER_PUZZLE = (
    "000694832"
    "004357196"
    "090002745"
    "070035004"
    "040008600"
    "031046000"
    "400000078"
    "000000420"
    "900400560"
)

MASTER_SOLUTION = (
    "715694832"
    "284357196"
    "396812745"
    "672935814"
    "549178623"
    "831246957"
    "463521978"
    "157689421"
    "928473561"
)

UNIQUE_PUZZLE = "530070000600195000098000060800060003400803001700020006060000280000419005000080079"
UNIQUE_SOLUTION = "534678912672195348198342567859761423426853791713924856961537284287419635345286179"


class HardCorpusGeneratorTests(unittest.TestCase):
    def test_classify_rating_splits_master_and_extreme(self):
        self.assertIsNone(classify_rating(7.9, master_min=8.0, extreme_min=9.0))
        self.assertEqual(classify_rating(8.0, master_min=8.0, extreme_min=9.0), "master")
        self.assertEqual(classify_rating(8.9, master_min=8.0, extreme_min=9.0), "master")
        self.assertEqual(classify_rating(9.0, master_min=8.0, extreme_min=9.0), "extreme")
        self.assertEqual(classify_rating(11.8, master_min=8.0, extreme_min=9.0), "extreme")

    def test_parse_serate_line_reads_tsv_format(self):
        line = f"{MASTER_PUZZLE}\t10.7\t10.2\t9.8\tDCFC\tDynamic Contradiction Forcing Chains"

        rating = parse_serate_line(line)

        self.assertEqual(rating.puzzle, MASTER_PUZZLE)
        self.assertEqual(rating.rating, 10.7)
        self.assertEqual(rating.pearl, 10.2)
        self.assertEqual(rating.diamond, 9.8)
        self.assertEqual(rating.technique_short, "DCFC")
        self.assertEqual(rating.technique, "Dynamic Contradiction Forcing Chains")

    def test_normalize_puzzle_accepts_dots_and_zeroes(self):
        puzzle = "." * 80 + "1"

        self.assertEqual(normalize_puzzle(puzzle), "0" * 80 + "1")

    def test_solve_unique_returns_solution_for_valid_puzzle(self):
        self.assertEqual(solve_unique(UNIQUE_PUZZLE), UNIQUE_SOLUTION)

    def test_write_record_chunks_as_gzip_ndjson(self):
        rating = SerateRating(
            puzzle=MASTER_PUZZLE,
            rating=8.4,
            pearl=8.1,
            diamond=7.2,
            technique_short="AIC",
            technique="Alternating Inference Chain",
        )

        with tempfile.TemporaryDirectory() as tmp:
            path = write_record(Path(tmp), "master", 0, rating, MASTER_SOLUTION, chunk_size=2)

            with gzip.open(path, "rt", encoding="utf-8") as handle:
                body = json.loads(handle.readline())

        self.assertEqual(path.name, "part-000000.ndjson.gz")
        self.assertEqual(body["puzzle"], MASTER_PUZZLE)
        self.assertEqual(body["solution"], MASTER_SOLUTION)
        self.assertEqual(body["level"], "master")
        self.assertEqual(body["se_rating"], 8.4)
        self.assertEqual(body["pearl_rating"], 8.1)
        self.assertEqual(body["diamond_rating"], 7.2)
        self.assertEqual(body["highest_technique"], "Alternating Inference Chain")

    def test_write_manifest_records_custom_thresholds(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_manifest(
                Path(tmp),
                counts={"master": 1, "extreme": 2},
                targets={"master": 10, "extreme": 10},
                generated=100,
                accepted=3,
                rejected=97,
                candidate_command=["generate"],
                master_min_rating=7.5,
                extreme_min_rating=9.0,
            )

            manifest = json.loads((Path(tmp) / "manifest.json").read_text(encoding="utf-8"))

        self.assertEqual(manifest["master_min_se_rating"], 7.5)
        self.assertEqual(manifest["extreme_min_se_rating"], 9.0)

    def test_candidate_stream_can_be_closed_early(self):
        command = [
            sys.executable,
            "-c",
            (
                "import time\n"
                "p = '0' * 81\n"
                "while True:\n"
                "    print(p, flush=True)\n"
                "    time.sleep(0.01)\n"
            ),
        ]

        stream = iter_candidate_puzzles(command)
        self.assertEqual(next(stream), "0" * 81)
        stream.close()

    def test_rate_batch_surfaces_serate_stderr(self):
        error = subprocess.CalledProcessError(
            1,
            ["java", "-cp", "SukakuExplainer.jar", "diuf.sudoku.test.serate"],
            stderr="Unable to locate a Java Runtime.",
        )

        with patch("scripts.generate_hard_sudoku_corpus.subprocess.run", side_effect=error):
            with self.assertRaisesRegex(RuntimeError, "Unable to locate a Java Runtime"):
                rate_batch(
                    [UNIQUE_PUZZLE],
                    Path("SukakuExplainer.jar"),
                    java_bin="java",
                    java_heap="2g",
                    threads=1,
                )

    def test_rate_batch_preserves_original_input_puzzle(self):
        completed = subprocess.CompletedProcess(
            ["java"],
            0,
            stdout=f"{UNIQUE_SOLUTION}\t9.1\t8.8\t8.4\tAIC\tAlternating Inference Chain\n",
            stderr="",
        )

        with patch("scripts.generate_hard_sudoku_corpus.subprocess.run", return_value=completed):
            ratings = rate_batch(
                [UNIQUE_PUZZLE],
                Path("SukakuExplainer.jar"),
                java_bin="java",
                java_heap="2g",
                threads=1,
            )

        self.assertEqual(ratings[0].puzzle, UNIQUE_PUZZLE)
        self.assertEqual(ratings[0].rating, 9.1)

    def test_main_prints_runtime_error_without_traceback(self):
        with patch("scripts.generate_hard_sudoku_corpus.generate_corpus", side_effect=RuntimeError("java missing")):
            stderr = io.StringIO()
            with patch("sys.stderr", stderr):
                result = main(
                    [
                        "--candidate-command",
                        "fake-generator",
                        "--serate-jar",
                        "SukakuExplainer.jar",
                    ]
                )

        self.assertEqual(result, 1)
        self.assertEqual(stderr.getvalue(), "java missing\n")

    def test_should_stop_respects_targets_and_candidate_cap(self):
        self.assertTrue(should_stop({"extreme": 1}, {"extreme": 1}, ("extreme",), 99, None))
        self.assertFalse(should_stop({"extreme": 0}, {"extreme": 1}, ("extreme",), 99, None))
        self.assertTrue(should_stop({"extreme": 0}, {"extreme": 1}, ("extreme",), 100, 100))
        self.assertFalse(should_stop({"extreme": 0}, {"extreme": 1}, ("extreme",), 99, 100))

    def test_generate_corpus_prints_batch_rating_summary(self):
        class Args:
            output_dir = Path(tempfile.mkdtemp())
            levels = ["extreme"]
            target_per_level = 1
            candidate_command = "fake-generator"
            serate_jar = Path("SukakuExplainer.jar")
            java_bin = "java"
            java_heap = "2g"
            threads = 1
            chunk_size = 1
            batch_size = 1
            max_candidates = 1
            master_min_rating = 8.0
            extreme_min_rating = 9.0

        rating = SerateRating(UNIQUE_PUZZLE, 9.1, 8.7, 8.2, "AIC", "Alternating Inference Chain")
        stderr = io.StringIO()
        with patch("scripts.generate_hard_sudoku_corpus.iter_candidate_puzzles", return_value=iter([UNIQUE_PUZZLE])):
            with patch("scripts.generate_hard_sudoku_corpus.rate_batch", return_value=[rating]):
                with patch("sys.stderr", stderr):
                    counts = generate_corpus(Args())

        self.assertEqual(counts["extreme"], 1)
        self.assertIn("avg_se=9.1", stderr.getvalue())
        self.assertIn("max_se=9.1", stderr.getvalue())

    def test_summarize_ratings_reports_count_average_and_max(self):
        ratings = [
            SerateRating(UNIQUE_PUZZLE, 7.5, 7.0, 6.8, "A", "A"),
            SerateRating(UNIQUE_PUZZLE, 8.5, 8.0, 7.8, "B", "B"),
            SerateRating(UNIQUE_PUZZLE, 9.0, 8.4, 8.0, "C", "C"),
        ]

        summary = summarize_ratings(ratings)

        self.assertEqual(summary["rated"], 3)
        self.assertEqual(summary["average"], 8.33)
        self.assertEqual(summary["maximum"], 9.0)


if __name__ == "__main__":
    unittest.main()
