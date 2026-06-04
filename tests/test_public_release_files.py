import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class PublicReleaseFilesTests(unittest.TestCase):
    def test_public_release_files_exist(self):
        required_paths = [
            "LICENSE",
            ".gitignore",
            ".dockerignore",
            "Dockerfile",
            "frontend/.env.example",
            ".github/workflows/ci.yml",
            ".github/workflows/frontend-pages.yml",
            "THIRD_PARTY_NOTICES.md",
            "tools/sudoku-engine-cli/Cargo.toml",
        ]

        for relative_path in required_paths:
            with self.subTest(path=relative_path):
                self.assertTrue((ROOT / relative_path).exists())

    def test_backend_dockerfile_runs_fastapi_api_with_healthcheck(self):
        dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")

        self.assertIn("FROM python:", dockerfile)
        self.assertIn("requirements.txt", dockerfile)
        self.assertIn("requirements-model.txt", dockerfile)
        self.assertIn("FROM rust:", dockerfile)
        self.assertIn("tools/sudoku-engine-cli", dockerfile)
        self.assertIn("SUDOKU_ENGINE_BIN=/app/bin/sudoku-engine", dockerfile)
        self.assertIn("COPY --from=sudoku_engine_builder", dockerfile)
        self.assertIn("scripts/download_digit_model.py", dockerfile)
        self.assertNotIn("ARG INSTALL_MODEL", dockerfile)
        self.assertNotIn("ARG DOWNLOAD_MODEL", dockerfile)
        self.assertIn("EXPOSE 8001", dockerfile)
        self.assertIn("HEALTHCHECK", dockerfile)
        self.assertIn("uvicorn backend.app.main:app", dockerfile)

    def test_ci_builds_sudoku_engine_cli(self):
        workflow = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")

        self.assertIn("actions-rust-lang/setup-rust-toolchain", workflow)
        self.assertIn("cargo build --manifest-path tools/sudoku-engine-cli/Cargo.toml --release", workflow)

    def test_sudoku_engine_cli_pins_ukodus_source(self):
        cargo_toml = (ROOT / "tools" / "sudoku-engine-cli" / "Cargo.toml").read_text(encoding="utf-8")

        self.assertIn("sudoku-core", cargo_toml)
        self.assertIn("https://github.com/kcirtapfromspace/sudoku-core", cargo_toml)
        self.assertIn("ad8f024d507a52eff99fdd8b5173763487b30a31", cargo_toml)
        self.assertIn("MIT", cargo_toml)

    def test_requirements_include_fastapi_testclient_transport(self):
        requirements = (ROOT / "requirements.txt").read_text(encoding="utf-8")

        self.assertRegex(requirements, r"(?m)^httpx[<>=]")

    def test_frontend_pages_workflow_builds_static_export_with_api_base_url(self):
        workflow = (ROOT / ".github" / "workflows" / "frontend-pages.yml").read_text(encoding="utf-8")

        self.assertIn("actions/upload-pages-artifact", workflow)
        self.assertIn("actions/deploy-pages", workflow)
        self.assertIn("path: frontend/out", workflow)
        self.assertIn("NEXT_PUBLIC_API_BASE_URL", workflow)

    def test_next_config_supports_optional_github_pages_base_path(self):
        next_config = (ROOT / "frontend" / "next.config.ts").read_text(encoding="utf-8")

        self.assertIn("NEXT_PUBLIC_BASE_PATH", next_config)
        self.assertIn("basePath", next_config)
        self.assertIn("assetPrefix", next_config)

    def test_readme_documents_split_ec2_and_github_pages_deployment(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")

        self.assertIn("EC2", readme)
        self.assertIn("GitHub Pages", readme)
        self.assertIn("NEXT_PUBLIC_API_BASE_URL", readme)


if __name__ == "__main__":
    unittest.main()
