"use client";

import { useEffect, useRef } from "react";

import { isEditableTarget } from "../lib/dom";
import { resolveKeyboardInput, resolveNavigationKey } from "../lib/sudoku-state";
import type { SudokuGame } from "./useSudokuGame";

export function useKeyboardShortcuts(game: SudokuGame) {
  const gameRef = useRef(game);
  gameRef.current = game;

  useEffect(() => {
    function handleWindowKeyDown(event: globalThis.KeyboardEvent) {
      const current = gameRef.current;
      if (isEditableTarget(event.target)) {
        return;
      }

      // Ctrl/Cmd+Z undoes the last board change.
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        current.undo();
        return;
      }

      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      // Tab toggles pencil (notes) mode while solving.
      if (event.key === "Tab") {
        if (current.isSolving) {
          event.preventDefault();
          current.toggleNotesMode();
        }
        return;
      }

      // Arrow keys and WASD move the cell selection.
      const direction = resolveNavigationKey(event.key);
      if (direction) {
        event.preventDefault();
        current.moveSelectionBy(direction);
        return;
      }

      // Enter places the active quick-fill digit in the selected cell.
      if (event.key === "Enter") {
        if (
          current.quickFillMode &&
          current.quickFillDigit !== null &&
          current.grid[current.selectedIndex] !== current.quickFillDigit
        ) {
          event.preventDefault();
          current.placeQuickFillAt(current.selectedIndex);
        }
        return;
      }

      const value = resolveKeyboardInput(event.key);
      if (value === "ignored") {
        return;
      }

      event.preventDefault();
      current.pressDigit(value);
    }

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, []);
}
