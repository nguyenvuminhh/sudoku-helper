"use client";

import { useEffect, useMemo, useState } from "react";

import {
  requestGeneratedPuzzle,
  recognizeImage,
  requestHint,
  type HintResponse
} from "../lib/api";
import { SAMPLE_PUZZLE, type GeneratedLevel, type TutorPhase } from "../lib/constants";
import {
  checkResultMessage,
  collectConflictIndexes,
  collectHintCells,
  collectHintPreview,
  generatedPuzzleMessage,
  type HintPreview
} from "../lib/hints";
import { parseSavedSession, serializeSession, SESSION_STORAGE_KEY } from "../lib/session";
import { formatElapsedSeconds } from "../lib/time";
import {
  applyHintEliminationsToNotes,
  applyOcrCells,
  cellToIndex,
  checkPuzzle,
  collectMatchingDigitHighlights,
  countFilledCells,
  createBoardSnapshot,
  createEmptyNotes,
  createEmptyGrid,
  createGivenMask,
  findNextCellWithValue,
  findNextInputIndex,
  gridsEqual,
  indexToCell,
  moveSelection,
  notesEqual,
  numberListsEqual,
  parsePuzzleText,
  peerIndexes,
  quickFillNotes,
  removeAllNotes,
  restoreUndoSnapshot,
  setCellValue,
  setCellValueWithNotes,
  toggleCellNote,
  validateSudokuGrid,
  pushUndoSnapshot,
  type BoardSnapshot,
  type CheckResult,
  type GivenMask,
  type NavDirection,
  type NotesGrid,
  type SudokuGrid
} from "../lib/sudoku-state";

export type SudokuGame = ReturnType<typeof useSudokuGame>;

export function useSudokuGame() {
  const [grid, setGrid] = useState<SudokuGrid>(() => createEmptyGrid());
  const [notes, setNotes] = useState<NotesGrid>(() => createEmptyNotes());
  const [givenMask, setGivenMask] = useState<GivenMask>(() => createGivenMask(createEmptyGrid()));
  const [phase, setPhase] = useState<TutorPhase>("loading");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [currentHint, setCurrentHint] = useState<HintResponse | null>(null);
  const [history, setHistory] = useState<HintResponse[]>([]);
  const [undoStack, setUndoStack] = useState<BoardSnapshot[]>([]);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [lowConfidence, setLowConfidence] = useState<number[]>([]);
  const [messages, setMessages] = useState<string[]>([
    "Enter a puzzle on the board or upload a clean Sudoku screenshot."
  ]);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [quickFillMode, setQuickFillMode] = useState(false);
  const [quickFillDigit, setQuickFillDigit] = useState<number | null>(null);
  const [puzzleText, setPuzzleText] = useState("");
  const [generatedLevel, setGeneratedLevel] = useState<GeneratedLevel>("easy");
  const [redoStack, setRedoStack] = useState<BoardSnapshot[]>([]);
  const [paused, setPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [solvedAnnounced, setSolvedAnnounced] = useState(false);

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
  const puzzleTextLength = useMemo(() => puzzleText.replace(/[^0-9.]/g, "").length, [puzzleText]);
  const selectedCell = indexToCell(selectedIndex);
  const isSolving = phase === "solving";
  const selectedIsGiven = isSolving && givenMask[selectedIndex];
  const selectedNotes = notes[selectedIndex] ?? [];
  const activeHighlightDigit = quickFillDigit ?? grid[selectedIndex];
  const validation = useMemo(() => validateSudokuGrid(grid), [grid]);
  const statusMessages = validation.valid ? messages : ["Fix the highlighted conflicts before requesting a hint."];
  const conflictIndexes = useMemo(() => collectConflictIndexes(validation.conflicts), [validation]);
  const incorrectIndexes = useMemo(() => new Set(checkResult?.incorrectIndexes ?? []), [checkResult]);
  const matchingHighlights = useMemo(() => {
    const highlights = collectMatchingDigitHighlights(grid, notes, activeHighlightDigit);
    return {
      noteIndexes: new Set(highlights.noteIndexes),
      valueIndexes: new Set(highlights.valueIndexes)
    };
  }, [activeHighlightDigit, grid, notes]);
  const primaryIndexes = useMemo(() => collectHintCells(currentHint, "primary"), [currentHint]);
  const relatedIndexes = useMemo(() => collectHintCells(currentHint, "related"), [currentHint]);
  const eliminationIndexes = useMemo(() => collectHintCells(currentHint, "elimination"), [currentHint]);
  const hintPreview: HintPreview | null = useMemo(() => collectHintPreview(currentHint, grid), [currentHint, grid]);
  const canApplyCurrentHint =
    !busyLabel &&
    (Boolean(hintPreview) || Boolean(currentHint?.action.type === "eliminate" && currentHint.action.eliminations.length > 0));
  const isSolved = isSolving && filledCount === 81 && validation.valid;
  const peerHighlightIndexes = useMemo(() => new Set(peerIndexes(selectedIndex)), [selectedIndex]);

  // Restore a saved session once on mount so a refresh never loses the game.
  useEffect(() => {
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
    setNotes(saved.notes);
    setGivenMask(saved.givenMask);
    setPhase(saved.phase);
    setSelectedIndex(saved.selectedIndex);
    setLowConfidence(saved.lowConfidence);
    setElapsedSeconds(saved.elapsedSeconds);
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
        serializeSession({ grid, notes, givenMask, phase, selectedIndex, lowConfidence, elapsedSeconds })
      );
    } catch {
      // Storage may be unavailable (private mode, quota); play without saving.
    }
  }, [grid, notes, givenMask, phase, selectedIndex, lowConfidence, elapsedSeconds]);

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
    }
  }, [isSolved, solvedAnnounced, elapsedSeconds]);

  function recordUndoSnapshot() {
    setUndoStack((items) => pushUndoSnapshot(items, createBoardSnapshot(grid, notes, selectedIndex, lowConfidence)));
    setRedoStack([]);
  }

  function undo() {
    const restored = restoreUndoSnapshot(undoStack);
    if (!restored.snapshot) {
      return;
    }

    setRedoStack((items) => pushUndoSnapshot(items, createBoardSnapshot(grid, notes, selectedIndex, lowConfidence)));
    setGrid(restored.snapshot.grid);
    setNotes(restored.snapshot.notes);
    setSelectedIndex(restored.snapshot.selectedIndex);
    setLowConfidence(restored.snapshot.lowConfidence);
    setUndoStack(restored.stack);
    setCurrentHint(null);
    setCheckResult(null);
    setMessages(["Undid the last board change."]);
  }

  function redo() {
    const restored = restoreUndoSnapshot(redoStack);
    if (!restored.snapshot) {
      return;
    }

    setUndoStack((items) => pushUndoSnapshot(items, createBoardSnapshot(grid, notes, selectedIndex, lowConfidence)));
    setGrid(restored.snapshot.grid);
    setNotes(restored.snapshot.notes);
    setSelectedIndex(restored.snapshot.selectedIndex);
    setLowConfidence(restored.snapshot.lowConfidence);
    setRedoStack(restored.stack);
    setCurrentHint(null);
    setCheckResult(null);
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
    setMessages([checkResultMessage(result)]);
  }

  function hasBoardStateChanged(nextGrid: SudokuGrid, nextNotes: NotesGrid, nextLowConfidence = lowConfidence): boolean {
    return !gridsEqual(grid, nextGrid) || !notesEqual(notes, nextNotes) || !numberListsEqual(lowConfidence, nextLowConfidence);
  }

  function updateGrid(nextGrid: SudokuGrid, nextNotes = notes) {
    setGrid(nextGrid);
    setNotes(nextNotes);
    setCurrentHint(null);
    setCheckResult(null);
  }

  function pressDigit(value: number | null) {
    if (paused) {
      return;
    }
    if (quickFillMode) {
      if (value === null) {
        setQuickFillDigit(null);
        setMessages(["Quick fill digit cleared."]);
        return;
      }

      // Re-pressing the active digit fills the selected cell when it does not
      // already hold that number; the first press only locks the digit.
      if (value === quickFillDigit && grid[selectedIndex] !== value) {
        placeQuickFillAt(selectedIndex);
        return;
      }

      setQuickFillDigit(value);
      const matchingCell = findNextCellWithValue(grid, value, selectedIndex);
      if (matchingCell !== null) {
        setSelectedIndex(matchingCell);
      }
      setMessages([
        editingNotes
          ? `Quick fill locked to ${value}. Press ${value} or Enter on an empty cell to add that note.`
          : `Quick fill locked to ${value}. Press ${value} or Enter on a cell to fill it.`
      ]);
      return;
    }

    if (editingNotes && value !== null) {
      toggleNote(value);
      return;
    }

    if (editingNotes && value === null) {
      clearSelectedNotes();
      return;
    }

    applyCellValue(value, true);
  }

  function clickCell(index: number) {
    if (paused) {
      return;
    }
    setSelectedIndex(index);
    if (!quickFillMode || quickFillDigit === null) {
      return;
    }

    placeQuickFillAt(index);
  }

  function placeQuickFillAt(index: number) {
    if (quickFillDigit === null) {
      return;
    }

    if (editingNotes) {
      if (grid[index] !== null) {
        setMessages(["Notes can only be edited on empty cells."]);
        return;
      }

      const nextNotes = toggleCellNote(notes, grid, index, quickFillDigit);
      if (hasBoardStateChanged(grid, nextNotes)) {
        recordUndoSnapshot();
      }
      setNotes(nextNotes);
      setCurrentHint(null);
      return;
    }

    applyCellValueAt(index, quickFillDigit, false);
  }

  function toggleNote(digit: number) {
    if (!isSolving) {
      setMessages(["Start solving before editing notes."]);
      return;
    }
    if (grid[selectedIndex] !== null) {
      setMessages(["Notes can only be edited on empty cells."]);
      return;
    }

    const nextNotes = toggleCellNote(notes, grid, selectedIndex, digit);
    if (hasBoardStateChanged(grid, nextNotes)) {
      recordUndoSnapshot();
    }
    setNotes(nextNotes);
    setCurrentHint(null);
  }

  function clearSelectedNotes() {
    if (!isSolving) {
      return;
    }

    const nextNotes = notes.map((cellNotes, index) => (index === selectedIndex ? [] : cellNotes));
    if (hasBoardStateChanged(grid, nextNotes)) {
      recordUndoSnapshot();
    }
    setNotes(nextNotes);
    setCurrentHint(null);
  }

  function applyCellValue(value: number | null, shouldAdvance: boolean) {
    applyCellValueAt(selectedIndex, value, shouldAdvance);
  }

  function applyCellValueAt(index: number, value: number | null, shouldAdvance: boolean) {
    if (!canEditCellValue(index)) {
      setMessages(["Loaded cells are locked during solving."]);
      return;
    }

    const result = isSolving
      ? setCellValueWithNotes(grid, notes, index, value)
      : { grid: setCellValue(grid, index, value), notes };
    const nextLowConfidence = lowConfidence.filter((lowConfidenceIndex) => lowConfidenceIndex !== index);
    if (isSolving && hasBoardStateChanged(result.grid, result.notes, nextLowConfidence)) {
      recordUndoSnapshot();
    }
    updateGrid(result.grid, result.notes);
    setLowConfidence(nextLowConfidence);
    if (shouldAdvance && value !== null) {
      setSelectedIndex(findNextInputIndex(result.grid, index));
    }
  }

  function applyHint() {
    if (!currentHint) {
      return;
    }

    if (hintPreview) {
      const cell = indexToCell(hintPreview.index);
      const result = setCellValueWithNotes(grid, notes, hintPreview.index, hintPreview.digit);
      const nextLowConfidence = lowConfidence.filter((index) => index !== hintPreview.index);
      if (hasBoardStateChanged(result.grid, result.notes, nextLowConfidence)) {
        recordUndoSnapshot();
      }
      updateGrid(result.grid, result.notes);
      setSelectedIndex(hintPreview.index);
      setLowConfidence(nextLowConfidence);
      setMessages([`Applied ${hintPreview.digit} at R${cell.row}C${cell.col}. Request another hint when you are ready.`]);
      return;
    }

    if (currentHint.action.type === "eliminate" && currentHint.action.eliminations.length > 0) {
      const nextNotes = applyHintEliminationsToNotes(grid, notes, currentHint.action.eliminations);
      const firstCell = currentHint.action.eliminations[0].cell;
      if (hasBoardStateChanged(grid, nextNotes)) {
        recordUndoSnapshot();
      }
      updateGrid(grid, nextNotes);
      setSelectedIndex(cellToIndex(firstCell));
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
      const nextHint = await requestHint(grid, notes);
      setCurrentHint(nextHint);
      setHistory((items) => [nextHint, ...items].slice(0, 8));
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
    setNotes(createEmptyNotes());
    setEditingNotes(false);
    setQuickFillMode(true);
    setQuickFillDigit(null);
    setCurrentHint(null);
    setUndoStack([]);
    setRedoStack([]);
    setCheckResult(null);
    setPaused(false);
    setElapsedSeconds(0);
    setSolvedAnnounced(false);
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
        ? editingNotes
          ? "Quick fill enabled for notes. Select a digit, then click empty cells to add or remove that note."
          : "Quick fill enabled. Select a digit, then click editable cells to fill it."
        : "Quick fill mode disabled."
    ]);
  }

  function toggleNotesMode() {
    if (!isSolving) {
      return;
    }

    const nextEditingNotes = !editingNotes;
    setEditingNotes(nextEditingNotes);
    setMessages([
      nextEditingNotes && quickFillMode
        ? "Notes and quick fill are both on. Click empty cells to add or remove the locked note."
        : nextEditingNotes
          ? "Notes enabled. Select an empty cell, then choose digits to add or remove notes."
          : quickFillMode
            ? "Notes disabled. Quick fill will place values in editable cells."
            : "Notes disabled."
    ]);
  }

  function fillAllNotes() {
    if (!isSolving) {
      setMessages(["Start solving before filling notes."]);
      return;
    }

    const nextNotes = quickFillNotes(grid);
    if (hasBoardStateChanged(grid, nextNotes)) {
      recordUndoSnapshot();
    }
    setNotes(nextNotes);
    setCurrentHint(null);
    setMessages(["Filled notes for all empty cells from the current board."]);
  }

  function clearAllNotes() {
    const nextNotes = removeAllNotes(notes);
    if (hasBoardStateChanged(grid, nextNotes)) {
      recordUndoSnapshot();
    }
    setNotes(nextNotes);
    setCurrentHint(null);
    setMessages(["Removed all notes."]);
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
    setNotes(createEmptyNotes());
    setGivenMask(createGivenMask(createEmptyGrid()));
    setPhase("loading");
    setEditingNotes(false);
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

  function moveSelectionBy(direction: NavDirection) {
    setSelectedIndex((index) => moveSelection(index, direction));
  }

  function notify(message: string) {
    setMessages([message]);
  }

  return {
    // board state
    grid,
    notes,
    givenMask,
    phase,
    isSolving,
    selectedIndex,
    selectedCell,
    selectedIsGiven,
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
    paused,
    elapsedSeconds,
    // ui state
    statusMessages,
    busyLabel,
    editingNotes,
    quickFillMode,
    quickFillDigit,
    puzzleText,
    generatedLevel,
    undoStack,
    redoStack,
    // actions
    pressDigit,
    clickCell,
    placeQuickFillAt,
    moveSelectionBy,
    undo,
    redo,
    togglePause,
    check,
    hint,
    applyHint,
    startSolving,
    toggleQuickFillMode,
    toggleNotesMode,
    fillAllNotes,
    clearAllNotes,
    loadPuzzleFromText,
    generatePuzzle,
    loadSample,
    reset,
    importImageFile,
    notify,
    setPuzzleText,
    setGeneratedLevel
  };
}
