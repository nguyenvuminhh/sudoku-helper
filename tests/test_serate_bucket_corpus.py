import gzip
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.generate_hard_sudoku_corpus import SerateRating
from scripts.generate_serate_bucket_corpus import (
    DEFAULT_BUCKETS,
    Bucket,
    bucket_for_rating,
    generate_bucket_corpus,
    write_bucket_record,
)


PUZZLE = "530070000600195000098000060800060003400803001700020006060000280000419005000080079"
SOLUTION = "534678912672195348198342567859761423426853791713924856961537284287419635345286179"


class SerateBucketCorpusTests(unittest.TestCase):
    def test_default_buckets_cover_named_and_advanced_ranges(self):
        self.assertEqual(
            [(bucket.id, bucket.lower, bucket.upper) for bucket in DEFAULT_BUCKETS],
            [
                ("easy", 1.0, 2.0),
                ("medium", 2.0, 3.0),
                ("hard", 3.0, 4.0),
                ("expert", 4.0, 5.0),
                ("master", 5.0, 6.0),
                ("extreme", 6.0, 7.0),
                ("advanced_7_8", 7.0, 8.0),
                ("advanced_8_plus", 8.0, None),
            ],
        )

    def test_bucket_for_rating_uses_lower_inclusive_upper_exclusive_ranges(self):
        self.assertIsNone(bucket_for_rating(0.9, DEFAULT_BUCKETS))
        self.assertEqual(bucket_for_rating(1.0, DEFAULT_BUCKETS).id, "easy")
        self.assertEqual(bucket_for_rating(1.9, DEFAULT_BUCKETS).id, "easy")
        self.assertEqual(bucket_for_rating(2.0, DEFAULT_BUCKETS).id, "medium")
        self.assertEqual(bucket_for_rating(6.0, DEFAULT_BUCKETS).id, "extreme")
        self.assertEqual(bucket_for_rating(7.0, DEFAULT_BUCKETS).id, "advanced_7_8")
        self.assertEqual(bucket_for_rating(8.0, DEFAULT_BUCKETS).id, "advanced_8_plus")
        self.assertEqual(bucket_for_rating(12.3, DEFAULT_BUCKETS).id, "advanced_8_plus")

    def test_write_bucket_record_chunks_as_gzip_ndjson(self):
        bucket = Bucket("master", "Master", 5.0, 6.0)
        rating = SerateRating(PUZZLE, 5.4, 5.1, 4.9, "AIC", "Alternating Inference Chain")

        with tempfile.TemporaryDirectory() as tmp:
            path = write_bucket_record(Path(tmp), bucket, 0, rating, SOLUTION, chunk_size=2)
            with gzip.open(path, "rt", encoding="utf-8") as handle:
                record = json.loads(handle.readline())

        self.assertEqual(path.name, "part-000000.ndjson.gz")
        self.assertEqual(record["bucket"], "master")
        self.assertEqual(record["bucket_label"], "Master")
        self.assertEqual(record["range"], {"lower": 5.0, "upper": 6.0})
        self.assertEqual(record["puzzle"], PUZZLE)
        self.assertEqual(record["solution"], SOLUTION)
        self.assertEqual(record["se_rating"], 5.4)

    def test_generate_bucket_corpus_routes_rated_candidates_once(self):
        class Args:
            output_dir = Path(tempfile.mkdtemp())
            target_per_bucket = 1
            candidate_command = "fake-generator"
            serate_jar = Path("SukakuExplainer.jar")
            java_bin = "java"
            java_heap = "2g"
            threads = 1
            chunk_size = 1
            batch_size = 3
            max_candidates = 3
            buckets = DEFAULT_BUCKETS[:3]

        ratings = [
            SerateRating(PUZZLE, 1.4, 1.1, 1.0, "S", "Single"),
            SerateRating(PUZZLE.replace("5", "0", 1), 2.5, 2.2, 2.1, "LC", "Locked Candidate"),
            SerateRating(PUZZLE.replace("3", "0", 1), 3.5, 3.1, 3.0, "NP", "Naked Pair"),
        ]

        with patch("scripts.generate_serate_bucket_corpus.iter_candidate_puzzles", return_value=iter([r.puzzle for r in ratings])):
            with patch("scripts.generate_serate_bucket_corpus.rate_batch", return_value=ratings):
                with patch("scripts.generate_serate_bucket_corpus.solve_unique", return_value=SOLUTION):
                    counts = generate_bucket_corpus(Args())

        self.assertEqual(counts, {"easy": 1, "medium": 1, "hard": 1})
        self.assertTrue((Args.output_dir / "manifest.json").exists())


if __name__ == "__main__":
    unittest.main()
