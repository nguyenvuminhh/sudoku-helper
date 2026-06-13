"use client";

import { useEffect, useRef } from "react";

import type { SudokuGame } from "./useSudokuGame";

/* Controls (cells, keypad, panel buttons, inputs) all act on the selection, so
   a click on any of them must keep it. Only dead space outside the board and
   its controls clears the selection. */
const KEEP_SELECTION_SELECTOR = ".sudoku-board, button, input, textarea, select, a, label";

export function useClickOutsideBoard(game: SudokuGame) {
  const gameRef = useRef(game);
  gameRef.current = game;

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Element | null;
      if (target?.closest(KEEP_SELECTION_SELECTOR)) {
        return;
      }
      gameRef.current.clearSelection();
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);
}
