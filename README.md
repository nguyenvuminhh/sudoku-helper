# Puzzle Hint

Sudoku-first puzzle hint website with a FastAPI backend and a static Next.js frontend.

## What is built

- Manual Sudoku entry and clean image upload flow.
- Keyboard entry for the board: `1`-`9` fill cells, and `Space`, `Backspace`, `Delete`, or `0` clear cells.
- Correction-first validation for invalid grids and low-confidence OCR cells.
- Step-by-step hints with technique name, conclusion, layered explanation, highlights, and history.
- FastAPI API routes under `/api/sudoku/*`.
- Next.js static export that can be served by FastAPI or deployed separately.

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

## Public deployment

The recommended public deployment is split by responsibility:

- Backend API and OCR on Amazon EC2, preferably behind HTTPS through Caddy, nginx plus Certbot, or an AWS Application Load Balancer.
- Static frontend on GitHub Pages, built by `.github/workflows/frontend-pages.yml`.

The frontend uses `NEXT_PUBLIC_API_BASE_URL` at build time to call the EC2 backend. Because GitHub Pages is HTTPS, the backend URL should also be HTTPS.

Backend container:

```bash
docker build -t puzzle-hint-api .
docker run -d \
  --name puzzle-hint-api \
  --restart unless-stopped \
  -p 127.0.0.1:8000:8000 \
  -e PUZZLE_HINT_CORS_ORIGINS=https://<github-user>.github.io,https://<github-user>.github.io/<repo-name> \
  puzzle-hint-api
```

GitHub Pages repository variables:

```text
NEXT_PUBLIC_API_BASE_URL=https://api.example.com
NEXT_PUBLIC_BASE_PATH=/<repo-name>
```

Leave `NEXT_PUBLIC_BASE_PATH` blank for a user or organization Pages site at `https://<github-user>.github.io/`.

See [docs/deployment.md](docs/deployment.md) for the full EC2 and GitHub Pages checklist.

For frontend-only development against a running FastAPI server:

```bash
make be
```

```bash
make fe
```

Run those in two separate terminals. `make be` starts FastAPI on `127.0.0.1:8000` with hot reload and CORS configured in `backend/app/main.py`. `make fe` starts Next.js on `127.0.0.1:3000` and points it at the backend.

## Image Import Pipeline

The upload endpoint is local-first and does not rely only on generic OCR.

Current flow:

```text
image upload
-> OpenCV grayscale/threshold processing
-> largest square contour detection
-> perspective warp to a flat 9x9 grid
-> split into 81 cell images
-> blank detection that ignores small pencil notes
-> digit classifier
-> Sudoku consistency warnings
-> editable correction grid
```

By default the backend uses a lightweight OpenCV template digit classifier so it works without a trained model. For better accuracy, install the optional pretrained model:

```bash
make model
```

That downloads `onnxmodelzoo/mnist-8` from Hugging Face into `data/models/onnx-mnist/mnist-8.onnx`. Hugging Face lists this model as `Apache-2.0`. When that file exists, the backend uses it automatically. You can override the ONNX model path with `SUDOKU_DIGIT_MODEL=/path/to/model.onnx`.

The bundled MNIST model predicts labels `0..9`; blank handling is done before model inference by OpenCV. A predicted `0` is treated as empty because Sudoku cells only contain `1..9`.

Tesseract remains only as a fallback if OpenCV grid extraction fails. Users should still review detected digits before requesting a hint.

The importer intentionally reads only large given/entered digits. Small candidate notes inside a Sudoku cell are ignored.

## Verification

```bash
python3 -m unittest discover -s tests -v
cd frontend
npm test -- --run
npm run typecheck
npm run build
```
