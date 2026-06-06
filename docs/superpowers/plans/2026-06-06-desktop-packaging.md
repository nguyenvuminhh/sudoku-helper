# Desktop Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-codebase desktop packaging path that can build Puzzle Hint as a macOS `.dmg` or Windows `.exe` installer.

**Architecture:** Keep the existing FastAPI backend and static Next.js frontend as the application core. Add a Tauri desktop package that opens the built frontend in a desktop webview and starts a PyInstaller-built FastAPI sidecar on `127.0.0.1:48731`.

**Tech Stack:** FastAPI, Uvicorn, Next.js static export, Tauri v2, Rust, PyInstaller, Node.js build scripts, Python unittest.

---

## File Structure

- Create `tests/test_desktop_release_files.py`: regression tests for desktop release configuration, fixed API port, sidecar naming, Makefile commands, and docs.
- Create `backend/app/desktop_server.py`: desktop-only FastAPI launcher with fixed host/port and no static serving requirement.
- Create `requirements-desktop.txt`: PyInstaller dependency for building the backend sidecar.
- Modify `Makefile`: add `desktop-deps`, `desktop-frontend`, `desktop-backend`, `desktop-dev`, and `desktop-build`.
- Create `desktop/package.json`: Node scripts and Tauri CLI dependency.
- Create `desktop/scripts/build-backend-sidecar.mjs`: PyInstaller runner that renames the sidecar with the current Rust target triple.
- Create `desktop/src-tauri/Cargo.toml`: Rust package and Tauri dependencies.
- Create `desktop/src-tauri/build.rs`: Tauri build hook.
- Create `desktop/src-tauri/src/main.rs`: launches the sidecar, waits for `/api/health`, shows an error window if startup fails, and kills the sidecar on exit.
- Create `desktop/src-tauri/tauri.conf.json`: Tauri app configuration, frontend build paths, bundle targets, and sidecar declaration.
- Create `desktop/src-tauri/tauri.macos.conf.json`: macOS bundle target overlay for `.dmg`.
- Create `desktop/src-tauri/tauri.windows.conf.json`: Windows bundle target overlay for the NSIS `.exe` installer.
- Create `desktop/src-tauri/capabilities/default.json`: default main-window capability.
- Modify `.gitignore`: ignore generated desktop dependencies, Rust build output, and sidecar binaries.
- Modify `README.md`: document the desktop build flow and current host limitations.

## Task 1: Desktop Release Tests

**Files:**
- Create: `tests/test_desktop_release_files.py`

- [ ] **Step 1: Write failing release tests**

Create `tests/test_desktop_release_files.py`:

```python
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

        self.assertIn("DESKTOP_HOST = \"127.0.0.1\"", launcher)
        self.assertIn("DESKTOP_PORT = 48731", launcher)
        self.assertIn("create_app(static_dir=None", launcher)
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
        self.assertIn("shell().sidecar", main_rs)
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

    def test_readme_documents_desktop_packaging(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")

        self.assertIn("Desktop packaging", readme)
        self.assertIn("make desktop-build", readme)
        self.assertIn(".dmg", readme)
        self.assertIn(".exe", readme)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
python3 -m unittest tests.test_desktop_release_files -v
```

Expected: failures for missing desktop files and commands.

## Task 2: Desktop Backend Launcher

**Files:**
- Create: `backend/app/desktop_server.py`
- Create: `requirements-desktop.txt`
- Modify: `Makefile`
- Test: `tests/test_desktop_release_files.py`

- [ ] **Step 1: Add desktop backend launcher**

Create `backend/app/desktop_server.py`:

```python
from __future__ import annotations

import uvicorn

from backend.app.main import create_app

DESKTOP_HOST = "127.0.0.1"
DESKTOP_PORT = 48731

app = create_app(static_dir=None, cors_origins=["*"])


def main() -> None:
    uvicorn.run(app, host=DESKTOP_HOST, port=DESKTOP_PORT, log_level="info")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Add desktop Python build dependency**

Create `requirements-desktop.txt`:

```text
-r requirements.txt
pyinstaller>=6,<7
```

- [ ] **Step 3: Add Makefile desktop targets**

Modify `Makefile` so `.PHONY` includes the desktop targets and add:

```make
desktop-deps:
	python3 -m pip install -r requirements-desktop.txt
	cd desktop && npm install

desktop-frontend:
	cd frontend && NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:48731 npm run build

desktop-backend:
	cd desktop && npm run build:backend

desktop-dev: desktop-backend
	cd desktop && npm run tauri dev

desktop-build: desktop-frontend desktop-backend
	cd desktop && npm run tauri build
```

- [ ] **Step 4: Run targeted tests**

Run:

```bash
python3 -m unittest tests.test_desktop_release_files.DesktopReleaseFilesTests.test_desktop_backend_uses_fixed_loopback_port tests.test_desktop_release_files.DesktopReleaseFilesTests.test_makefile_exposes_desktop_commands -v
```

Expected: launcher and Makefile tests pass after all files in this task exist.

## Task 3: Tauri Desktop Package

**Files:**
- Create: `desktop/package.json`
- Create: `desktop/scripts/build-backend-sidecar.mjs`
- Create: `desktop/src-tauri/Cargo.toml`
- Create: `desktop/src-tauri/build.rs`
- Create: `desktop/src-tauri/src/main.rs`
- Create: `desktop/src-tauri/tauri.conf.json`
- Create: `desktop/src-tauri/capabilities/default.json`
- Test: `tests/test_desktop_release_files.py`

- [ ] **Step 1: Add desktop package scripts**

Create `desktop/package.json`:

```json
{
  "name": "puzzle-hint-desktop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build:backend": "node scripts/build-backend-sidecar.mjs",
    "tauri": "tauri"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0"
  }
}
```

- [ ] **Step 2: Add sidecar build script**

Create `desktop/scripts/build-backend-sidecar.mjs`:

```javascript
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BACKEND_NAME = "puzzle-hint-backend";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(scriptDir, "..");
const rootDir = path.resolve(desktopDir, "..");
const binariesDir = path.join(desktopDir, "src-tauri", "binaries");
const extension = process.platform === "win32" ? ".exe" : "";

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: rootDir,
    encoding: "utf-8",
    stdio: options.stdio ?? "pipe",
    env: { ...process.env, PYTHONPATH: rootDir, ...options.env }
  });
}

function pythonExecutable() {
  return process.env.PYTHON ?? (process.platform === "win32" ? "python" : "python3");
}

function targetTriple() {
  try {
    return run("rustc", ["--print", "host-tuple"]).trim();
  } catch {
    const rustVersion = run("rustc", ["-Vv"]);
    const hostLine = rustVersion
      .split(/\r?\n/)
      .find((line) => line.startsWith("host:"));
    if (!hostLine) {
      throw new Error("Could not determine Rust host target triple from rustc.");
    }
    return hostLine.replace("host:", "").trim();
  }
}

function assertExists(filePath, label) {
  if (!existsSync(filePath)) {
    throw new Error(`${label} was not created at ${filePath}`);
  }
}

const pyinstaller = pythonExecutable();
console.log(`Building ${BACKEND_NAME} with PyInstaller...`);
execFileSync(
  pyinstaller,
  [
    "-m",
    "PyInstaller",
    "--noconfirm",
    "--clean",
    "--onefile",
    "--name",
    BACKEND_NAME,
    path.join("backend", "app", "desktop_server.py")
  ],
  {
    cwd: rootDir,
    stdio: "inherit",
    env: { ...process.env, PYTHONPATH: rootDir }
  }
);

const builtBinary = path.join(rootDir, "dist", `${BACKEND_NAME}${extension}`);
assertExists(builtBinary, "PyInstaller backend sidecar");

mkdirSync(binariesDir, { recursive: true });
const triple = targetTriple();
const tauriBinary = path.join(binariesDir, `${BACKEND_NAME}-${triple}${extension}`);
copyFileSync(builtBinary, tauriBinary);

if (process.platform !== "win32") {
  chmodSync(tauriBinary, 0o755);
}

console.log(`Copied sidecar to ${path.relative(rootDir, tauriBinary)}`);
```

- [ ] **Step 3: Add Tauri Rust package**

Create `desktop/src-tauri/Cargo.toml`:

```toml
[package]
name = "puzzle-hint-desktop"
version = "0.1.0"
description = "Puzzle Hint desktop app"
authors = ["Puzzle Hint"]
edition = "2021"
license = "MIT"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-shell = "2"
ureq = "2"
```

- [ ] **Step 4: Add Tauri build hook**

Create `desktop/src-tauri/build.rs`:

```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 5: Add Tauri main process**

Create `desktop/src-tauri/src/main.rs`:

```rust
use std::{
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};

use tauri::{Manager, WindowEvent};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

const BACKEND_SIDECAR: &str = "puzzle-hint-backend";
const BACKEND_HEALTH_URL: &str = "http://127.0.0.1:48731/api/health";
const BACKEND_STARTUP_TIMEOUT: Duration = Duration::from_secs(20);
const BACKEND_HEALTH_INTERVAL: Duration = Duration::from_millis(250);

struct BackendProcess {
    child: Mutex<Option<CommandChild>>,
}

impl BackendProcess {
    fn new(child: CommandChild) -> Self {
        Self {
            child: Mutex::new(Some(child)),
        }
    }

    fn kill(&self) {
        if let Ok(mut child) = self.child.lock() {
            if let Some(child) = child.take() {
                let _ = child.kill();
            }
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let backend = start_backend(app.handle())?;
            app.manage(BackendProcess::new(backend));
            wait_for_backend()?;

            if let Some(window) = app.get_webview_window("main") {
                window.show()?;
                window.set_focus()?;
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::CloseRequested { .. }) {
                let state = window.state::<BackendProcess>();
                state.kill();
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run Puzzle Hint desktop app");
}

fn start_backend(app: &tauri::AppHandle) -> Result<CommandChild, Box<dyn std::error::Error>> {
    let sidecar_command = app
        .shell()
        .sidecar(BACKEND_SIDECAR)
        .map_err(|error| format!("failed to resolve backend sidecar '{BACKEND_SIDECAR}': {error}"))?;
    let (mut events, child) = sidecar_command
        .spawn()
        .map_err(|error| format!("failed to start backend sidecar '{BACKEND_SIDECAR}': {error}"))?;

    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    eprintln!("[backend] {}", String::from_utf8_lossy(&bytes).trim_end());
                }
                CommandEvent::Stderr(bytes) => {
                    eprintln!("[backend:error] {}", String::from_utf8_lossy(&bytes).trim_end());
                }
                CommandEvent::Terminated(payload) => {
                    eprintln!("[backend] terminated: {:?}", payload);
                }
                _ => {}
            }
        }
    });

    Ok(child)
}

fn wait_for_backend() -> Result<(), Box<dyn std::error::Error>> {
    let deadline = Instant::now() + BACKEND_STARTUP_TIMEOUT;
    while Instant::now() < deadline {
        if backend_is_healthy() {
            return Ok(());
        }
        thread::sleep(BACKEND_HEALTH_INTERVAL);
    }

    Err(format!(
        "Puzzle Hint backend did not become healthy at {BACKEND_HEALTH_URL}. Check that port 48731 is available."
    )
    .into())
}

fn backend_is_healthy() -> bool {
    match ureq::get(BACKEND_HEALTH_URL).call() {
        Ok(response) => response.status() == 200,
        Err(_) => false,
    }
}
```

- [ ] **Step 6: Add Tauri config**

Create `desktop/src-tauri/tauri.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Puzzle Hint",
  "version": "0.1.0",
  "identifier": "com.puzzlehint.desktop",
  "build": {
    "beforeDevCommand": "cd ../frontend && NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:48731 npm run dev -- --hostname 127.0.0.1 --port 3000",
    "beforeBuildCommand": "cd ../frontend && NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:48731 npm run build",
    "devUrl": "http://127.0.0.1:3000",
    "frontendDist": "../../frontend/out"
  },
  "app": {
    "windows": [
      {
        "title": "Puzzle Hint",
        "width": 1180,
        "height": 820,
        "minWidth": 960,
        "minHeight": 680,
        "resizable": true,
        "visible": false
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "externalBin": ["binaries/puzzle-hint-backend"],
    "category": "Education"
  }
}
```

Create `desktop/src-tauri/tauri.macos.conf.json`:

```json
{
  "bundle": {
    "targets": ["dmg"]
  }
}
```

Create `desktop/src-tauri/tauri.windows.conf.json`:

```json
{
  "bundle": {
    "targets": ["nsis"]
  }
}
```

- [ ] **Step 7: Add default capability**

Create `desktop/src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capability for the main window",
  "windows": ["main"],
  "permissions": ["core:default"]
}
```

- [ ] **Step 8: Run targeted tests**

Run:

```bash
python3 -m unittest tests.test_desktop_release_files -v
```

Expected: all desktop release file tests pass except README documentation if Task 4 is not complete.

## Task 4: Desktop Documentation

**Files:**
- Modify: `.gitignore`
- Modify: `README.md`

- [ ] **Step 1: Ignore generated desktop artifacts**

Add these entries to `.gitignore`:

```gitignore
# Desktop packaging
desktop/node_modules/
desktop/src-tauri/target/
desktop/src-tauri/binaries/
build/
dist/
*.spec
```

- [ ] **Step 2: Add README desktop section**

Add a `## Desktop packaging` section after local development instructions:

```markdown
## Desktop packaging

Puzzle Hint can be packaged as one Tauri desktop app codebase for macOS and
Windows. The desktop wrapper uses the existing static Next.js frontend and runs
the FastAPI backend as a local sidecar on `127.0.0.1:48731`.

Install desktop packaging dependencies:

```bash
make desktop-deps
```

Build the installer for the current platform:

```bash
make desktop-build
```

On macOS this produces a `.dmg`. On Windows this produces an `.exe` NSIS
installer. Each installer should be built on its target operating system unless
a dedicated cross-compilation pipeline is added later.

For development:

```bash
make desktop-dev
```
```

- [ ] **Step 3: Run README and gitignore tests**

Run:

```bash
python3 -m unittest tests.test_desktop_release_files.DesktopReleaseFilesTests.test_readme_documents_desktop_packaging tests.test_desktop_release_files.DesktopReleaseFilesTests.test_gitignore_excludes_generated_desktop_artifacts -v
```

Expected: PASS.

## Task 5: Verification

**Files:**
- No new files.

- [ ] **Step 1: Run backend tests**

Run:

```bash
python3 -m unittest discover -s tests -v
```

Expected: PASS.

- [ ] **Step 2: Run frontend tests**

Run:

```bash
cd frontend && npm test -- --run
```

Expected: PASS.

- [ ] **Step 3: Run frontend typecheck**

Run:

```bash
cd frontend && npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run frontend production build**

Run:

```bash
cd frontend && NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:48731 npm run build
```

Expected: PASS and `frontend/out` exists.

- [ ] **Step 5: Validate desktop dependencies where available**

Run:

```bash
cd desktop && npm install
cd src-tauri && cargo check
```

Expected: PASS if the host has Rust and the Tauri system dependencies installed.

- [ ] **Step 6: Check git status**

Run:

```bash
git status --short
```

Expected: only the intended desktop packaging files are modified or untracked.
