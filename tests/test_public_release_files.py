import unittest
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class PublicReleaseFilesTests(unittest.TestCase):
    def test_public_release_files_exist(self):
        required_paths = [
            "LICENSE",
            ".gitignore",
            ".github/workflows/ci.yml",
            "THIRD_PARTY_NOTICES.md",
            "tools/sudoku-engine-cli/Cargo.toml",
        ]

        for relative_path in required_paths:
            with self.subTest(path=relative_path):
                self.assertTrue((ROOT / relative_path).exists())

    def test_web_deployment_release_files_are_removed(self):
        removed_paths = [
            "Dockerfile",
            ".dockerignore",
            "frontend/.env.example",
            ".github/workflows/frontend-pages.yml",
        ]

        for relative_path in removed_paths:
            with self.subTest(path=relative_path):
                self.assertFalse((ROOT / relative_path).exists())

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

    def test_third_party_notices_cover_runtime_dependencies_and_model(self):
        notice = (ROOT / "THIRD_PARTY_NOTICES.md").read_text(encoding="utf-8")

        required_strings = [
            "FastAPI",
            "Starlette",
            "Uvicorn",
            "OpenCV",
            "NumPy",
            "onnxruntime",
            "Printed Numerical Digits Image Dataset",
            "https://github.com/kaydee0502/printed-digits-dataset",
            "sudoku-digits.onnx",
            "Apache-2.0",
            "Next.js",
            "React",
            "React DOM",
            "lucide-react",
            "Tauri",
            "@tauri-apps/cli",
            "tauri-plugin-shell",
            "PyInstaller",
            "GPLv2-or-later with a special exception",
            "caniuse-lite",
            "CC-BY-4.0",
            "lightningcss",
            "MPL-2.0",
            "sharp",
            "libvips",
            "LGPL-3.0-or-later",
            "Ukodus sudoku-core",
            "legal advice",
        ]

        for text in required_strings:
            with self.subTest(text=text):
                self.assertIn(text, notice)

    def test_frontend_does_not_ship_browser_ocr_runtime_or_model(self):
        removed_paths = [
            "frontend/src/lib/client-ocr.ts",
            "frontend/src/lib/client-ocr.test.ts",
            "frontend/public/models/mnist-12.onnx",
            "frontend/public/models/LICENSE-NOTE.txt",
            "frontend/public/vendor/opencv.js",
            "frontend/public/vendor/opencv-LICENSE.txt",
        ]

        for relative_path in removed_paths:
            with self.subTest(path=relative_path):
                self.assertFalse((ROOT / relative_path).exists())

        checked_files = [
            ROOT / "frontend" / "package.json",
            ROOT / "frontend" / "package-lock.json",
            ROOT / "THIRD_PARTY_NOTICES.md",
            ROOT / "README.md",
        ]
        forbidden_strings = [
            "onnxruntime-web",
            "onnxmodelzoo/mnist-8",
            "onnxmodelzoo/mnist-12",
            "data/models/onnx-mnist",
            "frontend/public/models/mnist-12.onnx",
            "frontend/public/vendor/opencv.js",
            "NEXT_PUBLIC_SUDOKU_DIGIT_MODEL_PATH",
        ]

        for path in checked_files:
            content = path.read_text(encoding="utf-8")
            for text in forbidden_strings:
                with self.subTest(path=path.relative_to(ROOT), text=text):
                    self.assertNotIn(text, content)

    def test_public_release_files_do_not_ship_generic_ocr_fallback(self):
        checked_files = [
            ROOT / "requirements.txt",
            ROOT / "THIRD_PARTY_NOTICES.md",
            ROOT / "backend" / "app" / "ocr.py",
            ROOT / "README.md",
            ROOT / "AGENTS.md",
        ]

        forbidden_strings = [
            "tesseract",
            "pytesseract",
            "generic OCR fallback",
            "generic ocr fallback",
            "Pillow",
            "from PIL",
            "TemplateDigitClassifier",
            "template digit classifier",
            "works without a trained model",
        ]

        for path in checked_files:
            content = path.read_text(encoding="utf-8")
            for text in forbidden_strings:
                with self.subTest(path=path.relative_to(ROOT), text=text):
                    self.assertNotIn(text, content)

    def test_public_release_files_do_not_reference_old_mnist_model(self):
        checked_files = [
            ROOT / "AGENTS.md",
            ROOT / "Makefile",
            ROOT / "README.md",
            ROOT / "THIRD_PARTY_NOTICES.md",
            ROOT / "backend" / "app" / "ocr.py",
            ROOT / "desktop" / "scripts" / "build-backend-sidecar.mjs",
            ROOT / "scripts" / "download_digit_model.py",
        ]

        forbidden_strings = [
            "onnxmodelzoo/mnist-8",
            "mnist-8.onnx",
            "data/models/onnx-mnist",
            "Hugging Face Hub",
            "huggingface_hub",
        ]

        for path in checked_files:
            content = path.read_text(encoding="utf-8")
            for text in forbidden_strings:
                with self.subTest(path=path.relative_to(ROOT), text=text):
                    self.assertNotIn(text, content)

    def test_readme_links_to_third_party_notices(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")

        self.assertIn("Third-party notices", readme)
        self.assertIn("THIRD_PARTY_NOTICES.md", readme)

    def test_requirements_include_fastapi_testclient_transport(self):
        requirements = (ROOT / "requirements.txt").read_text(encoding="utf-8")

        self.assertRegex(requirements, r"(?m)^httpx[<>=]")

    def test_backend_dependencies_include_required_onnx_classifier_runtime(self):
        requirements = (ROOT / "requirements.txt").read_text(encoding="utf-8")

        self.assertRegex(requirements, r"(?m)^onnxruntime[<>=]")
        self.assertNotRegex(requirements, r"(?m)^huggingface_hub[<>=]")

    def test_next_config_has_no_github_pages_base_path(self):
        next_config = (ROOT / "frontend" / "next.config.ts").read_text(encoding="utf-8")

        self.assertNotIn("NEXT_PUBLIC_BASE_PATH", next_config)
        self.assertNotIn("basePath", next_config)
        self.assertNotIn("assetPrefix", next_config)

    def test_frontend_package_lock_has_complete_package_versions(self):
        package_lock = json.loads((ROOT / "frontend" / "package-lock.json").read_text(encoding="utf-8"))
        incomplete_packages = [
            name
            for name, metadata in package_lock["packages"].items()
            if name and not metadata.get("link") and "version" not in metadata
        ]

        self.assertEqual([], incomplete_packages)


if __name__ == "__main__":
    unittest.main()
