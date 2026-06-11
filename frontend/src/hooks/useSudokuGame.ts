"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  requestGeneratedPuzzle,
  recognizeImage,
  requestHint,
  type HintResponse
} from "../lib/api";
import { SAMPLE_PUZZLE, ENTRY_MODES, type EntryMode, type GeneratedLevel, type TutorPhase } from "../lib/constants";
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
  cloneMarks,
  collectMatchingDigitHighlights,
  countFilledCells,
  createBoardSnapshot,
  createEmptyGrid,
  createEmptyMarks,
  createGivenMask,
  findNextCellWithValue,
  findNextInputIndex,
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
  const activeHighlightDigit = quickFillDigit ?? grid[selectedIndex];
  const validation = useMemo(() => validateSudokuGrid(grid), [grid]);
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
  const peerHighlightIndexes = useMemo(() => new Set(peerIndexes(selectedIndex)), [selectedIndex]);
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

  // End a drag selection wherever the pointer is released.
  useEffect(() => {
    function handlePointerUp() {
      draggingRef.current = false;
    }
    window.addEventListener("pointerup", handlePointerUp);
    return () => window.removeEventListener("pointerup", handlePointerUp);
  }, []);

  function selectOnly(index: number) {
    setSelectedIndex(index);
    setSelectedIndexes([index]);
  }

  function beginCellSelection(index: number, additive: boolean) {
    if (paused) {
      return;
    }
    draggingRef.current = true;
    dragMovedRef.current = false;
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
      setSelectedIndexes([index]);
    }
  }

  function dragCellSelection(index: number) {
    if (paused || !draggingRef.current) {
      return;
    }
    dragMovedRef.current = true;
    setSelectedIndex(index);
    setSelectedIndexes((current) => (current.includes(index) ? current : [...current, index]));
  }

  function recordUndoSnapshot() {
    setUndoStack((items) => pushUndoSnapshot(items, createBoardSnapshot(grid, marks, selectedIndex, lowConfidence)));
    setRedoStack([]);
  }

  function restoreSnapshot(snapshot: BoardSnapshot) {
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

    setRedoStack((items) => pushUndoSnapshot(items, createBoardSnapshot(grid, marks, selectedIndex, lowConfidence)));
    restoreSnapshot(restored.snapshot);
    setUndoStack(restored.stack);
    setMessages(["Undid the last board change."]);
  }

  function redo() {
    const restored = restoreUndoSnapshot(redoStack);
    if (!restored.snapshot) {
      return;
    }

    setUndoStack((items) => pushUndoSnapshot(items, createBoardSnapshot(grid, marks, selectedIndex, lowConfidence)));
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

  function hasBoardStateChanged(nextGrid: SudokuGrid, nextMarks: BoardMarks, nextLowConfidence = lowConfidence): boolean {
    return !gridsEqual(grid, nextGrid) || !marksEqual(marks, nextMarks) || !numberListsEqual(lowConfidence, nextLowConfidence);
  }

  function updateGrid(nextGrid: SudokuGrid, nextMarks = marks) {
    setGrid(nextGrid);
    setMarks(nextMarks);
    setCurrentHint(null);
    setCheckResult(null);
  }

  /** Records an undo snapshot and applies a marks-only change. */
  function commitMarks(nextMarks: BoardMarks) {
    if (hasBoardStateChanged(grid, nextMarks)) {
      recordUndoSnapshot();
    }
    setMarks(nextMarks);
    setCurrentHint(null);
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

  function clickCell(index: number, additive = false) {
    if (paused) {
      return;
    }
    // Selection is handled on pointer down; a click only places the locked
    // quick fill digit, and never during additive or drag selection.
    if (additive || dragMovedRef.current) {
      dragMovedRef.current = false;
      return;
    }
    if (!quickFillMode || quickFillDigit === null) {
      return;
    }

    placeQuickFillAt(index);
  }

  function placeQuickFillAt(index: number) {
    if (quickFillDigit === null) {
      return;
    }

    if (entryMode === "corner" || entryMode === "center") {
      if (grid[index] !== null) {
        setMessages(["Notes can only be edited on empty cells."]);
        return;
      }
      commitMarks({ ...marks, [entryMode]: toggleCellNote(marks[entryMode], grid, index, quickFillDigit) });
      return;
    }

    if (entryMode === "color") {
      commitMarks({ ...marks, colors: toggleColorOnCells(marks.colors, [index], quickFillDigit) });
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

    const targets = selectedIndexes.filter((index) => grid[index] !== quickFillDigit);
    if (targets.length > 0) {
      applyValueToCells(targets, quickFillDigit, false);
      return;
    }
    // Nothing to fill: keep the old behavior of cycling to the next cell that
    // already holds the locked digit.
    if (selectedIndexes.length === 1) {
      const matchingCell = findNextCellWithValue(grid, quickFillDigit, selectedIndex);
      if (matchingCell !== null) {
        selectOnly(matchingCell);
      }
    }
  }

  function toggleNoteOnSelection(digit: number) {
    if (!isSolving) {
      setMessages(["Start solving before editing notes."]);
      return;
    }
    const layer = entryMode === "corner" ? "corner" : "center";
    const emptyTargets = selectedIndexes.filter((index) => grid[index] === null);
    if (emptyTargets.length === 0) {
      setMessages(["Notes can only be edited on empty cells."]);
      return;
    }

    commitMarks({ ...marks, [layer]: toggleNoteOnCells(marks[layer], grid, emptyTargets, digit) });
  }

  function applyColorToSelection(color: number | null) {
    if (!isSolving) {
      setMessages(["Start solving before highlighting cells."]);
      return;
    }

    commitMarks({ ...marks, colors: toggleColorOnCells(marks.colors, selectedIndexes, color) });
  }

  function clearSelectedNotes() {
    if (!isSolving) {
      return;
    }

    const layer = entryMode === "corner" ? "corner" : "center";
    const nextLayer = marks[layer].map((cellNotes, index) => (selectedIndexes.includes(index) ? [] : cellNotes));
    commitMarks({ ...marks, [layer]: nextLayer });
  }

  function applyValueToCells(indexes: number[], value: number | null, shouldAdvance: boolean) {
    const editable = indexes.filter((index) => canEditCellValue(index));
    if (editable.length === 0) {
      setMessages(["Loaded cells are locked during solving."]);
      return;
    }

    let nextGrid = grid;
    let nextMarks = marks;
    for (const index of editable) {
      if (isSolving) {
        const result = setCellValueWithMarks(nextGrid, nextMarks, index, value);
        nextGrid = result.grid;
        nextMarks = result.marks;
      } else {
        nextGrid = setCellValue(nextGrid, index, value);
      }
    }

    const nextLowConfidence = lowConfidence.filter((index) => !editable.includes(index));
    if (isSolving && hasBoardStateChanged(nextGrid, nextMarks, nextLowConfidence)) {
      recordUndoSnapshot();
    }
    updateGrid(nextGrid, nextMarks);
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
      setMessages([`All ${placedValue}s are placed. Quick fill moved to ${next}.`]);
    }
  }

  function applyHint() {
    if (!currentHint) {
      return;
    }

    if (hintPreview) {
      const cell = indexToCell(hintPreview.index);
      const result = setCellValueWithMarks(grid, marks, hintPreview.index, hintPreview.digit);
      const nextLowConfidence = lowConfidence.filter((index) => index !== hintPreview.index);
      if (hasBoardStateChanged(result.grid, result.marks, nextLowConfidence)) {
        recordUndoSnapshot();
      }
      updateGrid(result.grid, result.marks);
      selectOnly(hintPreview.index);
      setLowConfidence(nextLowConfidence);
      setMessages([`Applied ${hintPreview.digit} at R${cell.row}C${cell.col}. Request another hint when you are ready.`]);
      maybeAdvanceQuickFillDigit(result.grid, hintPreview.digit);
      return;
    }

    if (currentHint.action.type === "eliminate" && currentHint.action.eliminations.length > 0) {
      const nextMarks = {
        ...marks,
        center: applyHintEliminationsToNotes(grid, marks.center, currentHint.action.eliminations),
        corner: pruneEliminationsFromNotes(marks.corner, currentHint.action.eliminations)
      };
      const firstCell = currentHint.action.eliminations[0].cell;
      if (hasBoardStateChanged(grid, nextMarks)) {
        recordUndoSnapshot();
      }
      updateGrid(grid, nextMarks);
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
    setMessages([entryModeMessage(mode)]);
  }

  function cycleEntryMode() {
    if (!isSolving) {
      return;
    }
    const order = ENTRY_MODES.map((mode) => mode.id);
    const next = order[(order.indexOf(entryMode) + 1) % order.length];
    setEntryMode(next);
    setMessages([entryModeMessage(next)]);
  }

  function fillAllNotes() {
    if (!isSolving) {
      setMessages(["Start solving before filling notes."]);
      return;
    }

    commitMarks({ ...marks, center: quickFillNotes(grid) });
    setMessages(["Filled center notes for all empty cells from the current board."]);
  }

  function clearAllNotes() {
    commitMarks({ ...marks, corner: marks.corner.map(() => []), center: marks.center.map(() => []) });
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

  function moveSelectionBy(direction: NavDirection, extend = false) {
    const next = moveSelection(selectedIndex, direction);
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
    quickFillMode,
    quickFillDigit,
    puzzleText,
    generatedLevel,
    undoStack,
    redoStack,
    settings,
    setSetting,
    // actions
    pressDigit,
    clickCell,
    beginCellSelection,
    dragCellSelection,
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
    cycleEntryMode,
    fillAllNotes,
    clearAllNotes,
    loadPuzzleFromText,
    generatePuzzle,
    loadSample,
    reset,
    importImageFile,
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
