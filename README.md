# Puzzle Hint

Sudoku-first puzzle hint desktop app with a FastAPI backend and a static Next.js frontend.

## What is built

- Manual Sudoku entry and clean image upload flow.
- Keyboard entry for the board: `1`-`9` fill cells, and `Space`, `Backspace`, `Delete`, or `0` clear cells.
- Correction-first validation for invalid grids and low-confidence OCR cells.
- Step-by-step hints with technique name, conclusion, layered explanation, highlights, and history.
- Level-based puzzle generation backed by the Ukodus `sudoku-core` engine.
- FastAPI API routes under `/api/sudoku/*`.
- Tauri desktop wrapper that packages the frontend and runs the backend locally.

## Desktop packaging

Install Python dependencies:

```bash
python3 -m pip install -r requirements.txt
```

Install frontend dependencies:

```bash
cd frontend
npm install
```

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

`make desktop-dev` runs the Tauri shell, a local FastAPI sidecar on
`127.0.0.1:48731`, and the Next.js development server used by the desktop
webview.

## Image Import Pipeline

Image import is browser-first: the frontend tries OpenCV grid extraction and
ONNX digit classification locally, then falls back to the FastAPI upload
endpoint if browser OCR is unavailable.

Current flow:

```text
image upload
-> browser OpenCV grayscale/threshold processing
-> largest square contour detection
-> perspective warp to a flat 9x9 grid
-> split into 81 cell images
-> blank detection that ignores small pencil notes
-> browser ONNX digit classifier
-> optional server OCR fallback
-> Sudoku consistency warnings
-> editable correction grid
```

The frontend ships `frontend/public/models/mnist-12.onnx` for browser
classification through `onnxruntime-web`. By default the backend still uses a
lightweight OpenCV template digit classifier so it works without a trained
server model. For better backend fallback accuracy, install the optional
pretrained model:

```bash
make model
```

That downloads `onnxmodelzoo/mnist-8` from Hugging Face into `data/models/onnx-mnist/mnist-8.onnx`. Hugging Face lists this model as `Apache-2.0`. When that file exists, the backend uses it automatically. You can override the ONNX model path with `SUDOKU_DIGIT_MODEL=/path/to/model.onnx`.

The bundled MNIST model predicts labels `0..9`; blank handling is done before model inference by OpenCV. A predicted `0` is treated as empty because Sudoku cells only contain `1..9`.

The importer intentionally reads only large given/entered digits. Small candidate notes inside a Sudoku cell are ignored.

## Third-party notices

Puzzle Hint is MIT-licensed. Important third-party runtime, build-time, OCR,
model, and frontend dependency notices are maintained in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Verification

```bash
python3 -m unittest discover -s tests -v
cd frontend
npm test -- --run
npm run typecheck
npm run build
cd ..
make desktop-build
```
