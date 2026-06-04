# Third Party Notices

## Ukodus sudoku-core

Puzzle generation and advanced human-style Sudoku rating are designed to use
`sudoku-core`, the Rust engine from Ukodus.

- Source: https://github.com/kcirtapfromspace/sudoku-core
- Pinned commit: `ad8f024d507a52eff99fdd8b5173763487b30a31`
- License: MIT
- Copyright: Copyright (c) 2026 Patrick Deutsch

The engine provides solving, generation, uniqueness checks, human-style
technique detection, and Sudoku Explainer-style ratings. Puzzle Hint invokes it
through a local command-line wrapper so the FastAPI service can keep a stable
JSON boundary around the third-party engine.
