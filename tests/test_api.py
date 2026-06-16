import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app.sudoku.engine import Attribution, DifficultyLevel, GeneratedPuzzle
from backend.app.main import _parse_cors_origins, create_app


class ApiTests(unittest.TestCase):
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
        with tempfile.TemporaryDirectory() as tmp:
            client = TestClient(create_app(static_dir=None))

            with patch.dict("os.environ", {"PUZZLE_HINT_SERATE_CORPUS_DIR": str(Path(tmp) / "empty-corpus")}):
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
