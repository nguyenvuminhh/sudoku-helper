# Third-Party Notices

Puzzle Hint is released under the MIT License. This file records practical
attribution and notice-preservation information for important third-party
software, model assets, and build-time packages used by the project. It is a
summary for project maintenance and public releases, not legal advice.

Dependency versions are controlled by:

- Python backend: `requirements.txt` and `requirements-model.txt`
- Frontend: `frontend/package.json` and `frontend/package-lock.json`
- Desktop packaging: `requirements-desktop.txt`, `desktop/package.json`,
  `desktop/package-lock.json`, and `desktop/src-tauri/Cargo.toml`
- Rust Sudoku engine wrapper: `tools/sudoku-engine-cli/Cargo.toml`

## Backend Python Runtime

The FastAPI service and OCR/import pipeline use these principal Python
dependencies and their transitive dependency trees:

| Project | Purpose | SPDX license | Source |
| --- | --- | --- | --- |
| FastAPI | Backend API framework | MIT | https://github.com/fastapi/fastapi |
| Starlette | ASGI toolkit used by FastAPI | BSD-3-Clause | https://github.com/encode/starlette |
| Uvicorn | ASGI production server | BSD-3-Clause | https://github.com/encode/uvicorn |
| python-multipart | Upload/form parsing for FastAPI file uploads | Apache-2.0 | https://github.com/Kludex/python-multipart |
| httpx | Test client transport dependency for FastAPI/Starlette tests | BSD-3-Clause | https://github.com/encode/httpx |
| NumPy | Numeric arrays and image preprocessing | BSD-3-Clause | https://github.com/numpy/numpy |
| OpenCV / opencv-python-headless | Sudoku grid extraction and image processing | Apache-2.0 | https://github.com/opencv/opencv and https://github.com/opencv/opencv-python |

The product direction keeps OpenCV grid extraction as the image import path.

## Optional Model Runtime

`requirements-model.txt` enables the optional ONNX digit classifier support:

| Project | Purpose | SPDX license | Source |
| --- | --- | --- | --- |
| onnxruntime | Runs the optional ONNX digit classifier | MIT | https://github.com/microsoft/onnxruntime |
| Hugging Face Hub (`huggingface_hub`) | Downloads the optional model in `scripts/download_digit_model.py` | Apache-2.0 | https://github.com/huggingface/huggingface_hub |

## Downloaded ONNX Model

`make model` runs `scripts/download_digit_model.py`, which downloads:

- Model: `onnxmodelzoo/mnist-8`
- File: `mnist-8.onnx`
- Local path in generated runtime artifacts: `data/models/onnx-mnist/mnist-8.onnx`
- Source: https://huggingface.co/onnxmodelzoo/mnist-8
- License listed by Hugging Face: Apache-2.0

The repository ignores `data/models/` and `data/img/`. The download script
also writes `data/models/onnx-mnist/LICENSE-NOTE.txt` beside the model inside
generated runtime artifacts.

## Browser-Shipped OCR Assets

The static frontend ships browser-side OCR assets so image import can run
before falling back to the FastAPI upload endpoint:

- Model: `onnxmodelzoo/mnist-12`
- File: `mnist-12.onnx`
- Local path in the static frontend: `frontend/public/models/mnist-12.onnx`
- Source: https://huggingface.co/onnxmodelzoo/mnist-12
- License listed by Hugging Face: Apache-2.0
- License note path: `frontend/public/models/LICENSE-NOTE.txt`

The frontend also ships `frontend/public/vendor/opencv.js`, a browser OpenCV.js
build copied from the Apache-2.0 `@techstark/opencv-js` package / OpenCV
project. Its Apache-2.0 license text is kept at
`frontend/public/vendor/opencv-LICENSE.txt`.

## Sudoku Generation Engine

Puzzle generation and advanced human-style Sudoku rating use the Ukodus
`sudoku-core` Rust engine through the local wrapper in `tools/sudoku-engine-cli`.

- Project: Ukodus sudoku-core
- Source: https://github.com/kcirtapfromspace/sudoku-core
- Pinned commit: `ad8f024d507a52eff99fdd8b5173763487b30a31`
- License: MIT
- Copyright: Copyright (c) 2026 Patrick Deutsch

The wrapper crate also uses `serde` and `serde_json`, which are commonly
distributed under MIT OR Apache-2.0.

## Frontend Runtime And Build Dependencies

The static Next.js frontend is built from `frontend/package.json` and
`frontend/package-lock.json`. Principal dependencies include:

| Project | Purpose | SPDX license | Source |
| --- | --- | --- | --- |
| Next.js | Static export framework and build system | MIT | https://github.com/vercel/next.js |
| React | UI runtime | MIT | https://github.com/facebook/react |
| React DOM | DOM renderer for React | MIT | https://github.com/facebook/react |
| lucide-react | Icon components | ISC | https://github.com/lucide-icons/lucide |
| onnxruntime-web | Browser ONNX digit classifier runtime | MIT | https://github.com/microsoft/onnxruntime |
| TypeScript | Type checking | Apache-2.0 | https://github.com/microsoft/TypeScript |
| Vitest | Frontend tests | MIT | https://github.com/vitest-dev/vitest |
| Vite | Vitest/build tooling dependency | MIT | https://github.com/vitejs/vite |

The npm lockfile also includes common bundled/transitive frontend packages under
MIT, ISC, BSD-3-Clause, Apache-2.0, and 0BSD licenses, including packages such
as `@next/env`, `@next/swc-*`, `@swc/helpers`, `postcss`, `source-map-js`,
`nanoid`, `picocolors`, `fdir`, `picomatch`, `semver`, and `tslib`.

### Frontend Special License Notes

- `caniuse-lite` is present in `frontend/package-lock.json` under CC-BY-4.0.
  It is browser compatibility data used by frontend tooling.
- `lightningcss` and platform-specific `lightningcss-*` packages are present
  under MPL-2.0. These are CSS transform/minification tooling used by the
  Next.js build chain.
- `sharp` is present under Apache-2.0, and optional platform packages for
  `sharp`/`libvips` appear in the lockfile. The `@img/sharp-libvips-*`
  packages are listed under LGPL-3.0-or-later. These packages are optional
  native install/build/runtime helpers for Node-based image handling in the
  Next.js ecosystem; they are not authored application code and are distinct
  from browser-shipped Puzzle Hint source.
- `frontend/public/vendor/opencv.js` is a vendored browser build, not an npm
  runtime dependency. Keep `frontend/public/vendor/opencv-LICENSE.txt` with it
  when redistributing the static frontend.

For exact frontend dependency versions and resolved package tarballs, use
`frontend/package-lock.json`.

## Desktop Packaging Dependencies

The desktop wrapper is built from `desktop/package.json`,
`desktop/package-lock.json`, `desktop/src-tauri/Cargo.toml`, and
`requirements-desktop.txt`.

| Project | Purpose | SPDX license | Source |
| --- | --- | --- | --- |
| Tauri | Cross-platform desktop shell and bundler | Apache-2.0 OR MIT | https://github.com/tauri-apps/tauri |
| `@tauri-apps/cli` | Node CLI used to run and build the Tauri desktop app | Apache-2.0 OR MIT | https://github.com/tauri-apps/tauri |
| `tauri-plugin-shell` | Tauri plugin used by the Rust shell to launch the backend sidecar | Apache-2.0 OR MIT | https://github.com/tauri-apps/plugins-workspace |
| PyInstaller | Builds the FastAPI backend sidecar executable | GPLv2-or-later with a special exception | https://pyinstaller.org |

The Tauri Rust package also uses small Rust helper crates such as `ureq` for
the local backend health check. PyInstaller is used as a packaging tool for the
backend sidecar; generated `build/`, `dist/`, `.spec`, and Tauri `binaries/`
artifacts are ignored by git.
