import json
import os
import stat
import tempfile
import textwrap
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.app.sudoku.engine import DifficultyLevel, EngineUnavailable, generate_puzzle, hint_with_engine, rate_puzzle


ROOT = Path(__file__).resolve().parents[1]


class SudokuEngineTests(unittest.TestCase):
    def test_difficulty_catalog_covers_easy_to_master_techniques(self):
        self.assertEqual([level.id for level in DifficultyLevel.catalog()], ["easy", "medium", "hard", "expert", "master"])

        easy = DifficultyLevel.for_id("easy")
        medium = DifficultyLevel.for_id("medium")
        hard = DifficultyLevel.for_id("hard")
        expert = DifficultyLevel.for_id("expert")
        master = DifficultyLevel.for_id("master")

        self.assertIn("naked_single", easy.techniques)
        self.assertIn("hidden_single", easy.techniques)
        self.assertIn("locked_candidate", medium.techniques)
        self.assertIn("naked_pair", medium.techniques)
        self.assertIn("hidden_pair", hard.techniques)
        self.assertIn("naked_tuple", hard.techniques)
        self.assertIn("x_wing", expert.techniques)
        self.assertIn("swordfish", expert.techniques)
        self.assertIn("coloring", expert.techniques)
        self.assertIn("jellyfish", master.techniques)
        self.assertIn("als_xz", master.techniques)
        self.assertIn("forcing_chain", master.techniques)
        self.assertIn("unique_rectangle", master.techniques)

    def test_generate_puzzle_invokes_engine_binary_and_preserves_attribution(self):
        with tempfile.TemporaryDirectory() as tmp:
            engine = _write_fake_engine(Path(tmp) / "fake-engine")
            with patch.dict(os.environ, {"SUDOKU_ENGINE_BIN": str(engine)}):
                generated = generate_puzzle("expert", seed=11)

        self.assertEqual(generated.level.id, "expert")
        self.assertEqual(generated.puzzle, "0" * 80 + "1")
        self.assertEqual(generated.solution, "1" * 81)
        self.assertEqual(generated.se_rating, 4.7)
        self.assertEqual(generated.techniques, ["x_wing", "hidden_rectangle"])
        self.assertEqual(generated.attribution.name, "Ukodus sudoku-core")
        self.assertIn("github.com/kcirtapfromspace/sudoku-core", generated.attribution.url)

    def test_rate_puzzle_invokes_engine_binary(self):
        with tempfile.TemporaryDirectory() as tmp:
            engine = _write_fake_engine(Path(tmp) / "fake-engine")
            with patch.dict(os.environ, {"SUDOKU_ENGINE_BIN": str(engine)}):
                rating = rate_puzzle("0" * 81)

        self.assertEqual(rating.level.id, "expert")
        self.assertEqual(rating.techniques, ["x_wing", "hidden_rectangle"])

    def test_hint_with_engine_invokes_hint_command_with_candidate_payload(self):
        with tempfile.TemporaryDirectory() as tmp:
            calls_path = Path(tmp) / "calls.json"
            engine = _write_fake_engine(Path(tmp) / "fake-engine", calls_path=calls_path)
            candidates = {0: {1, 2}, 1: {3}}

            with patch.dict(os.environ, {"SUDOKU_ENGINE_BIN": str(engine)}):
                hint = hint_with_engine([0] * 81, candidates=candidates)
            calls = json.loads(calls_path.read_text(encoding="utf-8"))

        self.assertEqual(hint["technique"]["id"], "x_wing")
        self.assertEqual(hint["action"]["type"], "eliminate")
        self.assertEqual(calls[0:2], ["hint", "0" * 81])
        self.assertEqual(calls[2], "--candidates")
        self.assertEqual(json.loads(calls[3]), {"0": [1, 2], "1": [3]})

    def test_missing_engine_is_reported_without_crashing_api(self):
        with patch.dict(os.environ, {"SUDOKU_ENGINE_BIN": "/missing/sudoku-engine"}):
            with self.assertRaises(EngineUnavailable):
                generate_puzzle("easy", seed=1)

    def test_third_party_notice_tributes_ukodus_source(self):
        notice = (ROOT / "THIRD_PARTY_NOTICES.md").read_text(encoding="utf-8")

        self.assertIn("Ukodus", notice)
        self.assertIn("sudoku-core", notice)
        self.assertIn("Patrick Deutsch", notice)
        self.assertIn("MIT", notice)
        self.assertIn("ad8f024d507a52eff99fdd8b5173763487b30a31", notice)


def _write_fake_engine(path: Path, calls_path: Path | None = None) -> Path:
    puzzle_payload = {
        "puzzle": "0" * 80 + "1",
        "solution": "1" * 81,
        "level": "expert",
        "requested_level": "expert",
        "se_rating": 4.7,
        "techniques": ["x_wing", "hidden_rectangle"],
        "technique_profile": {"x_wing": 1, "hidden_rectangle": 1},
        "attribution": {
            "name": "Ukodus sudoku-core",
            "url": "https://github.com/kcirtapfromspace/sudoku-core",
            "license": "MIT",
        },
    }
    hint_payload = {
        "technique": {"id": "x_wing", "name": "X-Wing", "rank": 32},
        "action": {
            "type": "eliminate",
            "cell": None,
            "digit": None,
            "eliminations": [{"cell": {"row": 1, "col": 1}, "digit": 2}],
        },
        "summary": "Remove 2 from R1C1 using X-Wing.",
        "explanation": ["Conclusion: remove 2 from R1C1.", "Engine explanation."],
        "highlights": {
            "primary_cells": [{"row": 1, "col": 1}],
            "related_cells": [],
            "eliminations": [{"cell": {"row": 1, "col": 1}, "digit": 2}],
        },
    }
    script = textwrap.dedent(
        f"""\
        #!/usr/bin/env python3
        import json
        import sys

        calls_path = {json.dumps(str(calls_path) if calls_path else "")}
        if calls_path:
            open(calls_path, "w", encoding="utf-8").write(json.dumps(sys.argv[1:]))

        if sys.argv[1] in ("generate", "rate"):
            print(json.dumps(json.loads({json.dumps(json.dumps(puzzle_payload))})))
        elif sys.argv[1] == "hint":
            print(json.dumps(json.loads({json.dumps(json.dumps(hint_payload))})))
        else:
            print("unsupported command", file=sys.stderr)
            sys.exit(2)
        """
    )
    path.write_text(script, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR)
    return path


if __name__ == "__main__":
    unittest.main()
