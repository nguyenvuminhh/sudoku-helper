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
  Lightbulb,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  recognizeImage,
  requestHint,
  type HintResponse
} from "../lib/api";
import {
  applyOcrCells,
  cellToIndex,
  collectMatchingDigitHighlights,
  countFilledCells,
  createEmptyNotes,
  createEmptyGrid,
  createGivenMask,
  findNextInputIndex,
  indexToCell,
  parsePuzzleText,
  quickFillNotes,
  removeAllNotes,
  resolveKeyboardInput,
  setCellValue,
  setCellValueWithNotes,
  toggleCellNote,
  validateSudokuGrid,
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

export default function SudokuTutorPage() {
  const [grid, setGrid] = useState<SudokuGrid>(() => createEmptyGrid());
  const [notes, setNotes] = useState<NotesGrid>(() => createEmptyNotes());
  const [givenMask, setGivenMask] = useState<GivenMask>(() => createGivenMask(createEmptyGrid()));
  const [phase, setPhase] = useState<TutorPhase>("loading");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [currentHint, setCurrentHint] = useState<HintResponse | null>(null);
  const [history, setHistory] = useState<HintResponse[]>([]);
  const [lowConfidence, setLowConfidence] = useState<number[]>([]);
  const [messages, setMessages] = useState<string[]>([
    "Enter a puzzle on the board or upload a clean Sudoku screenshot."
  ]);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [quickFillMode, setQuickFillMode] = useState(false);
  const [quickFillDigit, setQuickFillDigit] = useState<number | null>(null);
  const [puzzleText, setPuzzleText] = useState("");
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

  useEffect(() => {
    function handleWindowKeyDown(event: globalThis.KeyboardEvent) {
      if (isEditableTarget(event.target) || event.altKey || event.ctrlKey || event.metaKey) {
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
  }, [editingNotes, givenMask, grid, notes, phase, quickFillDigit, quickFillMode, selectedIndex]);

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

      setNotes((currentNotes) => toggleCellNote(currentNotes, grid, index, quickFillDigit));
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

    setNotes((currentNotes) => toggleCellNote(currentNotes, grid, selectedIndex, digit));
    setCurrentHint(null);
  }

  function clearSelectedNotes() {
    if (!isSolving) {
      return;
    }

    setNotes((currentNotes) => currentNotes.map((cellNotes, index) => (index === selectedIndex ? [] : cellNotes)));
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
    updateGrid(result.grid, result.notes);
    setLowConfidence((indexes) => indexes.filter((lowConfidenceIndex) => lowConfidenceIndex !== index));
    if (shouldAdvance && value !== null) {
      setSelectedIndex(findNextInputIndex(result.grid, index));
    }
  }

  function handleApplyHint() {
    if (!hintPreview) {
      return;
    }

    const cell = indexToCell(hintPreview.index);
    const result = setCellValueWithNotes(grid, notes, hintPreview.index, hintPreview.digit);
    updateGrid(result.grid, result.notes);
    setSelectedIndex(hintPreview.index);
    setLowConfidence((indexes) => indexes.filter((index) => index !== hintPreview.index));
    setMessages([`Applied ${hintPreview.digit} at R${cell.row}C${cell.col}. Request another hint when you are ready.`]);
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
      const hint = await requestHint(grid);
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

    setNotes(quickFillNotes(grid));
    setCurrentHint(null);
    setMessages(["Filled notes for all empty cells from the current board."]);
  }

  function handleRemoveAllNotes() {
    setNotes(removeAllNotes(notes));
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
                hintPreview?.index === index ? "hint-preview" : ""
              ]
                .filter(Boolean)
                .join(" ");
              const ariaValue = value
                ? `, ${value}${isGiven ? ", loaded clue" : ""}`
                : hintPreview?.index === index
                  ? `, suggested ${hintPreview.digit}`
                  : noteValues.length
                    ? `, notes ${noteValues.join(" ")}`
                    : "";

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
                  ) : hintPreview?.index === index ? (
                    <span className="hint-preview-value" aria-hidden="true">
                      {hintPreview.digit}
                    </span>
                  ) : noteValues.length ? (
                    <NoteMarks activeDigit={activeHighlightDigit} values={noteValues} />
                  ) : null}
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

          <HintPanel canApplyHint={Boolean(hintPreview) && !busyLabel} hint={currentHint} onApplyHint={handleApplyHint} />

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
        </aside>
      </section>
    </main>
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

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || target.isContentEditable;
}
