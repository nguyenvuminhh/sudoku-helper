# AGENTS.md

## Project

Puzzle Hint is a Sudoku-first hint website.

- Backend: FastAPI in `backend/app`.
- Frontend: static-exported Next.js app in `frontend`.
- Production shape: run `npm run build` in `frontend`, then FastAPI serves `frontend/out`.

## Commands

Run backend tests from the repo root:

```bash
python3 -m unittest discover -s tests -v
```

Run frontend checks from `frontend/`:

```bash
npm test -- --run
npm run typecheck
npm run build
```

Run hot-reload development servers from the repo root in two terminals:

```bash
make be
```

```bash
make fe
```

Install the optional pretrained digit classifier:

```bash
make model
```

Run the production-style app:

```bash
cd frontend
npm run build
cd ..
python3 -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8001
```

## Editing Guidance

- Keep Sudoku rules and solver behavior in `backend/app/sudoku`.
- Keep FastAPI route wiring in `backend/app/main.py`.
- Keep frontend Sudoku state helpers in `frontend/src/lib/sudoku-state.ts`.
- Keep the main tutor workspace in `frontend/src/app/page.tsx`.
- Add tests before changing behavior.
- Do not depend on external AI services for image import unless the product direction changes.
- Image import should use OpenCV grid extraction before digit classification.
- Do not add non-grid OCR paths for image import.
- Image import must ignore pencil-note/candidate digits and classify only large cell digits.
- Prefer `data/models/onnx-mnist/mnist-8.onnx` when installed; it is downloaded by `make model` and Hugging Face lists it as `Apache-2.0`.
- Treat image import as an editable assistant, not fully trustworthy OCR.

## UX Rules

- The app should remain a distinct tutor workspace, not a clone of a Sudoku solver reference site.
- Keyboard board entry uses digits `1`-`9`.
- Empty cell entry uses `Space`, `Backspace`, `Delete`, or `0`.
- Keyboard entry advances to the next empty cell automatically.
- Primary controls should live in the right rail beside the Sudoku board, above the strategy note.
