# Puzzle Hint

Sudoku-first puzzle hint website with a FastAPI backend and a static Next.js frontend served by FastAPI in production.

## What is built

- Manual Sudoku entry and clean image upload flow.
- Keyboard entry for the board: `1`-`9` fill cells, and `Space`, `Backspace`, `Delete`, or `0` clear cells.
- Correction-first validation for invalid grids and low-confidence OCR cells.
- Step-by-step hints with technique name, conclusion, layered explanation, highlights, and history.
- FastAPI API routes under `/api/sudoku/*`.
- Next.js static export served from `frontend/out` by FastAPI.

## Run locally

Install Python dependencies:

```bash
python3 -m pip install -r requirements.txt
```

Install frontend dependencies:

```bash
cd frontend
npm install
```

For production-style serving:

```bash
cd frontend
npm run build
cd ..
python3 -m uvicorn backend.app.main:app --reload
```

Then open `http://127.0.0.1:8000`.

For frontend-only development against a running FastAPI server:

```bash
cd frontend
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000 npm run dev
```

## Image Import Pipeline

The upload endpoint is local-first and does not rely only on generic OCR.

Current flow:

```text
image upload
-> OpenCV grayscale/threshold processing
-> largest square contour detection
-> perspective warp to a flat 9x9 grid
-> split into 81 cell images
-> blank detection
-> digit classifier
-> Sudoku consistency warnings
-> editable correction grid
```

By default the backend uses a lightweight OpenCV template digit classifier so it works without a trained model. For better accuracy, set `SUDOKU_DIGIT_MODEL=/path/to/model.keras` and install TensorFlow; the model should classify labels `0..9`, where `0` means blank and `1..9` are Sudoku digits.

Tesseract remains only as a fallback if OpenCV grid extraction fails. Users should still review detected digits before requesting a hint.

## Verification

```bash
python3 -m unittest discover -s tests -v
cd frontend
npm test -- --run
npm run typecheck
npm run build
```
