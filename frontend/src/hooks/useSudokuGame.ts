"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  requestGeneratedPuzzle,
  recognizeImage,
  requestHint,
  type HintResponse
} from "../lib/api";
import { SAMPLE_PUZZLE, type EntryMode, type GeneratedLevel, type TutorPhase } from "../lib/constants";
import {
  checkResultMessage,
  collectConflictIndexes,
  collectHintCells,
  collectHintPreview,
  generatedPuzzleMessage,
  type HintPreview
} from "../lib/hints";
import { parseSavedSession, serializeSession, SESSION_STORAGE_KEY } from "../lib/session";
import { decodePuzzleParam, encodePuzzleParam } from "../lib/share-codec";
import { formatElapsedSeconds } from "../lib/time";
import {
  applyHintEliminationsToNotes,
  applyOcrCells,
  cellToIndex,
  checkPuzzle,
  cloneMarks,
  collectMatchingDigitHighlights,
  countFilledCells,
  createBoardSnapshot,
  createEmptyGrid,
  createEmptyMarks,
  createGivenMask,
  findNextCellWithValue,
  findNextInputIndex,
  gridToPayload,
  gridsEqual,
  indexToCell,
  moveSelection,
  nextIncompleteDigit,
  notesEqual,
  notesToCandidatePayload,
  numberListsEqual,
  parsePuzzleText,
  peerIndexes,
  pruneEliminationsFromNotes,
  pushUndoSnapshot,
  quickFillNotes,
  restoreUndoSnapshot,
  setCellValue,
  setCellValueWithMarks,
  toggleCellNote,
  toggleColorOnCells,
  toggleNoteOnCells,
  validateSudokuGrid,
  type BoardMarks,
  type BoardSnapshot,
  type CheckResult,
  type GivenMask,
  type NavDirection,
  type SudokuGrid
} from "../lib/sudoku-state";
import { useSettings } from "./useSettings";

type NoteEntryMode = Extract<EntryMode, "corner" | "center">;

export type SudokuGame = ReturnType<typeof useSudokuGame>;

export function useSudokuGame() {
  const [grid, setGrid] = useState<SudokuGrid>(() => createEmptyGrid());
  const [marks, setMarks] = useState<BoardMarks>(() => createEmptyMarks());
  const [givenMask, setGivenMask] = useState<GivenMask>(() => createGivenMask(createEmptyGrid()));
  const [phase, setPhase] = useState<TutorPhase>("loading");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([0]);
  const [currentHint, setCurrentHint] = useState<HintResponse | null>(null);
  const [history, setHistory] = useState<HintResponse[]>([]);
  const [undoStack, setUndoStack] = useState<BoardSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<BoardSnapshot[]>([]);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [lowConfidence, setLowConfidence] = useState<number[]>([]);
  const [messages, setMessages] = useState<string[]>([
    "Enter a puzzle on the board or upload a clean Sudoku screenshot."
  ]);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [entryMode, setEntryMode] = useState<EntryMode>("value");
  // Remembers the last note mode so the Normal/Note toggle can restore it.
  const [noteType, setNoteType] = useState<NoteEntryMode>("corner");
  const [quickFillMode, setQuickFillMode] = useState(false);
  const [quickFillDigit, setQuickFillDigit] = useState<number | null>(null);
  const [puzzleText, setPuzzleText] = useState("");
  const [generatedLevel, setGeneratedLevel] = useState<GeneratedLevel>("easy");
  const [paused, setPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [solvedAnnounced, setSolvedAnnounced] = useState(false);
  const [finishDismissed, setFinishDismissed] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [checksUsed, setChecksUsed] = useState(0);
  const [techniqueNames, setTechniqueNames] = useState<string[]>([]);
  const { settings, setSetting } = useSettings();

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

  // Live mirrors of the board state. Two pointer/click handlers can run in the
  // same tick before React re-renders (notably on touch, where the click-delay
  // can fire both taps' clicks back-to-back); reading and writing these refs at
  // commit time lets the second edit build on the first instead of clobbering it
  // with a stale closure copy.
  const gridRef = useRef(grid);
  const marksRef = useRef(marks);
  const lowConfidenceRef = useRef(lowConfidence);
  const selectedIndexRef = useRef(selectedIndex);
  gridRef.current = grid;
  marksRef.current = marks;
  lowConfidenceRef.current = lowConfidence;
  selectedIndexRef.current = selectedIndex;

  const filledCount = countFilledCells(grid);
  const digitCounts = useMemo(() => {
    const counts = new Array(10).fill(0);
    for (const value of grid) {
      if (value) {
        counts[value] += 1;
      }
    }
    return counts;
  }, [grid]);
  const selectedCell = indexToCell(selectedIndex);
  const isSolving = phase === "solving";
  const selectedIsGiven = isSolving && givenMask[selectedIndex];
  const selectionAllGiven = isSolving && selectedIndexes.every((index) => givenMask[index]);
  const selectionAllFilled = selectedIndexes.every((index) => grid[index] !== null);
  const selectedNotes =
    entryMode === "corner" ? (marks.corner[selectedIndex] ?? []) : (marks.center[selectedIndex] ?? []);
  const hasAnyNotes = marks.corner.some((notes) => notes.length > 0) || marks.center.some((notes) => notes.length > 0);
  const activeHighlightDigit = quickFillDigit ?? (selectedIndex >= 0 ? grid[selectedIndex] : null);
  const validation = useMemo(() => validateSudokuGrid(grid), [grid]);
  const sharePuzzleGrid = useMemo(
    () => (isSolving ? grid.map((value, index) => (givenMask[index] ? value : null)) : [...grid]),
    [givenMask, grid, isSolving]
  );
  const shareValidation = useMemo(() => validateSudokuGrid(sharePuzzleGrid), [sharePuzzleGrid]);
  const canSharePuzzle = countFilledCells(sharePuzzleGrid) > 0 && shareValidation.valid;
  const statusMessages = validation.valid ? messages : ["Fix the highlighted conflicts before requesting a hint."];
  const conflictIndexes = useMemo(() => collectConflictIndexes(validation.conflicts), [validation]);
  const incorrectIndexes = useMemo(() => new Set(checkResult?.incorrectIndexes ?? []), [checkResult]);
  const matchingHighlights = useMemo(() => {
    const center = collectMatchingDigitHighlights(grid, marks.center, activeHighlightDigit);
    const corner = collectMatchingDigitHighlights(grid, marks.corner, activeHighlightDigit);
    return {
      valueIndexes: new Set(center.valueIndexes),
      noteIndexes: new Set([...center.noteIndexes, ...corner.noteIndexes])
    };
  }, [activeHighlightDigit, grid, marks]);
  const primaryIndexes = useMemo(() => collectHintCells(currentHint, "primary"), [currentHint]);
  const relatedIndexes = useMemo(() => collectHintCells(currentHint, "related"), [currentHint]);
  const eliminationIndexes = useMemo(() => collectHintCells(currentHint, "elimination"), [currentHint]);
  const hintPreview: HintPreview | null = useMemo(() => collectHintPreview(currentHint, grid), [currentHint, grid]);
  const canApplyCurrentHint =
    !busyLabel &&
    (Boolean(hintPreview) || Boolean(currentHint?.action.type === "eliminate" && currentHint.action.eliminations.length > 0));
  const isSolved = isSolving && filledCount === 81 && validation.valid;
  const showFinishDialog = isSolved && !finishDismissed;
  const peerHighlightIndexes = useMemo(
    () => new Set(selectedIndex >= 0 ? peerIndexes(selectedIndex) : []),
    [selectedIndex]
  );
  const selectedIndexSet = useMemo(() => new Set(selectedIndexes), [selectedIndexes]);
  const givensCount = useMemo(() => givenMask.filter(Boolean).length, [givenMask]);
  const finishStats = {
    elapsedSeconds,
    hintsUsed,
    checksUsed,
    givens: givensCount,
    filledByYou: 81 - givensCount,
    techniques: techniqueNames
  };

  // Shared puzzle URLs take precedence over saved sessions; opening a link
  // should show that puzzle even if this browser already has a local game.
  useEffect(() => {
    let sharedParam: string | null = null;
    try {
      sharedParam = new URLSearchParams(window.location.search).get("p");
    } catch {
      sharedParam = null;
    }

    if (sharedParam) {
      try {
        const sharedGrid = decodePuzzleParam(sharedParam);
        const sharedValidation = validateSudokuGrid(sharedGrid);
        if (!sharedValidation.valid) {
          setMessages(["Shared puzzle has conflicts. The link was not loaded."]);
          return;
        }
        if (countFilledCells(sharedGrid) === 0) {
          setMessages(["Shared puzzle is empty. The link was not loaded."]);
          return;
        }

        loadPuzzle(sharedGrid, ["Loaded shared puzzle. Review the board, then start solving."]);
        setPuzzleText(gridToPayload(sharedGrid));
        setLowConfidence([]);
      } catch {
        setMessages(["Share link could not be loaded."]);
      }
      return;
    }

    let saved;
    try {
      saved = parseSavedSession(window.localStorage.getItem(SESSION_STORAGE_KEY));
    } catch {
      return;
    }
    if (!saved) {
      return;
    }

    setGrid(saved.grid);
    setMarks(saved.marks);
    setGivenMask(saved.givenMask);
    setPhase(saved.phase);
    setSelectedIndex(saved.selectedIndex);
    setSelectedIndexes([saved.selectedIndex]);
    setLowConfidence(saved.lowConfidence);
    setElapsedSeconds(saved.elapsedSeconds);
    setHintsUsed(saved.hintsUsed);
    setChecksUsed(saved.checksUsed);
    setTechniqueNames(saved.techniqueNames);
    if (saved.phase === "solving") {
      setQuickFillMode(true);
    }
    setMessages(["Restored your previous session. Reset the puzzle to start fresh."]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the board so the game survives reloads.
  useEffect(() => {
    try {
      window.localStorage.setItem(
        SESSION_STORAGE_KEY,
        serializeSession({
          grid,
          marks,
          givenMask,
          phase,
          selectedIndex,
          lowConfidence,
          elapsedSeconds,
          hintsUsed,
          checksUsed,
          techniqueNames
        })
      );
    } catch {
      // Storage may be unavailable (private mode, quota); play without saving.
    }
  }, [grid, marks, givenMask, phase, selectedIndex, lowConfidence, elapsedSeconds, hintsUsed, checksUsed, techniqueNames]);

  // Tick the solve clock while actively solving.
  useEffect(() => {
    if (!isSolving || paused || isSolved) {
      return;
    }
    const id = window.setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(id);
  }, [isSolving, paused, isSolved]);

  // Announce a completed board once, and re-arm if the user undoes back out.
  useEffect(() => {
    if (isSolved && !solvedAnnounced) {
      setSolvedAnnounced(true);
      setMessages([`Solved! You completed the puzzle in ${formatElapsedSeconds(elapsedSeconds)}.`]);
    } else if (!isSolved && solvedAnnounced) {
      setSolvedAnnounced(false);
      setFinishDismissed(false);
    }
  }, [isSolved, solvedAnnounced, elapsedSeconds]);

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

  function selectOnly(index: number) {
    selectedIndexRef.current = index;
    setSelectedIndex(index);
    setSelectedIndexes([index]);
  }

  // Drops the selection entirely (e.g. a click landing off the board). -1 marks
  // "no cell"; the derived peer/highlight sets handle it.
  function clearSelection() {
    setSelectedIndex(-1);
    setSelectedIndexes([]);
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

  function recordUndoSnapshot() {
    // Snapshot from the live refs *now*: a setState updater runs lazily, by which
    // point updateGrid/commitMarks may have advanced the refs past this edit.
    const snapshot = createBoardSnapshot(gridRef.current, marksRef.current, selectedIndexRef.current, lowConfidenceRef.current);
    setUndoStack((items) => pushUndoSnapshot(items, snapshot));
    setRedoStack([]);
  }

  function restoreSnapshot(snapshot: BoardSnapshot) {
    gridRef.current = snapshot.grid;
    marksRef.current = snapshot.marks;
    lowConfidenceRef.current = snapshot.lowConfidence;
    setGrid(snapshot.grid);
    setMarks(snapshot.marks);
    selectOnly(snapshot.selectedIndex);
    setLowConfidence(snapshot.lowConfidence);
    setCurrentHint(null);
    setCheckResult(null);
  }

  function undo() {
    const restored = restoreUndoSnapshot(undoStack);
    if (!restored.snapshot) {
      return;
    }

    const redoSnapshot = createBoardSnapshot(gridRef.current, marksRef.current, selectedIndexRef.current, lowConfidenceRef.current);
    setRedoStack((items) => pushUndoSnapshot(items, redoSnapshot));
    restoreSnapshot(restored.snapshot);
    setUndoStack(restored.stack);
    setMessages(["Undid the last board change."]);
  }

  function redo() {
    const restored = restoreUndoSnapshot(redoStack);
    if (!restored.snapshot) {
      return;
    }

    const undoSnapshot = createBoardSnapshot(gridRef.current, marksRef.current, selectedIndexRef.current, lowConfidenceRef.current);
    setUndoStack((items) => pushUndoSnapshot(items, undoSnapshot));
    restoreSnapshot(restored.snapshot);
    setRedoStack(restored.stack);
    setMessages(["Redid the last undone change."]);
  }

  function togglePause() {
    if (!isSolving || isSolved) {
      return;
    }
    const next = !paused;
    setPaused(next);
    setMessages([next ? "Paused. The board is hidden until you resume." : "Resumed. The clock is running again."]);
  }

  function check() {
    if (!isSolving) {
      setMessages(["Start solving before checking the puzzle."]);
      return;
    }

    const givens = grid.map((value, index) => (givenMask[index] ? value : null));
    const result = checkPuzzle(givens, grid);
    setCheckResult(result);
    setChecksUsed((count) => count + 1);
    setMessages([checkResultMessage(result)]);
  }

  function marksEqual(left: BoardMarks, right: BoardMarks): boolean {
    return (
      notesEqual(left.corner, right.corner) &&
      notesEqual(left.center, right.center) &&
      left.colors.length === right.colors.length &&
      left.colors.every((color, index) => color === right.colors[index])
    );
  }

  function hasBoardStateChanged(nextGrid: SudokuGrid, nextMarks: BoardMarks, nextLowConfidence = lowConfidenceRef.current): boolean {
    return (
      !gridsEqual(gridRef.current, nextGrid) ||
      !marksEqual(marksRef.current, nextMarks) ||
      !numberListsEqual(lowConfidenceRef.current, nextLowConfidence)
    );
  }

  function updateGrid(nextGrid: SudokuGrid, nextMarks = marksRef.current) {
    gridRef.current = nextGrid;
    marksRef.current = nextMarks;
    setGrid(nextGrid);
    setMarks(nextMarks);
    setCurrentHint(null);
    setCheckResult(null);
  }

  /** Records an undo snapshot and applies a marks-only change. */
  function commitMarks(nextMarks: BoardMarks) {
    if (hasBoardStateChanged(gridRef.current, nextMarks)) {
      recordUndoSnapshot();
    }
    marksRef.current = nextMarks;
    setMarks(nextMarks);
    setCurrentHint(null);
  }

  function pressDigit(value: number | null) {
    if (paused) {
      return;
    }
    // In color mode the eraser always clears the selected cells' colors, even
    // under quick fill (which otherwise treats a null press as "unlock digit").
    if (entryMode === "color" && value === null) {
      applyColorToSelection(null);
      return;
    }
    if (quickFillMode) {
      if (value === null) {
        setQuickFillDigit(null);
        setMessages(["Quick fill digit cleared."]);
        return;
      }

      // Re-pressing the active digit applies it to the selection; the first
      // press only locks the digit.
      if (value === quickFillDigit) {
        placeQuickFillOnSelection();
        return;
      }

      setQuickFillDigit(value);
      if (selectedIndexes.length === 1) {
        const matchingCell = findNextCellWithValue(grid, value, selectedIndex);
        if (matchingCell !== null) {
          selectOnly(matchingCell);
        }
      }
      setMessages([
        entryMode === "value"
          ? `Quick fill locked to ${value}. Press ${value} or Enter on a cell to fill it.`
          : `Quick fill locked to ${value}. Press ${value} or Enter on cells to mark them.`
      ]);
      return;
    }

    if (entryMode === "corner" || entryMode === "center") {
      if (value === null) {
        clearSelectedNotes();
      } else {
        toggleNoteOnSelection(value);
      }
      return;
    }

    if (entryMode === "color") {
      applyColorToSelection(value);
      return;
    }

    applyValueToCells(selectedIndexes, value, selectedIndexes.length === 1);
  }

  // Both selection and quick-fill placement now happen on pointer down/drag (see
  // beginCellSelection / dragCellSelection). The click event stays unused for the
  // board because it is too laggy and drift-prone on touch and trackpad; keyboard
  // activation is handled by the keydown listener instead.
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

  function placeQuickFillAt(index: number) {
    if (quickFillDigit === null) {
      return;
    }

    if (entryMode === "corner" || entryMode === "center") {
      if (gridRef.current[index] !== null) {
        setMessages(["Notes can only be edited on empty cells."]);
        return;
      }
      const liveMarks = marksRef.current;
      commitMarks({ ...liveMarks, [entryMode]: toggleCellNote(liveMarks[entryMode], gridRef.current, index, quickFillDigit) });
      return;
    }

    if (entryMode === "color") {
      const liveMarks = marksRef.current;
      commitMarks({ ...liveMarks, colors: toggleColorOnCells(liveMarks.colors, [index], quickFillDigit) });
      return;
    }

    applyValueToCells([index], quickFillDigit, false);
  }

  function placeQuickFillOnSelection() {
    if (quickFillDigit === null) {
      return;
    }

    if (entryMode === "corner" || entryMode === "center") {
      toggleNoteOnSelection(quickFillDigit);
      return;
    }
    if (entryMode === "color") {
      applyColorToSelection(quickFillDigit);
      return;
    }

    const targets = selectedIndexes.filter((index) => gridRef.current[index] !== quickFillDigit);
    if (targets.length > 0) {
      applyValueToCells(targets, quickFillDigit, false);
      return;
    }
    // Nothing to fill: keep the old behavior of cycling to the next cell that
    // already holds the locked digit.
    if (selectedIndexes.length === 1) {
      const matchingCell = findNextCellWithValue(gridRef.current, quickFillDigit, selectedIndexRef.current);
      if (matchingCell !== null) {
        selectOnly(matchingCell);
      }
    }
  }

  function toggleNoteOnSelection(digit: number) {
    toggleNoteOnIndexes(selectedIndexes, digit, isNoteEntryMode(entryMode) ? entryMode : noteType);
  }

  function toggleNoteOnIndexes(indexes: number[], digit: number, layer: NoteEntryMode) {
    if (!isSolving) {
      setMessages(["Start solving before editing notes."]);
      return;
    }
    const liveGrid = gridRef.current;
    const liveMarks = marksRef.current;
    const otherLayer = layer === "corner" ? "center" : "corner";
    const emptyTargets = indexes.filter((index) => liveGrid[index] === null);
    if (emptyTargets.length === 0) {
      setMessages(["Notes can only be edited on empty cells."]);
      return;
    }

    // A digit lives in either the corner or the center layer, never both: drop
    // it from the opposite layer on the cells we just touched.
    const targetSet = new Set(emptyTargets);
    const nextOther = liveMarks[otherLayer].map((cellNotes, index) =>
      targetSet.has(index) ? cellNotes.filter((note) => note !== digit) : cellNotes
    );
    commitMarks({
      ...liveMarks,
      [layer]: toggleNoteOnCells(liveMarks[layer], liveGrid, emptyTargets, digit),
      [otherLayer]: nextOther
    });
  }

  function addNoteToIndexes(indexes: number[], digit: number, layer: NoteEntryMode) {
    if (!isSolving) {
      setMessages(["Start solving before editing notes."]);
      return;
    }
    const liveGrid = gridRef.current;
    const liveMarks = marksRef.current;
    const emptyTargets = indexes.filter((index) => liveGrid[index] === null);
    if (emptyTargets.length === 0) {
      return;
    }

    const targetSet = new Set(emptyTargets);
    const otherLayer = layer === "corner" ? "center" : "corner";
    const nextLayer = liveMarks[layer].map((cellNotes, index) => {
      if (!targetSet.has(index) || cellNotes.includes(digit)) {
        return cellNotes;
      }
      return [...cellNotes, digit].sort((left, right) => left - right);
    });
    const nextOther = liveMarks[otherLayer].map((cellNotes, index) =>
      targetSet.has(index) ? cellNotes.filter((note) => note !== digit) : cellNotes
    );
    commitMarks({ ...liveMarks, [layer]: nextLayer, [otherLayer]: nextOther });
  }

  function applyColorToSelection(color: number | null) {
    if (!isSolving) {
      setMessages(["Start solving before highlighting cells."]);
      return;
    }

    const liveMarks = marksRef.current;
    commitMarks({ ...liveMarks, colors: toggleColorOnCells(liveMarks.colors, selectedIndexes, color) });
  }

  function clearSelectedNotes() {
    if (!isSolving) {
      return;
    }

    const liveMarks = marksRef.current;
    const layer = entryMode === "corner" ? "corner" : "center";
    const nextLayer = liveMarks[layer].map((cellNotes, index) => (selectedIndexes.includes(index) ? [] : cellNotes));
    commitMarks({ ...liveMarks, [layer]: nextLayer });
  }

  function applyValueToCells(indexes: number[], value: number | null, shouldAdvance: boolean) {
    const editable = indexes.filter((index) => canEditCellValue(index));
    if (editable.length === 0) {
      setMessages(["Loaded cells are locked during solving."]);
      return;
    }

    let nextGrid = gridRef.current;
    let nextMarks = marksRef.current;
    for (const index of editable) {
      if (isSolving) {
        const result = setCellValueWithMarks(nextGrid, nextMarks, index, value);
        nextGrid = result.grid;
        nextMarks = result.marks;
      } else {
        nextGrid = setCellValue(nextGrid, index, value);
      }
    }

    const nextLowConfidence = lowConfidenceRef.current.filter((index) => !editable.includes(index));
    if (isSolving && hasBoardStateChanged(nextGrid, nextMarks, nextLowConfidence)) {
      recordUndoSnapshot();
    }
    updateGrid(nextGrid, nextMarks);
    lowConfidenceRef.current = nextLowConfidence;
    setLowConfidence(nextLowConfidence);
    if (shouldAdvance && value !== null && editable.length === 1) {
      selectOnly(findNextInputIndex(nextGrid, editable[0]));
    }
    maybeAdvanceQuickFillDigit(nextGrid, value);
  }

  /** Moves quick fill to the next incomplete digit once the current one is done. */
  function maybeAdvanceQuickFillDigit(nextGrid: SudokuGrid, placedValue: number | null) {
    if (!settings.autoAdvanceDigit || !quickFillMode || placedValue === null || quickFillDigit !== placedValue) {
      return;
    }
    const count = nextGrid.filter((value) => value === placedValue).length;
    if (count < 9) {
      return;
    }

    const next = nextIncompleteDigit(nextGrid, placedValue);
    setQuickFillDigit(next);
    if (next !== null) {
      // Move the selection onto the new digit too, like locking it by hand does,
      // so the highlighted cell follows the active number.
      const matchingCell = findNextCellWithValue(nextGrid, next, selectedIndexRef.current);
      if (matchingCell !== null) {
        selectOnly(matchingCell);
      }
      setMessages([`All ${placedValue}s are placed. Quick fill moved to ${next}.`]);
    }
  }

  function applyHint() {
    if (!currentHint) {
      return;
    }

    if (hintPreview) {
      const liveGrid = gridRef.current;
      const liveMarks = marksRef.current;
      const cell = indexToCell(hintPreview.index);
      const result = setCellValueWithMarks(liveGrid, liveMarks, hintPreview.index, hintPreview.digit);
      const nextLowConfidence = lowConfidenceRef.current.filter((index) => index !== hintPreview.index);
      if (hasBoardStateChanged(result.grid, result.marks, nextLowConfidence)) {
        recordUndoSnapshot();
      }
      updateGrid(result.grid, result.marks);
      selectOnly(hintPreview.index);
      lowConfidenceRef.current = nextLowConfidence;
      setLowConfidence(nextLowConfidence);
      setMessages([`Applied ${hintPreview.digit} at R${cell.row}C${cell.col}. Request another hint when you are ready.`]);
      maybeAdvanceQuickFillDigit(result.grid, hintPreview.digit);
      return;
    }

    if (currentHint.action.type === "eliminate" && currentHint.action.eliminations.length > 0) {
      const liveGrid = gridRef.current;
      const liveMarks = marksRef.current;
      const nextMarks = {
        ...liveMarks,
        center: applyHintEliminationsToNotes(liveGrid, liveMarks.center, currentHint.action.eliminations),
        corner: pruneEliminationsFromNotes(liveMarks.corner, currentHint.action.eliminations)
      };
      const firstCell = currentHint.action.eliminations[0].cell;
      if (hasBoardStateChanged(liveGrid, nextMarks)) {
        recordUndoSnapshot();
      }
      updateGrid(liveGrid, nextMarks);
      selectOnly(cellToIndex(firstCell));
      setMessages([
        `Applied ${currentHint.action.eliminations.length} candidate elimination${currentHint.action.eliminations.length === 1 ? "" : "s"}. Request another hint when you are ready.`
      ]);
    }
  }

  async function hint() {
    if (!isSolving) {
      setMessages(["Start solving before requesting a hint."]);
      return;
    }

    setBusyLabel("Finding hint");
    try {
      const nextHint = await requestHint(grid, marks.center);
      setCurrentHint(nextHint);
      setHistory((items) => [nextHint, ...items].slice(0, 8));
      setHintsUsed((count) => count + 1);
      setTechniqueNames((names) =>
        names.includes(nextHint.technique.name) ? names : [...names, nextHint.technique.name]
      );
      setMessages(["Hint found. Review the conclusion, then expand through the evidence."]);
    } catch (error) {
      setMessages([error instanceof Error ? error.message : "Hint generation failed."]);
    } finally {
      setBusyLabel(null);
    }
  }

  function startSolving() {
    if (filledCount === 0 || !validation.valid) {
      return;
    }

    setPhase("solving");
    setGivenMask(createGivenMask(grid));
    setMarks(createEmptyMarks());
    setEntryMode("value");
    setQuickFillMode(true);
    setQuickFillDigit(null);
    setCurrentHint(null);
    setUndoStack([]);
    setRedoStack([]);
    setCheckResult(null);
    setPaused(false);
    setElapsedSeconds(0);
    setSolvedAnnounced(false);
    setFinishDismissed(false);
    setHintsUsed(0);
    setChecksUsed(0);
    setTechniqueNames([]);
    setMessages([
      "Solving phase started. Quick fill is on: pick a digit, then press it or Enter on a cell to place it. Loaded cells are locked."
    ]);
  }

  function toggleQuickFillMode() {
    if (!isSolving) {
      setMessages(["Start solving before using quick fill mode."]);
      return;
    }

    const nextQuickFillMode = !quickFillMode;
    setQuickFillMode(nextQuickFillMode);
    if (!nextQuickFillMode) {
      setQuickFillDigit(null);
    }
    setMessages([
      nextQuickFillMode
        ? "Quick fill enabled. Select a digit, then click editable cells to apply it."
        : "Quick fill mode disabled."
    ]);
  }

  function changeEntryMode(mode: EntryMode) {
    if (!isSolving) {
      if (mode !== "value") {
        setMessages(["Start solving before using marking modes."]);
      }
      return;
    }

    setEntryMode(mode);
    if (mode !== "value") {
      if (isNoteEntryMode(mode)) {
        setNoteType(mode);
      }
    }
    setMessages([entryModeMessage(mode)]);
  }

  // Flips between Normal (value) entry and the last-used marking mode.
  function toggleNoteMode() {
    changeEntryMode(entryMode === "value" ? noteType : "value");
  }

  // Single toggle: clears every note when any exist, otherwise fills center notes.
  function toggleAllNotes() {
    if (!isSolving) {
      setMessages(["Start solving before filling notes."]);
      return;
    }

    const liveMarks = marksRef.current;
    if (hasAnyNotes) {
      commitMarks({ ...liveMarks, corner: liveMarks.corner.map(() => []), center: liveMarks.center.map(() => []) });
      setMessages(["Removed all notes."]);
      return;
    }

    commitMarks({ ...liveMarks, corner: quickFillNotes(gridRef.current) });
    setMessages(["Filled corner notes for all empty cells from the current board."]);
  }

  function loadPuzzleFromText() {
    try {
      const nextGrid = parsePuzzleText(puzzleText);
      const nextValidation = validateSudokuGrid(nextGrid);
      if (!nextValidation.valid) {
        setMessages(["Pasted puzzle has conflicts. Fix the 81-character string before loading it."]);
        return;
      }

      loadPuzzle(nextGrid, ["Loaded 81 characters. Review the board, then confirm to lock the givens."]);
      setLowConfidence([]);
    } catch (error) {
      setMessages([error instanceof Error ? error.message : "Puzzle text could not be loaded."]);
    }
  }

  async function generatePuzzle() {
    setBusyLabel("Generating puzzle");
    try {
      const generated = await requestGeneratedPuzzle(generatedLevel);
      const nextGrid = parsePuzzleText(generated.puzzle);
      loadPuzzle(nextGrid, [generatedPuzzleMessage(generated)]);
      setPuzzleText(generated.puzzle);
      setLowConfidence([]);
    } catch (error) {
      setMessages([error instanceof Error ? error.message : "Puzzle generation failed."]);
    } finally {
      setBusyLabel(null);
    }
  }

  function loadPuzzle(nextGrid: SudokuGrid, nextMessages: string[]) {
    setGrid(nextGrid);
    setMarks(createEmptyMarks());
    setGivenMask(createGivenMask(createEmptyGrid()));
    setPhase("loading");
    setEntryMode("value");
    setQuickFillMode(false);
    setQuickFillDigit(null);
    setCurrentHint(null);
    setHistory([]);
    setUndoStack([]);
    setRedoStack([]);
    setCheckResult(null);
    setPaused(false);
    setElapsedSeconds(0);
    setSolvedAnnounced(false);
    setFinishDismissed(false);
    setHintsUsed(0);
    setChecksUsed(0);
    setTechniqueNames([]);
    selectOnly(selectedIndex);
    setMessages(nextMessages);
  }

  function canEditCellValue(index: number): boolean {
    return phase === "loading" || !givenMask[index];
  }

  async function importImageFile(file: File) {
    setBusyLabel("Reading image");
    try {
      const result = await recognizeImage(file);
      const applied = applyOcrCells(createEmptyGrid(), result.cells);
      loadPuzzle(applied.grid, result.warnings);
      setLowConfidence(applied.lowConfidence);
    } catch (error) {
      setMessages([error instanceof Error ? error.message : "Image recognition failed."]);
    } finally {
      setBusyLabel(null);
    }
  }

  function loadSample() {
    loadPuzzle(parsePuzzleText(SAMPLE_PUZZLE), ["Loaded a sample puzzle. Review it, then start solving to lock the givens."]);
    setLowConfidence([]);
  }

  function reset() {
    loadPuzzle(createEmptyGrid(), ["Workspace cleared. Start with board entry or image upload."]);
    setLowConfidence([]);
  }

  async function copyShareLink() {
    const shareUrl = createShareUrl();
    if (!shareUrl) {
      setMessages(["Add a valid puzzle before sharing."]);
      return;
    }

    try {
      if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(shareUrl);
      setMessages(["Share link copied."]);
    } catch {
      setMessages([`Share link: ${shareUrl}`]);
    }
  }

  function createShareUrl(): string | null {
    if (typeof window === "undefined") {
      return null;
    }

    const puzzleGrid = phase === "solving" ? gridRef.current.map((value, index) => (givenMask[index] ? value : null)) : gridRef.current;
    if (countFilledCells(puzzleGrid) === 0 || !validateSudokuGrid(puzzleGrid).valid) {
      return null;
    }

    const url = new URL(window.location.href);
    url.searchParams.set("p", encodePuzzleParam(puzzleGrid));
    url.hash = "";
    return url.toString();
  }

  function moveSelectionBy(direction: NavDirection, extend = false) {
    // After the selection was cleared, an arrow key re-enters the board at the
    // top-left rather than staying nowhere.
    const next = selectedIndex < 0 ? 0 : moveSelection(selectedIndex, direction);
    setSelectedIndex(next);
    if (extend) {
      setSelectedIndexes((current) => (current.includes(next) ? current : [...current, next]));
    } else {
      setSelectedIndexes([next]);
    }
  }

  function dismissFinish() {
    setFinishDismissed(true);
  }

  function notify(message: string) {
    setMessages([message]);
  }

  return {
    // board state
    grid,
    marks,
    givenMask,
    phase,
    isSolving,
    selectedIndex,
    selectedIndexes,
    selectedIndexSet,
    selectedCell,
    selectedIsGiven,
    selectionAllGiven,
    selectionAllFilled,
    selectedNotes,
    filledCount,
    digitCounts,
    lowConfidence,
    // hint state
    currentHint,
    history,
    hintPreview,
    canApplyCurrentHint,
    primaryIndexes,
    relatedIndexes,
    eliminationIndexes,
    // derived board highlights
    validation,
    conflictIndexes,
    incorrectIndexes,
    matchingHighlights,
    activeHighlightDigit,
    peerHighlightIndexes,
    // session state
    isSolved,
    showFinishDialog,
    finishStats,
    paused,
    elapsedSeconds,
    // ui state
    statusMessages,
    busyLabel,
    entryMode,
    noteType,
    hasAnyNotes,
    quickFillMode,
    quickFillDigit,
    puzzleText,
    generatedLevel,
    undoStack,
    redoStack,
    settings,
    setSetting,
    canSharePuzzle,
    // actions
    pressDigit,
    clickCell,
    rightClickCell,
    beginCellSelection,
    dragCellSelection,
    endCellSelection,
    clearSelection,
    placeQuickFillAt,
    placeQuickFillOnSelection,
    moveSelectionBy,
    undo,
    redo,
    togglePause,
    check,
    hint,
    applyHint,
    startSolving,
    toggleQuickFillMode,
    changeEntryMode,
    toggleNoteMode,
    toggleAllNotes,
    loadPuzzleFromText,
    generatePuzzle,
    loadSample,
    reset,
    importImageFile,
    copyShareLink,
    dismissFinish,
    notify,
    setPuzzleText,
    setGeneratedLevel
  };
}

function entryModeMessage(mode: EntryMode): string {
  if (mode === "corner") {
    return "Corner notes: digits mark the corners of selected empty cells.";
  }
  if (mode === "center") {
    return "Center notes: digits collect in the middle of selected empty cells.";
  }
  if (mode === "color") {
    return "Color mode: digits paint the selected cells. Press again to clear.";
  }
  return "Normal mode: digits fill the selected cells.";
}

function isNoteEntryMode(mode: EntryMode): mode is NoteEntryMode {
  return mode === "corner" || mode === "center";
}
