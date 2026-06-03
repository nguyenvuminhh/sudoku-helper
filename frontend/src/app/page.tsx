"use client";

import {
  AlertTriangle,
  Brain,
  Eraser,
  Eye,
  Grid3X3,
  History,
  ImageUp,
  Lightbulb,
  Loader2,
  RotateCcw,
  Sparkles
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
  countFilledCells,
  createEmptyGrid,
  findNextInputIndex,
  indexToCell,
  parsePuzzleText,
  resolveKeyboardInput,
  setCellValue,
  validateSudokuGrid,
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

export default function SudokuTutorPage() {
  const [grid, setGrid] = useState<SudokuGrid>(() => createEmptyGrid());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [currentHint, setCurrentHint] = useState<HintResponse | null>(null);
  const [history, setHistory] = useState<HintResponse[]>([]);
  const [lowConfidence, setLowConfidence] = useState<number[]>([]);
  const [messages, setMessages] = useState<string[]>([
    "Enter a puzzle on the board or upload a clean Sudoku screenshot."
  ]);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [showCandidates, setShowCandidates] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filledCount = countFilledCells(grid);
  const selectedCell = indexToCell(selectedIndex);
  const validation = useMemo(() => validateSudokuGrid(grid), [grid]);
  const statusMessages = validation.valid ? messages : ["Fix the highlighted conflicts before requesting a hint."];
  const conflictIndexes = useMemo(() => collectConflictIndexes(validation.conflicts), [validation]);
  const primaryIndexes = useMemo(() => collectHintCells(currentHint, "primary"), [currentHint]);
  const relatedIndexes = useMemo(() => collectHintCells(currentHint, "related"), [currentHint]);
  const eliminationIndexes = useMemo(() => collectHintCells(currentHint, "elimination"), [currentHint]);

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
  }, [selectedIndex]);

  function updateGrid(nextGrid: SudokuGrid) {
    setGrid(nextGrid);
    setCurrentHint(null);
  }

  function handleDigit(value: number | null) {
    updateGrid(setCellValue(grid, selectedIndex, value));
  }

  function applyKeyboardValue(value: number | null) {
    setGrid((currentGrid) => {
      const nextGrid = setCellValue(currentGrid, selectedIndex, value);
      setSelectedIndex(findNextInputIndex(nextGrid, selectedIndex));
      return nextGrid;
    });
    setCurrentHint(null);
  }

  async function handleHint() {
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

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setBusyLabel("Reading image");
    try {
      const result = await recognizeImage(file);
      const applied = applyOcrCells(createEmptyGrid(), result.cells);
      updateGrid(applied.grid);
      setLowConfidence(applied.lowConfidence);
      setMessages(result.warnings);
    } catch (error) {
      setMessages([error instanceof Error ? error.message : "Image recognition failed."]);
    } finally {
      setBusyLabel(null);
      event.target.value = "";
    }
  }

  function loadSample() {
    updateGrid(parsePuzzleText(SAMPLE_PUZZLE));
    setLowConfidence([]);
    setMessages(["Loaded a sample puzzle with a hidden single available."]);
  }

  function resetPuzzle() {
    setGrid(createEmptyGrid());
    setCurrentHint(null);
    setHistory([]);
    setLowConfidence([]);
    setMessages(["Workspace cleared. Start with board entry or image upload."]);
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
              const candidateValues = validation?.candidates[String(index)] ?? [];
              const classes = [
                "sudoku-cell",
                selectedIndex === index ? "selected" : "",
                conflictIndexes.has(index) ? "conflict" : "",
                lowConfidence.includes(index) ? "low-confidence" : "",
                primaryIndexes.has(index) ? "hint-primary" : "",
                relatedIndexes.has(index) ? "hint-related" : "",
                eliminationIndexes.has(index) ? "hint-elimination" : ""
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <button
                  className={classes}
                  key={index}
                  type="button"
                  role="gridcell"
                  aria-label={`Row ${row + 1}, column ${col + 1}${value ? `, ${value}` : ""}`}
                  onClick={() => setSelectedIndex(index)}
                >
                  {value ? <strong>{value}</strong> : showCandidates && candidateValues.length ? <CandidateMarks values={candidateValues} /> : null}
                </button>
              );
            })}
          </div>

          <div className="keypad" aria-label="Digit entry">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
              <button key={digit} type="button" onClick={() => handleDigit(digit)}>
                {digit}
              </button>
            ))}
            <button type="button" onClick={() => handleDigit(null)}>
              <Eraser size={16} />
            </button>
          </div>
        </section>

        <aside className="inspector" aria-label="Hint explanation">
          <div className="actions-panel" aria-label="Sudoku controls">
            <div className="panel-title">
              <Grid3X3 size={19} />
              <h2>Controls</h2>
            </div>
            <div className="action-grid">
              <div className="control-group" aria-label="Game controls">
                <p className="control-group-title">Game</p>
                <div className="control-buttons">
                  <button type="button" onClick={loadSample}>
                    <Sparkles size={17} />
                    Sample
                  </button>
                  <button type="button" onClick={() => fileInputRef.current?.click()}>
                    <ImageUp size={17} />
                    Upload
                  </button>
                  <button type="button" onClick={resetPuzzle}>
                    <RotateCcw size={17} />
                    Reset
                  </button>
                </div>
              </div>
              <div className="control-group" aria-label="Hint controls">
                <p className="control-group-title">Hint</p>
                <div className="control-buttons">
                  <button type="button" className={showCandidates ? "toggle active" : "toggle"} onClick={() => setShowCandidates((value) => !value)}>
                    <Eye size={17} />
                    Candidates
                  </button>
                  <button
                    className="primary"
                    type="button"
                    onClick={handleHint}
                    disabled={Boolean(busyLabel) || filledCount === 0 || !validation.valid}
                  >
                    {busyLabel === "Finding hint" ? <Loader2 className="spin" size={17} /> : <Lightbulb size={17} />}
                    Hint
                  </button>
                </div>
              </div>
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

          <HintPanel hint={currentHint} />

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

function CandidateMarks({ values }: { values: number[] }) {
  return (
    <span className="candidates" aria-hidden="true">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
        <span key={digit}>{values.includes(digit) ? digit : ""}</span>
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

function HintPanel({ hint }: { hint: HintResponse | null }) {
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

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || target.isContentEditable;
}
