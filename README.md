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

Image import uploads the selected image to the FastAPI backend. The backend
handles OpenCV grid extraction, cell normalization, blank detection, and digit
classification, then returns an editable correction grid to the frontend.

Current flow:

```text
image upload
-> FastAPI upload endpoint
-> backend OpenCV grayscale/threshold processing
-> largest square contour detection
-> perspective warp to a flat 9x9 grid
-> split into 81 cell images
-> blank detection that ignores small pencil notes
-> backend digit classifier
-> Sudoku consistency warnings
-> editable correction grid
```

The backend uses the trained Sudoku-specific ONNX classifier by default. Verify
that the generated model files exist before running image import:

```bash
make model
```

Image import requires `data/models/sudoku-digits/sudoku-digits.onnx` and its
external data file `data/models/sudoku-digits/sudoku-digits.onnx.data`, unless
you override the ONNX model path with `SUDOKU_DIGIT_MODEL=/path/to/model.onnx`.

The bundled Sudoku model predicts labels `0..9`; class `0` means blank/no large
digit. Blank handling also runs before model inference by OpenCV.

To train or replace the model, install the training-only dependencies in your
training environment:

```bash
python3 -m pip install torch onnx onnxscript pillow
```

Then run:

```bash
python3 scripts/train_sudoku_digit_model.py \
  --dataset /path/to/printed-digits-dataset \
  --dataset /path/to/chars74k \
  --font /path/to/font.ttf \
  --output data/models/sudoku-digits/sudoku-digits.onnx
```

The training script treats class `0` as blank/no large digit and classes `1`-`9`
as printed Sudoku digits. It filters Chars74K to printed digit classes `1`-`9`,
loads blank/empty dataset folders as class `0`, and adds synthetic Sudoku cell
examples with grid residue, crop jitter, blur, compression noise, and pencil-note
negatives. Use the trained model with
`SUDOKU_DIGIT_MODEL=data/models/sudoku-digits/sudoku-digits.onnx`.
Keep the generated `.onnx.data` file beside the `.onnx` file; ONNX Runtime loads
the external weight data from that companion file.

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
