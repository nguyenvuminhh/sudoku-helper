import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class DesktopReleaseFilesTests(unittest.TestCase):
    def test_desktop_release_files_exist(self):
        required_paths = [
            "desktop/package.json",
            "desktop/scripts/build-backend-sidecar.mjs",
            "desktop/src-tauri/Cargo.toml",
            "desktop/src-tauri/build.rs",
            "desktop/src-tauri/src/main.rs",
            "desktop/src-tauri/icons/icon.png",
            "desktop/src-tauri/tauri.conf.json",
            "desktop/src-tauri/tauri.macos.conf.json",
            "desktop/src-tauri/tauri.windows.conf.json",
            "desktop/src-tauri/capabilities/default.json",
            "backend/app/desktop_server.py",
            "requirements-desktop.txt",
        ]

        for relative_path in required_paths:
            with self.subTest(path=relative_path):
                self.assertTrue((ROOT / relative_path).exists())

    def test_desktop_backend_uses_fixed_loopback_port(self):
        launcher = (ROOT / "backend" / "app" / "desktop_server.py").read_text(encoding="utf-8")

        self.assertIn('DESKTOP_HOST = "127.0.0.1"', launcher)
        self.assertIn("DESKTOP_PORT = 48731", launcher)
        self.assertIn("create_app(cors_origins=[\"*\"]", launcher)
        self.assertIn("uvicorn.run", launcher)

    def test_tauri_config_uses_static_frontend_and_sidecar(self):
        config = json.loads((ROOT / "desktop" / "src-tauri" / "tauri.conf.json").read_text(encoding="utf-8"))

        self.assertEqual("Puzzle Hint", config["productName"])
        self.assertEqual("com.puzzlehint.desktop", config["identifier"])
        self.assertEqual("http://127.0.0.1:3000", config["build"]["devUrl"])
        self.assertEqual("../../frontend/out", config["build"]["frontendDist"])
        self.assertIn("binaries/puzzle-hint-backend", config["bundle"]["externalBin"])

    def test_tauri_platform_configs_define_installers(self):
        macos = json.loads((ROOT / "desktop" / "src-tauri" / "tauri.macos.conf.json").read_text(encoding="utf-8"))
        windows = json.loads((ROOT / "desktop" / "src-tauri" / "tauri.windows.conf.json").read_text(encoding="utf-8"))

        self.assertEqual(["dmg"], macos["bundle"]["targets"])
        self.assertEqual(["nsis"], windows["bundle"]["targets"])

    def test_tauri_main_starts_backend_sidecar_and_health_checks(self):
        main_rs = (ROOT / "desktop" / "src-tauri" / "src" / "main.rs").read_text(encoding="utf-8")

        self.assertIn("BACKEND_SIDECAR", main_rs)
        self.assertIn("puzzle-hint-backend", main_rs)
        self.assertIn("BACKEND_HEALTH_URL", main_rs)
        self.assertIn("http://127.0.0.1:48731/api/health", main_rs)
        self.assertIn(".shell()", main_rs)
        self.assertIn(".sidecar", main_rs)
        self.assertIn("wait_for_backend", main_rs)

    def test_desktop_build_script_uses_pyinstaller_and_target_triple(self):
        script = (ROOT / "desktop" / "scripts" / "build-backend-sidecar.mjs").read_text(encoding="utf-8")

        self.assertIn("PyInstaller", script)
        self.assertIn("rustc", script)
        self.assertIn("--print", script)
        self.assertIn("host-tuple", script)
        self.assertIn("puzzle-hint-backend", script)
        self.assertIn("desktop/src-tauri/binaries", script)

    def test_gitignore_excludes_generated_desktop_artifacts(self):
        gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")

        for ignored_path in [
            "desktop/node_modules/",
            "desktop/src-tauri/target/",
            "desktop/src-tauri/binaries/",
            "build/",
            "dist/",
            "*.spec",
        ]:
            with self.subTest(path=ignored_path):
                self.assertIn(ignored_path, gitignore)

    def test_makefile_exposes_desktop_commands(self):
        makefile = (ROOT / "Makefile").read_text(encoding="utf-8")

        for target in [
            "desktop-deps:",
            "desktop-frontend:",
            "desktop-backend:",
            "desktop-dev:",
            "desktop-build:",
        ]:
            with self.subTest(target=target):
                self.assertIn(target, makefile)

        self.assertIn("cd desktop && CI=true npm run tauri build", makefile)

    def test_readme_documents_desktop_packaging(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")

        self.assertIn("Desktop packaging", readme)
        self.assertIn("make desktop-build", readme)
        self.assertIn(".dmg", readme)
        self.assertIn(".exe", readme)


if __name__ == "__main__":
    unittest.main()
