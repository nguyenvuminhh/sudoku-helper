import gzip
import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

from scripts.expand_hard_sudoku_seeds import (
    SeedRecord,
    apply_transform,
    expand_seed_records,
    identity_transform,
    read_seed_puzzles,
)


PUZZLE = "530070000600195000098000060800060003400803001700020006060000280000419005000080079"
SOLUTION = "534678912672195348198342567859761423426853791713924856961537284287419635345286179"


class HardSeedExpansionTests(unittest.TestCase):
    def test_read_seed_puzzles_reads_zip_member(self):
        with tempfile.TemporaryDirectory() as tmp:
            archive = Path(tmp) / "seeds.zip"
            with zipfile.ZipFile(archive, "w") as handle:
                handle.writestr("data/seeds", f"# comment\n{PUZZLE.replace('0', '.')}\n\n")

            puzzles = list(read_seed_puzzles(seed_zip=archive, seed_member="data/seeds", seed_file=None, max_seeds=None))

        self.assertEqual(puzzles, [PUZZLE])

    def test_identity_transform_leaves_puzzle_and_solution_compatible(self):
        transform = identity_transform()

        transformed_puzzle = apply_transform(PUZZLE, transform)
        transformed_solution = apply_transform(SOLUTION, transform)

        self.assertEqual(transformed_puzzle, PUZZLE)
        self.assertEqual(transformed_solution, SOLUTION)
        for index, digit in enumerate(transformed_puzzle):
            if digit != "0":
                self.assertEqual(transformed_solution[index], digit)

    def test_expand_seed_records_writes_chunked_variants(self):
        seed = SeedRecord(
            puzzle=PUZZLE,
            solution=SOLUTION,
            level="extreme",
            se_rating=11.1,
            pearl_rating=10.9,
            diamond_rating=10.5,
            highest_technique_short="FC",
            highest_technique="Forcing Chain",
        )

        with tempfile.TemporaryDirectory() as tmp:
            output_dir = Path(tmp)
            counts = expand_seed_records(
                [seed],
                output_dir=output_dir,
                levels=("extreme",),
                targets={"extreme": 3},
                chunk_size=2,
                random_seed=123,
            )
            files = sorted((output_dir / "extreme").glob("part-*.ndjson.gz"))
            records = []
            for path in files:
                with gzip.open(path, "rt", encoding="utf-8") as handle:
                    records.extend(json.loads(line) for line in handle if line.strip())

        self.assertEqual(counts, {"extreme": 3})
        self.assertEqual([path.name for path in files], ["part-000000.ndjson.gz", "part-000001.ndjson.gz"])
        self.assertEqual(len(records), 3)
        self.assertEqual(len({record["puzzle"] for record in records}), 3)
        self.assertTrue(all(record["source_puzzle"] == PUZZLE for record in records))
        self.assertTrue(all(record["level"] == "extreme" for record in records))
        self.assertTrue(all(len(record["solution"]) == 81 for record in records))
        for record in records:
            for index, digit in enumerate(record["puzzle"]):
                if digit != "0":
                    self.assertEqual(record["solution"][index], digit)

    def test_script_help_runs_when_executed_directly(self):
        completed = subprocess.run(
            [sys.executable, "scripts/expand_hard_sudoku_seeds.py", "--help"],
            check=False,
            capture_output=True,
            encoding="utf-8",
        )

        self.assertEqual(completed.returncode, 0)
        self.assertIn("Verify hard-rated Sudoku seeds", completed.stdout)


if __name__ == "__main__":
    unittest.main()
