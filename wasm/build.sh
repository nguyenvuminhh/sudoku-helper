#!/usr/bin/env bash
#
# Builds the l2sg hint solver to WebAssembly and drops the artifacts into
# frontend/public/wasm/. This is the "offline, one-time" Phase 1 step — run it
# whenever bindings.cpp or the pinned l2sg revision changes.
#
# Requirements:
#   - Emscripten SDK. Either have `em++` on PATH, or set EMSDK=/path/to/emsdk
#     (the script will source $EMSDK/emsdk_env.sh).
#   - git (to fetch l2sg on first run).
#   - Optional: wasm-opt (Binaryen) for extra size reduction.
#
# Usage:
#   EMSDK=/path/to/emsdk ./build.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$HERE/../frontend/public/wasm"
L2SG_DIR="${L2SG_DIR:-$HERE/l2sg}"
# Pin a known-good revision for reproducible builds (override with L2SG_REF).
L2SG_REF="${L2SG_REF:-master}"

# --- Toolchain -------------------------------------------------------------
if ! command -v em++ >/dev/null 2>&1; then
  if [[ -n "${EMSDK:-}" && -f "$EMSDK/emsdk_env.sh" ]]; then
    # shellcheck disable=SC1091
    source "$EMSDK/emsdk_env.sh"
  fi
fi
command -v em++ >/dev/null 2>&1 || {
  echo "error: em++ not found. Install Emscripten and set EMSDK, or activate emsdk." >&2
  exit 1
}

# --- l2sg sources ----------------------------------------------------------
if [[ ! -d "$L2SG_DIR" ]]; then
  echo ">> cloning l2sg into $L2SG_DIR"
  git clone https://github.com/rafaelfassi/l2sg.git "$L2SG_DIR"
  git -C "$L2SG_DIR" checkout "$L2SG_REF"
fi

LIB="$L2SG_DIR/lib"
SOURCES=(
  "$LIB/src/Grid.cpp"
  "$LIB/src/Solver.cpp"
  "$LIB/src/Enums.cpp"
  "$LIB/src/Logs.cpp"
  "$LIB"/src/techniques/*.cpp
  "$HERE/bindings.cpp"
)

mkdir -p "$OUT_DIR"

# --- Compile ---------------------------------------------------------------
echo ">> compiling to WebAssembly"
em++ -O3 -std=c++17 --bind \
  -I "$LIB/include" -I "$LIB/include/l2sg" -I "$LIB/src" \
  "${SOURCES[@]}" \
  -s MODULARIZE=1 \
  -s EXPORT_NAME=createL2sgModule \
  -s ENVIRONMENT=web,worker \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s FILESYSTEM=0 \
  -s EXPORTED_RUNTIME_METHODS=[] \
  -o "$OUT_DIR/l2sg.js"

# --- Optional size pass ----------------------------------------------------
# emcc -O3 already runs Binaryen, so this is a marginal extra pass. Write to a
# temp file and only swap it in on success, so a feature mismatch can never
# corrupt the already-valid emcc output. --enable-bulk-memory matches the
# features emscripten emits (memory.copy etc.).
if command -v wasm-opt >/dev/null 2>&1; then
  echo ">> wasm-opt -Oz"
  if wasm-opt -Oz --all-features "$OUT_DIR/l2sg.wasm" -o "$OUT_DIR/l2sg.wasm.opt" 2>/dev/null; then
    mv "$OUT_DIR/l2sg.wasm.opt" "$OUT_DIR/l2sg.wasm"
  else
    rm -f "$OUT_DIR/l2sg.wasm.opt"
    echo ">> wasm-opt pass skipped (feature mismatch); keeping emcc -O3 output"
  fi
else
  echo ">> wasm-opt not found; skipping (emcc -O3 already optimizes)"
fi

echo ">> done:"
ls -lh "$OUT_DIR"/l2sg.* | awk '{print "   " $9 "  " $5}'
echo ">> gzipped sizes:"
for f in "$OUT_DIR"/l2sg.wasm "$OUT_DIR"/l2sg.js; do
  printf "   %s  %s\n" "$f" "$(gzip -c "$f" | wc -c | tr -d ' ') bytes"
done
