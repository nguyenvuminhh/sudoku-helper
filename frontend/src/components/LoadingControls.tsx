"use client";

import { Check, ImageUp, Loader2, Sparkles } from "lucide-react";
import type { DragEvent } from "react";

import { GENERATED_LEVELS, type GeneratedLevel } from "../lib/constants";

export function LoadingControls({
  puzzleText,
  puzzleTextLength,
  generatedLevel,
  busyLabel,
  canConfirm,
  isDraggingImage,
  onPuzzleTextChange,
  onGeneratedLevelChange,
  onGeneratePuzzle,
  onLoadPuzzleText,
  onLoadSample,
  onUploadClick,
  onConfirm,
  onDragOver,
  onDragLeave,
  onDrop
}: {
  puzzleText: string;
  puzzleTextLength: number;
  generatedLevel: GeneratedLevel;
  busyLabel: string | null;
  canConfirm: boolean;
  isDraggingImage: boolean;
  onPuzzleTextChange: (value: string) => void;
  onGeneratedLevelChange: (level: GeneratedLevel) => void;
  onGeneratePuzzle: () => void;
  onLoadPuzzleText: () => void;
  onLoadSample: () => void;
  onUploadClick: () => void;
  onConfirm: () => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
}) {
  return (
    <div
      className={isDraggingImage ? "loading-stack dragging" : "loading-stack"}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="puzzle-generator">
        <label htmlFor="generated-level">Generate puzzle</label>
        <div className="generator-row">
          <select
            id="generated-level"
            className="level-select"
            value={generatedLevel}
            onChange={(event) => onGeneratedLevelChange(event.target.value as GeneratedLevel)}
          >
            {GENERATED_LEVELS.map((level) => (
              <option key={level.id} value={level.id}>
                {level.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={onGeneratePuzzle} disabled={busyLabel === "Generating puzzle"}>
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
          onChange={(event) => onPuzzleTextChange(event.target.value)}
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
        <button type="button" onClick={onLoadPuzzleText}>
          Load puzzle
        </button>
      </div>
      <div className="phase-buttons" aria-label="Loading controls">
        <button type="button" onClick={onLoadSample}>
          <Sparkles size={17} />
          Sample
        </button>
        <button type="button" onClick={onUploadClick}>
          <ImageUp size={17} />
          Upload
        </button>
        <button className="primary" type="button" onClick={onConfirm} disabled={!canConfirm}>
          <Check size={17} />
          Confirm
        </button>
      </div>
      <p className="upload-hint">
        {isDraggingImage ? "Drop the screenshot to import it." : "Or drag & drop or paste (Ctrl+V) a screenshot here."}
      </p>
    </div>
  );
}
