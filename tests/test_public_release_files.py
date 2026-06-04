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
            ".env.example",
            "frontend/.env.example",
            ".github/workflows/ci.yml",
            ".github/workflows/frontend-pages.yml",
            "docs/deployment.md",
        ]

        for relative_path in required_paths:
            with self.subTest(path=relative_path):
                self.assertTrue((ROOT / relative_path).exists())

    def test_backend_dockerfile_runs_fastapi_api_with_healthcheck(self):
        dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")

        self.assertIn("FROM python:", dockerfile)
        self.assertIn("requirements.txt", dockerfile)
        self.assertIn("requirements-model.txt", dockerfile)
        self.assertIn("scripts/download_digit_model.py", dockerfile)
        self.assertNotIn("ARG INSTALL_MODEL", dockerfile)
        self.assertNotIn("ARG DOWNLOAD_MODEL", dockerfile)
        self.assertIn("EXPOSE 8001", dockerfile)
        self.assertIn("HEALTHCHECK", dockerfile)
        self.assertIn("uvicorn backend.app.main:app", dockerfile)

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
