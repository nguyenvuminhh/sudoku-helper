import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app.sudoku.engine import Attribution, DifficultyLevel, GeneratedPuzzle
from backend.app.sudoku.grid import candidate_map, parse_grid
from backend.app.main import _parse_cors_origins, create_app


REFERENCE_GRID = (
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

LOCKED_CANDIDATE_GRID = (
    "000010020"
    "108267304"
    "623000000"
    "900026000"
    "200000003"
    "000590201"
    "000030708"
    "301970400"
    "070050030"
)


class ApiTests(unittest.TestCase):
    def test_hint_endpoint_returns_structured_hint(self):
        client = TestClient(create_app(static_dir=None))

        response = client.post("/api/sudoku/hint", json={"grid": REFERENCE_GRID})

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["technique"]["id"], "hidden_single")
        self.assertEqual(body["action"]["cell"], {"row": 5, "col": 9})
        self.assertEqual(body["action"]["digit"], 3)

    def test_hint_endpoint_prefers_engine_hint_when_available(self):
        client = TestClient(create_app(static_dir=None))
        engine_hint = {
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

        with patch("backend.app.main.hint_with_engine", return_value=engine_hint):
            response = client.post("/api/sudoku/hint", json={"grid": REFERENCE_GRID})

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["technique"]["id"], "x_wing")
        self.assertEqual(body["summary"], "Remove 2 from R1C1 using X-Wing.")

    def test_hint_endpoint_uses_candidate_payload_to_skip_applied_elimination(self):
        client = TestClient(create_app(static_dir=None))
        candidates = {
            str(index): sorted(digits)
            for index, digits in candidate_map(parse_grid(LOCKED_CANDIDATE_GRID)).items()
        }
        candidates["3"].remove(4)
        candidates["5"].remove(4)

        response = client.post(
            "/api/sudoku/hint",
            json={"grid": LOCKED_CANDIDATE_GRID, "candidates": candidates},
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertNotEqual(body["summary"], "4 is locked in row 1 inside box 1.")
        self.assertNotEqual(
            body["action"]["eliminations"],
            [
                {"cell": {"row": 1, "col": 4}, "digit": 4},
                {"cell": {"row": 1, "col": 6}, "digit": 4},
            ],
        )

    def test_invalid_grid_blocks_hinting(self):
        client = TestClient(create_app(static_dir=None))

        response = client.post("/api/sudoku/hint", json={"grid": "11" + "0" * 79})

        self.assertEqual(response.status_code, 422)
        self.assertIn("conflicts", response.json()["detail"][0])

    def test_generate_endpoint_returns_rated_puzzle(self):
        client = TestClient(create_app(static_dir=None))
        generated = GeneratedPuzzle(
            puzzle="0" * 80 + "1",
            solution="1" * 81,
            level=DifficultyLevel.for_id("expert"),
            requested_level=DifficultyLevel.for_id("expert"),
            se_rating=4.7,
            techniques=["x_wing", "hidden_rectangle"],
            technique_profile={"x_wing": 1, "hidden_rectangle": 1},
            attribution=Attribution.ukodus(),
        )

        with patch("backend.app.main.generate_puzzle", return_value=generated):
            response = client.post("/api/sudoku/generate", json={"level": "expert", "seed": 11})

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["level"]["id"], "expert")
        self.assertEqual(len(body["puzzle"]), 81)
        self.assertEqual(len(body["solution"]), 81)
        self.assertTrue(body["techniques"])
        self.assertEqual(body["attribution"]["name"], "Ukodus sudoku-core")

    def test_generate_endpoint_reports_missing_engine(self):
        client = TestClient(create_app(static_dir=None))

        response = client.post("/api/sudoku/generate", json={"level": "easy", "seed": 11})

        self.assertEqual(response.status_code, 503)
        self.assertIn("engine", response.json()["detail"][0]["message"].lower())

    def test_create_app_serves_static_frontend_build(self):
        with tempfile.TemporaryDirectory() as tmp:
            static_dir = Path(tmp)
            (static_dir / "index.html").write_text("<main>Sudoku tutor</main>", encoding="utf-8")
            client = TestClient(create_app(static_dir=static_dir))

            response = client.get("/")

        self.assertEqual(response.status_code, 200)
        self.assertIn("Sudoku tutor", response.text)

    def test_cors_origins_are_configurable_for_split_frontend_deploy(self):
        origin = "https://example.github.io"
        client = TestClient(create_app(static_dir=None, cors_origins=[origin]))

        response = client.options(
            "/api/health",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "GET",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["access-control-allow-origin"], origin)

    def test_parse_cors_origins_defaults_to_wildcard(self):
        self.assertEqual(_parse_cors_origins(None), ["*"])
        self.assertEqual(_parse_cors_origins(""), ["*"])
        self.assertEqual(_parse_cors_origins("https://one.example, https://two.example"), ["https://one.example", "https://two.example"])


if __name__ == "__main__":
    unittest.main()
