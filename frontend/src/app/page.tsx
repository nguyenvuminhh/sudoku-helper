"use client";

import {
  AlertTriangle,
  Brain,
  Check,
  Crosshair,
  Eraser,
  Grid3X3,
  History,
  ImageUp,
  Keyboard,
  Lightbulb,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Undo2
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  requestGeneratedPuzzle,
  recognizeImage,
  requestHint,
  type GeneratedPuzzleResponse,
  type HintResponse
} from "../lib/api";
import {
  applyHintEliminationsToNotes,
  applyOcrCells,
  cellToIndex,
  collectMatchingDigitHighlights,
  countFilledCells,
  createBoardSnapshot,
  createEmptyNotes,
  createEmptyGrid,
  createGivenMask,
  findNextInputIndex,
  indexToCell,
  parsePuzzleText,
  quickFillNotes,
  removeAllNotes,
  resolveKeyboardInput,
  restoreUndoSnapshot,
  setCellValue,
  setCellValueWithNotes,
  toggleCellNote,
  validateSudokuGrid,
  pushUndoSnapshot,
  type BoardSnapshot,
  type GivenMask,
  type NotesGrid,
  type SudokuGrid,
  type ValidationConflict
} from "../lib/sudoku-state";

const SAMPLE_PUZZLE =
  "000694832" +
  "004357196" +
  "090002745" +
  "070035004" +
  "040008600" +
  "031046000" +
  "400000078" +
  "000000420" +
  "900400560";

type TutorPhase = "loading" | "solving";
type GeneratedLevel = "easy" | "medium" | "hard" | "expert" | "master";

const GENERATED_LEVELS: Array<{ id: GeneratedLevel; label: string }> = [
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
  { id: "expert", label: "Expert" },
  { id: "master", label: "Master" }
];

export default function SudokuTutorPage() {
  const [grid, setGrid] = useState<SudokuGrid>(() => createEmptyGrid());
  const [notes, setNotes] = useState<NotesGrid>(() => createEmptyNotes());
  const [givenMask, setGivenMask] = useState<GivenMask>(() => createGivenMask(createEmptyGrid()));
  const [phase, setPhase] = useState<TutorPhase>("loading");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [currentHint, setCurrentHint] = useState<HintResponse | null>(null);
  const [history, setHistory] = useState<HintResponse[]>([]);
  const [undoStack, setUndoStack] = useState<BoardSnapshot[]>([]);
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filledCount = countFilledCells(grid);
  const puzzleTextLength = useMemo(() => puzzleText.replace(/[^0-9.]/g, "").length, [puzzleText]);
  const selectedCell = indexToCell(selectedIndex);
  const isSolving = phase === "solving";
  const selectedIsGiven = isSolving && givenMask[selectedIndex];
  const selectedNotes = notes[selectedIndex] ?? [];
  const activeHighlightDigit = quickFillDigit ?? grid[selectedIndex];
  const validation = useMemo(() => validateSudokuGrid(grid), [grid]);
  const statusMessages = validation.valid ? messages : ["Fix the highlighted conflicts before requesting a hint."];
  const conflictIndexes = useMemo(() => collectConflictIndexes(validation.conflicts), [validation]);
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
  const hintPreview = useMemo(() => collectHintPreview(currentHint, grid), [currentHint, grid]);
  const canApplyCurrentHint =
    !busyLabel &&
    (Boolean(hintPreview) || Boolean(currentHint?.action.type === "eliminate" && currentHint.action.eliminations.length > 0));

  useEffect(() => {
    function handleWindowKeyDown(event: globalThis.KeyboardEvent) {
      if (isEditableTarget(event.target)) {
        return;
      }

      // Ctrl/Cmd+Z undoes the last board change.
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        handleUndo();
        return;
      }

      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      // Tab toggles pencil (notes) mode while solving.
      if (event.key === "Tab") {
        if (isSolving) {
          event.preventDefault();
          handleToggleEditingNotes();
        }
        return;
      }

      const value = resolveKeyboardInput(event.key);
      if (value === "ignored") {
        return;
      }

      event.preventDefault();
      applyKeyboardValue(value);
    }

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [editingNotes, givenMask, grid, lowConfidence, notes, phase, quickFillDigit, quickFillMode, selectedIndex, undoStack]);

  function recordUndoSnapshot() {
    setUndoStack((items) => pushUndoSnapshot(items, createBoardSnapshot(grid, notes, selectedIndex, lowConfidence)));
  }

  function handleUndo() {
    const restored = restoreUndoSnapshot(undoStack);
    if (!restored.snapshot) {
      return;
    }

    setGrid(restored.snapshot.grid);
    setNotes(restored.snapshot.notes);
    setSelectedIndex(restored.snapshot.selectedIndex);
    setLowConfidence(restored.snapshot.lowConfidence);
    setUndoStack(restored.stack);
    setCurrentHint(null);
    setMessages(["Undid the last board change."]);
  }

  function hasBoardStateChanged(nextGrid: SudokuGrid, nextNotes: NotesGrid, nextLowConfidence = lowConfidence): boolean {
    return !sameGrid(grid, nextGrid) || !sameNotes(notes, nextNotes) || !sameNumberList(lowConfidence, nextLowConfidence);
  }

  function updateGrid(nextGrid: SudokuGrid, nextNotes = notes) {
    setGrid(nextGrid);
    setNotes(nextNotes);
    setCurrentHint(null);
  }

  function handleDigit(value: number | null) {
    if (quickFillMode) {
      if (value === null) {
        setQuickFillDigit(null);
        setMessages(["Quick fill digit cleared."]);
        return;
      }

      setQuickFillDigit(value);
      setMessages([
        editingNotes
          ? `Quick fill locked to ${value}. Click empty cells to add or remove that note.`
          : `Quick fill locked to ${value}. Click editable cells to fill it.`
      ]);
      return;
    }

    if (editingNotes && value !== null) {
      handleToggleNote(value);
      return;
    }

    if (editingNotes && value === null) {
      clearSelectedNotes();
      return;
    }

    applyCellValue(value, true);
  }

  function handleCellClick(index: number) {
    setSelectedIndex(index);
    if (!quickFillMode || quickFillDigit === null) {
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

  function handleToggleNote(digit: number) {
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

  function handleApplyHint() {
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

  function applyKeyboardValue(value: number | null) {
    handleDigit(value);
  }

  async function handleHint() {
    if (!isSolving) {
      setMessages(["Start solving before requesting a hint."]);
      return;
    }

    setBusyLabel("Finding hint");
    try {
      const hint = await requestHint(grid, notes);
      setCurrentHint(hint);
      setHistory((items) => [hint, ...items].slice(0, 8));
      setMessages(["Hint found. Review the conclusion, then expand through the evidence."]);
    } catch (error) {
      setMessages([error instanceof Error ? error.message : "Hint generation failed."]);
    } finally {
      setBusyLabel(null);
    }
  }

  function handleStartSolving() {
    if (filledCount === 0 || !validation.valid) {
      return;
    }

    setPhase("solving");
    setGivenMask(createGivenMask(grid));
    setNotes(createEmptyNotes());
    setEditingNotes(false);
    setQuickFillMode(false);
    setQuickFillDigit(null);
    setCurrentHint(null);
    setUndoStack([]);
    setMessages(["Solving phase started. Loaded cells are locked; use notes and hints to work the puzzle."]);
  }

  function handleQuickFillMode() {
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

  function handleToggleEditingNotes() {
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

  function handleQuickFillNotes() {
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

  function handleRemoveAllNotes() {
    const nextNotes = removeAllNotes(notes);
    if (hasBoardStateChanged(grid, nextNotes)) {
      recordUndoSnapshot();
    }
    setNotes(nextNotes);
    setCurrentHint(null);
    setMessages(["Removed all notes."]);
  }

  function handleLoadPuzzleText() {
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

  async function handleGeneratePuzzle() {
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
    setMessages(nextMessages);
  }

  function canEditCellValue(index: number): boolean {
    return phase === "loading" || !givenMask[index];
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

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
      event.target.value = "";
    }
  }

  function loadSample() {
    loadPuzzle(parsePuzzleText(SAMPLE_PUZZLE), ["Loaded a sample puzzle. Review it, then start solving to lock the givens."]);
    setLowConfidence([]);
  }

  function resetPuzzle() {
    loadPuzzle(createEmptyGrid(), ["Workspace cleared. Start with board entry or image upload."]);
    setLowConfidence([]);
  }

  return (
    <main className="workspace">
      <section className="topbar" aria-label="Sudoku tutor header">
        <div>
          <p className="eyebrow">Puzzle Hint</p>
          <h1>Sudoku strategy desk</h1>
        </div>
      </section>

      <section className="content-grid">
        <section className="board-zone" aria-label="Sudoku board">
          <div className="board-header">
            <div>
              <p className="eyebrow">Board</p>
              <h2>
                R{selectedCell.row}C{selectedCell.col}
              </h2>
            </div>
            <div className="meter" aria-label={`${filledCount} filled cells`}>
              <span style={{ width: `${(filledCount / 81) * 100}%` }} />
            </div>
          </div>

          <div className="sudoku-board" role="grid" aria-label="Sudoku grid">
            {grid.map((value, index) => {
              const row = Math.floor(index / 9);
              const col = index % 9;
              const noteValues = notes[index] ?? [];
              const isGiven = isSolving && givenMask[index];
              const shouldShowHintPreview = hintPreview?.index === index;
              const classes = [
                "sudoku-cell",
                selectedIndex === index ? "selected" : "",
                isGiven ? "locked-given" : "",
                editingNotes && selectedIndex === index ? "note-target" : "",
                matchingHighlights.valueIndexes.has(index) ? "same-digit-cell" : "",
                matchingHighlights.noteIndexes.has(index) ? "same-digit-note-cell" : "",
                conflictIndexes.has(index) ? "conflict" : "",
                lowConfidence.includes(index) ? "low-confidence" : "",
                primaryIndexes.has(index) ? "hint-primary" : "",
                relatedIndexes.has(index) ? "hint-related" : "",
                eliminationIndexes.has(index) ? "hint-elimination" : "",
                shouldShowHintPreview ? "hint-preview" : ""
              ]
                .filter(Boolean)
                .join(" ");
              const ariaDetails = [
                value ? `${value}${isGiven ? ", loaded clue" : ""}` : "",
                !value && shouldShowHintPreview ? `suggested ${hintPreview.digit}` : "",
                !value && noteValues.length ? `notes ${noteValues.join(" ")}` : ""
              ].filter(Boolean);
              const ariaValue = ariaDetails.length ? `, ${ariaDetails.join(", ")}` : "";

              return (
                <button
                  className={classes}
                  key={index}
                  type="button"
                  role="gridcell"
                  aria-label={`Row ${row + 1}, column ${col + 1}${ariaValue}`}
                  onClick={() => handleCellClick(index)}
                >
                  {value ? (
                    <strong>{value}</strong>
                  ) : (
                    <>
                      {shouldShowHintPreview ? (
                        <span className="hint-preview-value" aria-hidden="true">
                          {hintPreview.digit}
                        </span>
                      ) : null}
                      {noteValues.length ? <NoteMarks activeDigit={activeHighlightDigit} values={noteValues} /> : null}
                    </>
                  )}
                </button>
              );
            })}
          </div>

          <div className="keypad" aria-label="Digit entry">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
              <button
                className={[
                  editingNotes && selectedNotes.includes(digit) ? "note-active" : "",
                  quickFillDigit === digit ? "quick-fill-active" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={quickFillMode ? !isSolving : editingNotes ? !isSolving || grid[selectedIndex] !== null : selectedIsGiven}
                key={digit}
                type="button"
                onClick={() => handleDigit(digit)}
              >
                {digit}
              </button>
            ))}
            <button type="button" onClick={() => handleDigit(null)} disabled={quickFillMode ? !isSolving : editingNotes ? !isSolving : selectedIsGiven}>
              <Eraser size={16} />
            </button>
          </div>
        </section>

        <aside className="inspector" aria-label="Hint explanation">
          <div className="actions-panel" aria-label="Sudoku controls">
            <div className="controls-header">
              <div className="panel-title">
                <Grid3X3 size={19} />
                <h2>Controls</h2>
              </div>
              <button className="reset-icon-button" type="button" onClick={resetPuzzle} aria-label="Reset puzzle">
                <RotateCcw size={17} />
              </button>
            </div>
            <div className="action-grid">
              {phase === "loading" ? (
                <div className="loading-stack">
                  <div className="puzzle-generator">
                    <label htmlFor="generated-level">Generate puzzle</label>
                    <div className="generator-row">
                      <select
                        id="generated-level"
                        className="level-select"
                        value={generatedLevel}
                        onChange={(event) => setGeneratedLevel(event.target.value as GeneratedLevel)}
                      >
                        {GENERATED_LEVELS.map((level) => (
                          <option key={level.id} value={level.id}>
                            {level.label}
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={handleGeneratePuzzle} disabled={busyLabel === "Generating puzzle"}>
                        {busyLabel === "Generating puzzle" ? <Loader2 className="spin" size={17} /> : <Sparkles size={17} />}
                        Generate
                      </button>
                    </div>
                  </div>
                  <div className="puzzle-loader">
                    <label htmlFor="puzzle-text">81-character puzzle</label>
                    <textarea
                      id="puzzle-text"
                      value={puzzleText}
                      onChange={(event) => setPuzzleText(event.target.value)}
                      placeholder="530070000600195000..."
                      rows={4}
                      aria-describedby="puzzle-text-help puzzle-text-count"
                    />
                    <div className="puzzle-loader-footer">
                      <p id="puzzle-text-help">Fill left to right, top to bottom. Use 0 for empty cells.</p>
                      <span id="puzzle-text-count" aria-label={`${puzzleTextLength} of 81 characters`}>
                        {puzzleTextLength}/81
                      </span>
                    </div>
                    <button type="button" onClick={handleLoadPuzzleText}>
                      Load puzzle
                    </button>
                  </div>
                  <div className="phase-buttons" aria-label="Loading controls">
                    <button type="button" onClick={loadSample}>
                      <Sparkles size={17} />
                      Sample
                    </button>
                    <button type="button" onClick={() => fileInputRef.current?.click()}>
                      <ImageUp size={17} />
                      Upload
                    </button>
                    <button
                      className="primary"
                      type="button"
                      onClick={handleStartSolving}
                      disabled={filledCount === 0 || !validation.valid}
                    >
                      <Check size={17} />
                      Confirm
                    </button>
                  </div>
                </div>
              ) : (
                <div className="control-stack" aria-label="Solving controls">
                  <button
                    type="button"
                    className="undo-action"
                    onClick={handleUndo}
                    disabled={undoStack.length === 0 || Boolean(busyLabel)}
                    aria-label="Undo last board change"
                  >
                    <Undo2 size={17} />
                    Undo
                  </button>
                  <button
                    type="button"
                    className={editingNotes ? "switch-row active" : "switch-row"}
                    onClick={handleToggleEditingNotes}
                    role="switch"
                    aria-checked={editingNotes}
                    aria-label="Notes"
                  >
                    <span className="switch-copy">
                      <Pencil size={17} />
                      Notes
                    </span>
                    <span className="switch-track" aria-hidden="true">
                      <span className="switch-thumb" />
                    </span>
                  </button>
                  <button
                    type="button"
                    className={quickFillMode ? "switch-row active" : "switch-row"}
                    onClick={handleQuickFillMode}
                    role="switch"
                    aria-checked={quickFillMode}
                    aria-label="Quick fill"
                  >
                    <span className="switch-copy">
                      <Crosshair size={17} />
                      Quick fill
                    </span>
                    <span className="switch-track" aria-hidden="true">
                      <span className="switch-thumb" />
                    </span>
                  </button>
                  <div className="note-action-row">
                    <button type="button" onClick={handleQuickFillNotes} disabled={!validation.valid}>
                      <Plus size={17} />
                      Fill all notes
                    </button>
                    <button type="button" onClick={handleRemoveAllNotes}>
                      <Trash2 size={17} />
                      Remove all notes
                    </button>
                  </div>
                  <button
                    className="primary hint-action"
                    type="button"
                    onClick={handleHint}
                    disabled={Boolean(busyLabel) || filledCount === 0 || !validation.valid}
                  >
                    {busyLabel === "Finding hint" ? <Loader2 className="spin" size={17} /> : <Lightbulb size={17} />}
                    Hint
                  </button>
                </div>
              )}
            </div>
            <input ref={fileInputRef} className="hidden-input" type="file" accept="image/*" onChange={handleUpload} />
          </div>

          <div className="status-panel">
            <div className="panel-title">
              <Brain size={19} />
              <h2>Strategy note</h2>
            </div>
            {busyLabel ? (
              <p className="busy">
                <Loader2 className="spin" size={18} />
                {busyLabel}...
              </p>
            ) : null}
            <MessageList messages={statusMessages} />
          </div>

          <HintPanel canApplyHint={canApplyCurrentHint} hint={currentHint} onApplyHint={handleApplyHint} />

          <div className="history-panel">
            <div className="panel-title">
              <History size={18} />
              <h2>Hint history</h2>
            </div>
            {history.length === 0 ? (
              <p className="muted">Hints you request will appear here for review.</p>
            ) : (
              <ol>
                {history.map((hint, index) => (
                  <li key={`${hint.technique.id}-${index}`}>
                    <span>{hint.technique.name}</span>
                    <p>{hint.summary}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <ShortcutsPanel />
        </aside>
      </section>
    </main>
  );
}

const KEYBOARD_SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ["1", "–", "9"], label: "Enter a digit in the selected cell" },
  { keys: ["Space"], label: "Clear the selected cell" },
  { keys: ["Tab"], label: "Toggle pencil (notes) mode" },
  { keys: ["Ctrl", "Z"], label: "Undo the last board change" }
];

function ShortcutsPanel() {
  return (
    <div className="shortcuts-panel">
      <div className="panel-title">
        <Keyboard size={18} />
        <h2>Keyboard shortcuts</h2>
      </div>
      <dl className="shortcuts-list">
        {KEYBOARD_SHORTCUTS.map((shortcut) => (
          <div className="shortcut-row" key={shortcut.label}>
            <dt>
              {shortcut.keys.map((key, index) =>
                key === "–" ? (
                  <span className="shortcut-sep" key={`${shortcut.label}-sep-${index}`} aria-hidden="true">
                    –
                  </span>
                ) : (
                  <kbd key={`${shortcut.label}-${key}`}>{key}</kbd>
                )
              )}
            </dt>
            <dd>{shortcut.label}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function NoteMarks({ activeDigit, values }: { activeDigit: number | null; values: number[] }) {
  return (
    <span className="notes" aria-hidden="true">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
        <span className={values.includes(digit) && digit === activeDigit ? "same-digit-note" : ""} key={digit}>
          {values.includes(digit) ? digit : ""}
        </span>
      ))}
    </span>
  );
}

function MessageList({ messages }: { messages: string[] }) {
  return (
    <div className="messages">
      {messages.map((message, index) => (
        <p key={`${message}-${index}`}>
          {message.toLowerCase().includes("conflict") || message.toLowerCase().includes("failed") ? <AlertTriangle size={16} /> : <Grid3X3 size={16} />}
          {message}
        </p>
      ))}
    </div>
  );
}

function HintPanel({
  canApplyHint,
  hint,
  onApplyHint
}: {
  canApplyHint: boolean;
  hint: HintResponse | null;
  onApplyHint: () => void;
}) {
  if (!hint) {
    return (
      <div className="hint-panel empty">
        <div className="panel-title">
          <Lightbulb size={18} />
          <h2>Next hint</h2>
        </div>
        <p>Enter a valid puzzle and request a hint to see the next logical move.</p>
      </div>
    );
  }

  return (
    <div className="hint-panel">
      <div className="hint-panel-header">
        <div className="panel-title">
          <Lightbulb size={18} />
          <h2>Next hint</h2>
        </div>
        <button type="button" onClick={onApplyHint} disabled={!canApplyHint}>
          <Check size={17} />
          Apply
        </button>
      </div>
      <div className="technique-row">
        <span>{hint.technique.name}</span>
        <small>Rank {hint.technique.rank}</small>
      </div>
      <h2>{hint.summary}</h2>
      <div className="explanation-stack">
        {hint.explanation.map((step, index) => (
          <p key={`${step}-${index}`}>
            <span>{index + 1}</span>
            {step}
          </p>
        ))}
      </div>
      {hint.action.eliminations.length > 0 ? (
        <div className="elimination-list">
          <strong>Eliminations</strong>
          <p>
            {hint.action.eliminations
              .slice(0, 6)
              .map((item) => `R${item.cell.row}C${item.cell.col} - ${item.digit}`)
              .join(", ")}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function collectConflictIndexes(conflicts: ValidationConflict[]): Set<number> {
  return new Set(conflicts.flatMap((conflict) => conflict.cells.map(cellToIndex)));
}

function sameGrid(left: SudokuGrid, right: SudokuGrid): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameNotes(left: NotesGrid, right: NotesGrid): boolean {
  return left.length === right.length && left.every((values, index) => sameNumberList(values, right[index] ?? []));
}

function sameNumberList(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function collectHintCells(hint: HintResponse | null, kind: "primary" | "related" | "elimination"): Set<number> {
  if (!hint) {
    return new Set();
  }
  if (kind === "primary") {
    return new Set(hint.highlights.primary_cells.map(cellToIndex));
  }
  if (kind === "related") {
    return new Set(hint.highlights.related_cells.map(cellToIndex));
  }
  return new Set(hint.highlights.eliminations.map((item) => cellToIndex(item.cell)));
}

function collectHintPreview(hint: HintResponse | null, grid: SudokuGrid): { index: number; digit: number } | null {
  if (hint?.action.type !== "place" || !hint.action.cell || !hint.action.digit) {
    return null;
  }

  const index = cellToIndex(hint.action.cell);
  if (index < 0 || index > 80 || grid[index] !== null) {
    return null;
  }

  return { index, digit: hint.action.digit };
}

function generatedPuzzleMessage(generated: GeneratedPuzzleResponse): string {
  const requested = generated.requested_level.name;
  const rated = generated.level.name;
  const seRating = generated.se_rating ? `, SE ${generated.se_rating.toFixed(1)}` : "";
  return `Generated ${requested} puzzle. Rated ${rated}${seRating} by ${generated.attribution.name}. Review it, then confirm to lock the givens.`;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || target.isContentEditable;
}
