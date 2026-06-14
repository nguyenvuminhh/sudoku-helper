"use client";

import { Check, ImageIcon, Info, Loader2, Pencil, Sparkles, Upload } from "lucide-react";
import { useState, type DragEvent } from "react";

import { GENERATED_LEVELS, type GeneratedLevel } from "../lib/constants";

type Tab = "generate" | "import";

export function LoadingControls({
  puzzleText,
  puzzleTextLength,
  filledCount,
  generatedLevel,
  busyLabel,
  canConfirm,
  statusMessage,
  isDraggingImage,
  onPuzzleTextChange,
  onGeneratedLevelChange,
  onGeneratePuzzle,
  onLoadPuzzleText,
  onLoadSample,
  onUploadClick,
  onConfirm,
  onEdit,
  onDragOver,
  onDragLeave,
  onDrop
}: {
  puzzleText: string;
  puzzleTextLength: number;
  filledCount: number;
  generatedLevel: GeneratedLevel;
  busyLabel: string | null;
  canConfirm: boolean;
  statusMessage?: string;
  isDraggingImage: boolean;
  onPuzzleTextChange: (value: string) => void;
  onGeneratedLevelChange: (level: GeneratedLevel) => void;
  onGeneratePuzzle: () => void;
  onLoadPuzzleText: () => void;
  onLoadSample: () => void;
  onUploadClick: () => void;
  onConfirm: () => void;
  onEdit: () => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
}) {
  const [tab, setTab] = useState<Tab>("generate");
  const generating = busyLabel === "Generating puzzle";

  // Once a puzzle is on the board, the panel flips to the review/confirm step.
  if (filledCount > 0) {
    const level = GENERATED_LEVELS.find((entry) => entry.id === generatedLevel);
    return (
      <div className="panel loading-panel">
        <div className="panel-head">
          <span className="pill pill-teal">Ready</span>
          <h2>Looks right?</h2>
          <p className="sub">
            {filledCount} {filledCount === 1 ? "clue" : "clues"} detected
            {canConfirm ? " · ready to solve" : " · resolve conflicts to continue"}.
          </p>
        </div>
        {statusMessage ? (
          <p className="panel-note">
            <Info size={15} />
            {statusMessage}
          </p>
        ) : null}
        <dl className="mini-stats">
          <div>
            <dt>Clues</dt>
            <dd>{filledCount}</dd>
          </div>
          <div>
            <dt>Empty</dt>
            <dd>{81 - filledCount}</dd>
          </div>
          <div>
            <dt>Difficulty</dt>
            <dd>{level?.label ?? "—"}</dd>
          </div>
        </dl>
        <button type="button" className="btn primary full" onClick={onConfirm} disabled={!canConfirm}>
          <Check size={17} />
          <span>Start solving</span>
        </button>
        <button type="button" className="btn ghost full" onClick={onEdit}>
          <Pencil size={16} />
          <span>Edit clues</span>
        </button>
        <p className="hint-line">Givens lock once you begin — you can reset anytime.</p>
      </div>
    );
  }

  const counterValid = puzzleTextLength === 81;

  return (
    <div
      className={isDraggingImage ? "panel loading-panel dragging" : "panel loading-panel"}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="panel-head">
        <h2>{tab === "generate" ? "Start a puzzle" : "Import a puzzle"}</h2>
        <p className="sub">
          {tab === "generate"
            ? "Generate a fresh board, or bring your own."
            : "Paste 81 digits, drop a screenshot, or load a sample."}
        </p>
      </div>

      {statusMessage ? (
        <p className="panel-note">
          <Info size={15} />
          {statusMessage}
        </p>
      ) : null}

      <div className="seg" role="tablist" aria-label="Puzzle source">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "generate"}
          className={tab === "generate" ? "seg-btn on" : "seg-btn"}
          onClick={() => setTab("generate")}
        >
          Generate
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "import"}
          className={tab === "import" ? "seg-btn on" : "seg-btn"}
          onClick={() => setTab("import")}
        >
          Import
        </button>
      </div>

      {tab === "generate" ? (
        <>
          <div className="field-group">
            <span className="fld-label" id="difficulty-label">
              Difficulty
            </span>
            <div className="chips" role="group" aria-labelledby="difficulty-label">
              {GENERATED_LEVELS.map((level) => (
                <button
                  key={level.id}
                  type="button"
                  className={generatedLevel === level.id ? "chip on" : "chip"}
                  aria-pressed={generatedLevel === level.id}
                  onClick={() => onGeneratedLevelChange(level.id)}
                >
                  {level.label}
                </button>
              ))}
            </div>
          </div>
          <button type="button" className="btn primary full" onClick={onGeneratePuzzle} disabled={generating}>
            {generating ? <Loader2 className="spin" size={17} /> : <Sparkles size={17} />}
            <span>Generate puzzle</span>
          </button>
          <p className="hint-line">Pick a level and we&rsquo;ll deal a solvable grid.</p>
        </>
      ) : (
        <>
          <div className="field-group">
            <div className="fld-row">
              <label className="fld-label" htmlFor="puzzle-text">
                81-character puzzle
              </label>
              <span className={counterValid ? "count ok" : "count"} aria-label={`${puzzleTextLength} of 81 characters`}>
                {puzzleTextLength} / 81{counterValid ? " · valid" : ""}
              </span>
            </div>
            <textarea
              id="puzzle-text"
              className="code-field"
              value={puzzleText}
              onChange={(event) => onPuzzleTextChange(event.target.value)}
              placeholder="000694832004357196090002745..."
              rows={3}
              spellCheck={false}
            />
          </div>
          <div className="btn-row two">
            <button type="button" className="btn ghost sm" onClick={onLoadSample}>
              <Sparkles size={16} />
              <span>Sample</span>
            </button>
            <button type="button" className="btn ghost sm" onClick={onUploadClick}>
              <Upload size={16} />
              <span>Upload</span>
            </button>
          </div>
          <div className="dropzone">
            <ImageIcon size={18} />
            <span>{isDraggingImage ? "Drop the screenshot to import it." : "Drop or paste a Sudoku screenshot"}</span>
          </div>
          <button type="button" className="btn primary full" onClick={onLoadPuzzleText}>
            <Check size={17} />
            <span>Load puzzle</span>
          </button>
        </>
      )}
    </div>
  );
}
