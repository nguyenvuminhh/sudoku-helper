# Puzzle Hint

Sudoku-first puzzle hint website with a FastAPI backend and a static Next.js frontend served by FastAPI in production.

## What is built

- Manual Sudoku entry, paste import, and clean image upload flow.
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

## OCR note

The upload endpoint is local-first. If `pillow`, `pytesseract`, or the system `tesseract` binary is unavailable, the API still returns an editable empty grid with warnings instead of sending images to an external service.

## Verification

```bash
python3 -m unittest discover -s tests -v
cd frontend
npm test -- --run
npm run typecheck
npm run build
```
