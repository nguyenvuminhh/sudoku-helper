# Sudoku hint engine — WebAssembly build

The in-app hint engine is [l2sg](https://github.com/rafaelfassi/l2sg) (a C++17
logical Sudoku solver, MIT) compiled to WebAssembly. This directory holds the
binding and the build pipeline; the compiled artifacts live in
`../frontend/public/wasm/` and are committed so the app needs no build step.

## What gets built

`bindings.cpp` exports a single embind function:

```cpp
std::string getHint(const std::string& puzzle, const std::string& candidates);
```

- `puzzle` — 81 characters, digits `1`–`9` for givens, `0` or `.` for empty cells.
- `candidates` — optional pencil marks so the hint respects work the player has
  already done: 81 cells separated by `|`, each cell a run of its candidate
  digits (`""` for filled cells), e.g. `"|159|3|..."`. Pass `""` to derive full
  candidates from the values.
- returns a JSON string describing the **next logical step**, the literal
  `null` when there is no logical step (solved, or only guessing would help), or
  `{"error":"invalid_format"|"unsolvable"}`.

JSON shape (consumed by `frontend/src/lib/hints.ts`):

```jsonc
{
  "technique": "X-Wings",            // l2sg display name
  "description": "X-Wings: remove 4 from 2 cells.",
  "difficulty": 10,                  // rank, lower = simpler
  "causalCells": [54, 55],           // cell indices (0..80) forming the pattern
  "eliminationCells": [60, 61],      // cells where candidates are removed
  "eliminations": [{ "cell": 60, "digit": 4 }, { "cell": 61, "digit": 4 }],
  "placement": null                  // or { "cell": 8, "digit": 9 } for a placement
}
```

Cell index = `row * 9 + col` (0-based), matching the frontend's `cellToIndex`.

l2sg's solver is capped at `LEV_3_LOGIC`, so it never returns a guess/brute-force
step. Techniques covered: naked/hidden singles–quads, locked candidates
(pointing/claiming), X-Wing, Swordfish, Jellyfish, XY-Wing, W-Wing, Skyscraper,
2-String Kite.

When l2sg finds no step, `bindings.cpp` runs its own advanced
**elimination-only** techniques (simplest-first) before giving up: **XYZ-Wing**,
**Unique Rectangle (Type 1)**, **XY-Chain**, and **ALS-XZ**. These are not in
l2sg's `Technique` enum, so they emit the JSON directly (with `placement: null`)
and use difficulty ranks 17–20. Each was validated for soundness — never
removing a candidate that belongs to the solution — against tens of thousands of
rated puzzles (see `getHint`'s fallback section). The Unique Rectangle technique
assumes a unique solution, which holds for proper puzzles.

## Rebuilding

Requires the [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html)
and `git`. `wasm-opt` (Binaryen, bundled with emsdk) is used if present.

```bash
# Option A: script (recommended)
EMSDK=/path/to/emsdk ./build.sh        # clones l2sg, compiles, writes to public/wasm/

# Option B: CMake
git clone https://github.com/rafaelfassi/l2sg.git l2sg
emcmake cmake -B build -S .
cmake --build build
```

Output: `../frontend/public/wasm/l2sg.js` (~28 KB) and `l2sg.wasm` (~245 KB,
~88 KB gzipped). Commit both after rebuilding.

## How the app loads it

`frontend/public/wasm/hint-worker.js` is a classic Web Worker that
`importScripts('l2sg.js')`, instantiates the module, and answers `getHint`
requests off the main thread. `frontend/src/lib/hintEngine.ts` owns the worker
(singleton + promise-based request map) and `useHintEngine()` wraps it for React.
