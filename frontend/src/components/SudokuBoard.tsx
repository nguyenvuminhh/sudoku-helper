"use client";

import type { HintPreview } from "../lib/hints";
import type { NotesGrid, SudokuGrid, GivenMask } from "../lib/sudoku-state";

export type BoardHighlights = {
  conflictIndexes: Set<number>;
  incorrectIndexes: Set<number>;
  primaryIndexes: Set<number>;
  relatedIndexes: Set<number>;
  eliminationIndexes: Set<number>;
  matchingValueIndexes: Set<number>;
  matchingNoteIndexes: Set<number>;
  peerIndexes: Set<number>;
};

export function SudokuBoard({
  grid,
  notes,
  givenMask,
  isSolving,
  selectedIndex,
  editingNotes,
  activeHighlightDigit,
  lowConfidence,
  hintPreview,
  highlights,
  paused,
  onCellClick
}: {
  grid: SudokuGrid;
  notes: NotesGrid;
  givenMask: GivenMask;
  isSolving: boolean;
  selectedIndex: number;
  editingNotes: boolean;
  activeHighlightDigit: number | null;
  lowConfidence: number[];
  hintPreview: HintPreview | null;
  highlights: BoardHighlights;
  paused: boolean;
  onCellClick: (index: number) => void;
}) {
  return (
    <div className={paused ? "sudoku-board paused" : "sudoku-board"} role="grid" aria-label="Sudoku grid">
      {grid.map((value, index) => {
        const row = Math.floor(index / 9);
        const col = index % 9;
        const noteValues = notes[index] ?? [];
        const isGiven = isSolving && givenMask[index];
        const shouldShowHintPreview = hintPreview?.index === index;
        const classes = [
          "sudoku-cell",
          highlights.peerIndexes.has(index) ? "peer-cell" : "",
          selectedIndex === index ? "selected" : "",
          isGiven ? "locked-given" : "",
          editingNotes && selectedIndex === index ? "note-target" : "",
          highlights.matchingValueIndexes.has(index) ? "same-digit-cell" : "",
          highlights.matchingNoteIndexes.has(index) ? "same-digit-note-cell" : "",
          highlights.conflictIndexes.has(index) ? "conflict" : "",
          highlights.incorrectIndexes.has(index) ? "check-wrong" : "",
          lowConfidence.includes(index) ? "low-confidence" : "",
          highlights.primaryIndexes.has(index) ? "hint-primary" : "",
          highlights.relatedIndexes.has(index) ? "hint-related" : "",
          highlights.eliminationIndexes.has(index) ? "hint-elimination" : "",
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
            onClick={() => onCellClick(index)}
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
