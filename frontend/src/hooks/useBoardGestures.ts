"use client";

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";

import { isNoteEntryMode, type EntryMode, type NoteEntryMode } from "../lib/constants";

/**
 * Everything the pointer gestures need from the game hook: the bits of board
 * state they read plus the placement/note actions they invoke. Passed fresh on
 * every render so the handlers always close over current values.
 */
export type BoardGestureDeps = {
  paused: boolean;
  quickFillMode: boolean;
  quickFillDigit: number | null;
  entryMode: EntryMode;
  noteType: NoteEntryMode;
  selectedIndex: number;
  selectedIndexes: number[];
  setSelectedIndex: (index: number) => void;
  setSelectedIndexes: Dispatch<SetStateAction<number[]>>;
  placeQuickFillAt: (index: number) => void;
  placeQuickFillOnSelection: () => void;
  addNoteToIndexes: (indexes: number[], digit: number, layer: NoteEntryMode) => void;
  toggleNoteOnIndexes: (indexes: number[], digit: number, layer: NoteEntryMode) => void;
  applyValueToCells: (indexes: number[], value: number | null, shouldAdvance: boolean) => void;
};

/**
 * Pointer/touch selection and quick-fill gestures for the board: tap-to-fill,
 * mouse drag-select, and right-button note painting. All the gesture bookkeeping
 * refs and the global pointer listener live here so the game hook stays focused
 * on board state.
 */
export function useBoardGestures(deps: BoardGestureDeps) {
  const {
    paused,
    quickFillMode,
    quickFillDigit,
    entryMode,
    noteType,
    selectedIndex,
    selectedIndexes,
    setSelectedIndex,
    setSelectedIndexes,
    placeQuickFillAt,
    placeQuickFillOnSelection,
    addNoteToIndexes,
    toggleNoteOnIndexes,
    applyValueToCells
  } = deps;

  const draggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  // Drag-select only engages once the pointer leaves a small dead zone around the
  // press point, so a tap that jitters across a cell border is not read as a drag.
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragArmedRef = useRef(false);
  // Details of the active left press, used to resolve the gesture on release.
  const pressIndexRef = useRef<number | null>(null);
  const pressAdditiveRef = useRef(false);
  const pressTouchRef = useRef(false);
  const rightPointerModeRef = useRef<"note" | "inactive" | null>(null);
  const rightPointerStartIndexRef = useRef<number | null>(null);
  const rightPointerMovedRef = useRef(false);
  const rightPointerVisitedRef = useRef<Set<number>>(new Set());

  // End a drag selection wherever the pointer is released, and only arm the drag
  // once the pointer has travelled past a small threshold from the press point.
  useEffect(() => {
    const DRAG_THRESHOLD = 8;

    function handlePointerMove(event: PointerEvent) {
      if (!draggingRef.current || dragArmedRef.current || !pointerStartRef.current) {
        return;
      }
      const dx = event.clientX - pointerStartRef.current.x;
      const dy = event.clientY - pointerStartRef.current.y;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        dragArmedRef.current = true;
      }
    }

    function handlePointerUp() {
      draggingRef.current = false;
      dragArmedRef.current = false;
      pointerStartRef.current = null;
      rightPointerModeRef.current = null;
      rightPointerStartIndexRef.current = null;
      rightPointerVisitedRef.current = new Set();
    }
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  function selectCellFromPointerDown(index: number, additive: boolean) {
    setSelectedIndex(index);
    if (additive) {
      setSelectedIndexes((current) => {
        if (!current.includes(index)) {
          return [...current, index];
        }
        const next = current.filter((item) => item !== index);
        return next.length > 0 ? next : [index];
      });
    } else {
      // Clicking inside an existing multi-selection (built by drag or Alt-click)
      // keeps the whole group so the click can mark all of them at once;
      // clicking anywhere else starts a fresh single selection.
      setSelectedIndexes((current) =>
        quickFillMode && current.length > 1 && current.includes(index) ? current : [index]
      );
    }
  }

  function beginCellSelection(index: number, additive: boolean, button = 0, x = 0, y = 0, pointerType = "mouse") {
    if (paused) {
      return;
    }
    if (button === 2) {
      draggingRef.current = false;
      dragMovedRef.current = false;
      rightPointerModeRef.current = quickFillMode && quickFillDigit !== null && entryMode === "value" ? "note" : "inactive";
      rightPointerStartIndexRef.current = index;
      rightPointerMovedRef.current = false;
      rightPointerVisitedRef.current = new Set();
      selectCellFromPointerDown(index, additive);
      return;
    }

    rightPointerModeRef.current = null;
    rightPointerStartIndexRef.current = null;
    rightPointerVisitedRef.current = new Set();
    draggingRef.current = true;
    dragMovedRef.current = false;
    dragArmedRef.current = false;
    pointerStartRef.current = { x, y };
    pressIndexRef.current = index;
    pressAdditiveRef.current = additive;
    pressTouchRef.current = pointerType === "touch";

    // Whether this press lands inside a kept multi-selection must be read before
    // selectCellFromPointerDown rewrites the selection.
    const onKeptSelection = quickFillMode && selectedIndexes.length > 1 && selectedIndexes.includes(index);
    selectCellFromPointerDown(index, additive);

    // Touch fills on press so fast/edge taps register instantly and reliably;
    // dragging is disabled for touch. Mouse/pen wait for release (see
    // endCellSelection) so a click-drag can still build a multi-selection.
    if (pressTouchRef.current && quickFillMode && !additive) {
      if (onKeptSelection) {
        placeQuickFillOnSelection();
      } else {
        placeQuickFillAt(index);
      }
    }
  }

  // Mouse/pen release: place the locked digit at the pressed cell when the
  // gesture was a plain click (not a drag-select or an Alt build-up). Touch
  // already placed on press.
  function endCellSelection() {
    if (paused || pressTouchRef.current || !draggingRef.current) {
      return;
    }
    if (dragMovedRef.current || pressAdditiveRef.current) {
      return;
    }
    if (!quickFillMode || quickFillDigit === null) {
      return;
    }
    const index = pressIndexRef.current ?? selectedIndex;
    if (index < 0) {
      return;
    }
    if (selectedIndexes.length > 1 && selectedIndexes.includes(index)) {
      placeQuickFillOnSelection();
    } else {
      placeQuickFillAt(index);
    }
  }

  function dragCellSelection(index: number) {
    if (paused) {
      return;
    }
    if (rightPointerModeRef.current !== null) {
      rightPointerMovedRef.current = true;
      if (rightPointerModeRef.current === "note" && quickFillDigit !== null) {
        const startIndex = rightPointerStartIndexRef.current;
        const indexes = [startIndex, index].filter((item): item is number => item !== null);
        const freshIndexes = indexes.filter((item) => {
          if (rightPointerVisitedRef.current.has(item)) {
            return false;
          }
          rightPointerVisitedRef.current.add(item);
          return true;
        });
        if (freshIndexes.length > 0) {
          addNoteToIndexes(freshIndexes, quickFillDigit, noteType);
        }
      }
      return;
    }
    // Drag-select is a mouse/pen gesture only; touch never drags (taps place on
    // press) so a finger sliding between cells can't hijack a tap. Movement is
    // also ignored until the press travels past the arm threshold so a jittery
    // click is not read as a drag.
    if (pressTouchRef.current || !draggingRef.current || !dragArmedRef.current) {
      return;
    }
    dragMovedRef.current = true;
    setSelectedIndex(index);
    setSelectedIndexes((current) => (current.includes(index) ? current : [...current, index]));
  }

  // Both selection and quick-fill placement happen on pointer down/drag. The
  // click event stays unused for the board because it is too laggy and
  // drift-prone on touch and trackpad; keyboard activation is handled elsewhere.
  function clickCell() {
    dragMovedRef.current = false;
  }

  function rightClickCell(index: number) {
    if (paused) {
      return;
    }
    if (rightPointerMovedRef.current) {
      rightPointerMovedRef.current = false;
      return;
    }
    if (!quickFillMode || quickFillDigit === null) {
      return;
    }

    const targetIndexes = selectedIndexes.length > 1 && selectedIndexes.includes(index) ? selectedIndexes : [index];
    if (entryMode === "value") {
      toggleNoteOnIndexes(targetIndexes, quickFillDigit, noteType);
      return;
    }

    if (isNoteEntryMode(entryMode)) {
      applyValueToCells(targetIndexes, quickFillDigit, false);
    }
  }

  return { beginCellSelection, endCellSelection, dragCellSelection, clickCell, rightClickCell };
}
