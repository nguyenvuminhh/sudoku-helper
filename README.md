# Puzzle Hint

Sudoku-first puzzle hint website with a FastAPI backend and a static Next.js frontend.

## What is built

- Manual Sudoku entry and clean image upload flow.
- Keyboard entry for the board: `1`-`9` fill cells, and `Space`, `Backspace`, `Delete`, or `0` clear cells.
- Correction-first validation for invalid grids and low-confidence OCR cells.
- Step-by-step hints with technique name, conclusion, layered explanation, highlights, and history.
- Level-based puzzle generation backed by a pregenerated SE bucket corpus, with the Ukodus `sudoku-core` engine as the fallback for legacy levels.
- Row/column/box peer highlighting around the selected cell.
- Corner notes, center notes, and a 9-color cell paint mode (`Tab` cycles modes, `Z`/`X`/`C`/`V` jump directly).
- Multi-cell selection with click-drag, `Alt`/`Ctrl`+click, and `Shift`+arrows; entry applies to the whole selection.
- Solve clock with pause (board hidden while paused) and automatic solved detection with elapsed time.
- Finish dialog with solve statistics: time, hints and checks used, cells filled, and hint techniques encountered.
- Keypad remaining-digit counts and auto-advancing quick fill digit, both toggleable in Settings.
- Undo and redo (`Ctrl+Z` / `Ctrl+Y`), and the in-progress game survives page reloads via local storage.
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
python3 -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8001 --reload
```

Then open `http://127.0.0.1:8001`.

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
  -p 127.0.0.1:8001:8001 \
  -e PUZZLE_HINT_CORS_ORIGINS=https://<github-user>.github.io,https://<github-user>.github.io/<repo-name> \
  puzzle-hint-api
```

The backend image uses a multi-stage Docker build: Rust compiles the local
`tools/sudoku-engine-cli` wrapper, then the Python runtime image copies only the
compiled `sudoku-engine` binary. Bare-metal backend runs need that binary at
`bin/sudoku-engine` or `SUDOKU_ENGINE_BIN=/path/to/sudoku-engine`.

The baseline SE bucket corpus is committed at `data/puzzles/serate-buckets` and
is copied into the backend Docker image. The backend also reads
`PUZZLE_HINT_SERATE_CORPUS_DIR` when set, which is useful for overriding the
bundled corpus with a larger server-mounted corpus. If the corpus is missing,
`easy` through `master` fall back to `sudoku-engine`; `extreme` and advanced
levels require the corpus.

GitHub Pages repository variables:

```text
NEXT_PUBLIC_API_BASE_URL=https://api.example.com
NEXT_PUBLIC_BASE_PATH=/<repo-name>
```

Leave `NEXT_PUBLIC_BASE_PATH` blank for a user or organization Pages site at `https://<github-user>.github.io/`.

For frontend-only development against a running FastAPI server:

```bash
make be
```

```bash
make fe
```

Run those in two separate terminals. `make be` starts FastAPI on `127.0.0.1:8001` with hot reload and CORS configured in `backend/app/main.py`. `make fe` starts Next.js on `127.0.0.1:3000` and points it at the backend.

## Supabase Auth and Leaderboards

Guest play is local-only by default and does not start a Supabase anonymous
session or touch leaderboard storage. Supabase is used only when a
non-anonymous signed-in session exists. Without Supabase environment variables,
Sudoku play still works and the account and leaderboard UI shows the cloud
features as unavailable.

Create a Supabase project, keep Auth anonymous sign-ins disabled, and run:

```sql
-- In Supabase SQL editor or through the Supabase CLI:
-- supabase/migrations/202606160001_auth_leaderboards.sql
```

Frontend build variables:

```text
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-or-anon-key>
```

The browser uses the public key only. Do not put a Supabase service-role key in
frontend environment variables. Completed solves are saved as leaderboard
records only for non-anonymous signed-in users; V1 does not apply clean-solve
filtering after a solve is eligible to save.

### Supabase migration deployment

Checked-in Supabase migrations deploy through
`.github/workflows/supabase-migrations.yml`. The workflow runs on pushes to
`main` that change `supabase/migrations/**`, and it can also be run manually
from GitHub Actions.

Add these GitHub Actions repository secrets before enabling automatic
migrations:

```text
SUPABASE_ACCESS_TOKEN=<Supabase personal access token>
SUPABASE_PROJECT_ID=<project-ref>
SUPABASE_DB_PASSWORD=<database password>
```

The workflow installs the Supabase CLI, links the project, and runs
`supabase db push --linked`. Keep anonymous sign-ins disabled in Supabase Auth.

## Image Import Pipeline

The upload endpoint is local-first and uses OpenCV grid extraction before digit
classification.

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

The importer intentionally reads only large given/entered digits. Small candidate notes inside a Sudoku cell are ignored.

## Master and Extreme Corpus Generation

For a large pregenerated hard-puzzle corpus, use Tdoku for fast candidate
generation and Sukaku Explainer `serate` as the rating gate. The repository
script keeps only puzzles that actually rate as hard enough by SE rating:

- `master`: `8.0 <= SE rating < 10.0`
- `extreme`: `SE rating >= 10.0`

Both thresholds are configurable with `--master-min-rating` and
`--extreme-min-rating`. On Apple Silicon local generation, `extreme >= 9.0`
is a more practical starting point than `>= 10.0`.

Install or build these outside this repository:

- Tdoku: https://github.com/t-dillon/tdoku
- Sukaku Explainer / serate jar: https://github.com/SudokuMonster/SukakuExplainer

Example local run for a small smoke test:

```bash
python3 scripts/generate_hard_sudoku_corpus.py \
  --candidate-command "/path/to/tdoku/build/generate -p0 -c0 -g1 -d1 -n100 -e50 -s0 -l 10000 -a1" \
  --serate-jar /path/to/SukakuExplainer.jar \
  --target-per-level 10 \
  --chunk-size 5 \
  --batch-size 250 \
  --max-candidates 10000 \
  --master-min-rating 8.0 \
  --extreme-min-rating 9.0 \
  --threads 10 \
  --output-dir data/puzzles/serate-hard
```

For the full local corpus, keep the same command shape and use the default
`--target-per-level 1000000`. Output is written as gzip-compressed NDJSON chunks:

```text
data/puzzles/serate-hard/
  manifest.json
  master/part-000000.ndjson.gz
  extreme/part-000000.ndjson.gz
```

Each record includes the puzzle, solution, SE rating, pearl rating, diamond
rating, and highest-rated serate technique. Existing chunks are scanned on
startup, so rerunning the command resumes without duplicating already written
puzzles.

### Faster Seed Expansion Workflow

For million-record corpora, prefer verified hard seeds plus Sudoku-preserving
transformations over brute-force candidate generation. The local Tdoku checkout
ships `data.zip`, whose `data/puzzles5_forum_hardest_1905_11+` member is
documented by Tdoku as about 49,000 very difficult puzzles with Sudoku
Explainer ratings of 11 or higher.

Verify a small seed catalog and expand it:

```bash
python3 scripts/expand_hard_sudoku_seeds.py \
  --seed-zip tdoku/data.zip \
  --seed-member data/puzzles5_forum_hardest_1905_11+ \
  --seed-catalog data/puzzles/verified-extreme-seeds.ndjson.gz \
  --serate-jar SukakuExplainer.jar \
  --java-bin /opt/homebrew/opt/openjdk/bin/java \
  --threads 10 \
  --verify-batch-size 50 \
  --max-seeds 100 \
  --levels extreme \
  --target-per-level 1000 \
  --chunk-size 100 \
  --output-dir data/puzzles/expanded-extreme \
  --extreme-min-rating 9.0
```

For a full extreme corpus, remove `--max-seeds` after the smoke test and set
`--target-per-level 1000000`. The script verifies each seed once with `serate`,
solves it once, then creates variants using digit relabeling, row/column swaps
within valid bands/stacks, band/stack swaps, and transpose. These transformations
preserve Sudoku structure and logical difficulty while producing different
puzzle/solution strings.

### Full SE Bucket Corpus

To fill all app difficulty buckets from one candidate stream, use
`scripts/generate_serate_bucket_corpus.py`. The default buckets are:

```text
easy              [1, 2)
medium            [2, 3)
hard              [3, 4)
expert            [4, 5)
master            [5, 6)
extreme           [6, 7)
advanced_7_8      [7, 8)
advanced_8_plus   [8, infinity)
```

Smoke test:

```bash
python3 scripts/generate_serate_bucket_corpus.py \
  --candidate-command "tdoku/build/generate -p0 -c0 -g1 -d1 -n100 -e50 -s0 -l 5000 -a1" \
  --serate-jar SukakuExplainer.jar \
  --java-bin /opt/homebrew/opt/openjdk/bin/java \
  --target-per-bucket 10 \
  --chunk-size 5 \
  --batch-size 50 \
  --max-candidates 5000 \
  --threads 10 \
  --output-dir data/puzzles/serate-buckets-smoke
```

Full run:

```bash
python3 scripts/generate_serate_bucket_corpus.py \
  --candidate-command "tdoku/build/generate -p0 -c0 -g1 -d1 -n500 -e100 -s0 -a1" \
  --serate-jar SukakuExplainer.jar \
  --java-bin /opt/homebrew/opt/openjdk/bin/java \
  --target-per-bucket 1000000 \
  --chunk-size 10000 \
  --batch-size 250 \
  --threads 10 \
  --output-dir data/puzzles/serate-buckets
```

The 9-10 and 10+ buckets are rare with brute-force generation. If those lag,
use the verified seed expansion workflow for advanced buckets and this bucket
script for the common ranges.

At runtime, the committed `data/puzzles/serate-buckets` path works by default.
To override it with a larger server-mounted corpus:

```bash
PUZZLE_HINT_SERATE_CORPUS_DIR=/srv/puzzle-hint/serate-buckets \
python3 -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8001
```

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
```
