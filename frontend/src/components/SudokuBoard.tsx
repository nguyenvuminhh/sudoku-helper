"use client";

import { PAINT_COLOR_NAMES } from "../lib/constants";
import type { HintPreview } from "../lib/hints";
import type { BoardMarks, SudokuGrid, GivenMask } from "../lib/sudoku-state";

export type BoardHighlights = {
  conflictIndexes: Set<number>;
  incorrectIndexes: Set<number>;
  primaryIndexes: Set<number>;
  relatedIndexes: Set<number>;
  eliminationIndexes: Set<number>;
  matchingValueIndexes: Set<number>;
  peerIndexes: Set<number>;
};

export function SudokuBoard({
  grid,
  marks,
  givenMask,
  isSolving,
  selectedIndex,
  selectedIndexSet,
  activeHighlightDigit,
  lowConfidence,
  hintPreview,
  highlights,
  paused,
  onCellPointerDown,
  onCellPointerEnter,
  onCellClick,
  onCellContextMenu
}: {
  grid: SudokuGrid;
  marks: BoardMarks;
  givenMask: GivenMask;
  isSolving: boolean;
  selectedIndex: number;
  selectedIndexSet: Set<number>;
  activeHighlightDigit: number | null;
  lowConfidence: number[];
  hintPreview: HintPreview | null;
  highlights: BoardHighlights;
  paused: boolean;
  onCellPointerDown: (index: number, additive: boolean) => void;
  onCellPointerEnter: (index: number) => void;
  onCellClick: (index: number, additive: boolean) => void;
  onCellContextMenu: (index: number) => void;
}) {
  return (
    <div className={paused ? "sudoku-board paused" : "sudoku-board"} role="grid" aria-label="Sudoku grid">
      {grid.map((value, index) => {
        const row = Math.floor(index / 9);
        const col = index % 9;
        const cornerValues = marks.corner[index] ?? [];
        const centerValues = marks.center[index] ?? [];
        const paintColor = marks.colors[index] ?? null;
        const isGiven = isSolving && givenMask[index];
        const shouldShowHintPreview = hintPreview?.index === index;
        const inSelection = selectedIndexSet.has(index);
        const classes = [
          "sudoku-cell",
          highlights.peerIndexes.has(index) ? "peer-cell" : "",
          paintColor ? `cell-paint-${paintColor}` : "",
          inSelection && selectedIndex !== index ? "in-selection" : "",
          selectedIndex === index ? "selected" : "",
          isGiven ? "locked-given" : "",
          highlights.matchingValueIndexes.has(index) ? "same-digit-cell" : "",
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
          !value && cornerValues.length ? `corner notes ${cornerValues.join(" ")}` : "",
          !value && centerValues.length ? `notes ${centerValues.join(" ")}` : "",
          paintColor ? `${PAINT_COLOR_NAMES[paintColor]} highlight` : ""
        ].filter(Boolean);
        const ariaValue = ariaDetails.length ? `, ${ariaDetails.join(", ")}` : "";

        return (
          <button
            className={classes}
            key={index}
            type="button"
            role="gridcell"
            aria-label={`Row ${row + 1}, column ${col + 1}${ariaValue}`}
            onPointerDown={(event) => onCellPointerDown(index, event.ctrlKey || event.metaKey || event.altKey)}
            onPointerEnter={() => onCellPointerEnter(index)}
            onClick={(event) => onCellClick(index, event.ctrlKey || event.metaKey || event.altKey)}
            onContextMenu={(event) => {
              event.preventDefault();
              onCellContextMenu(index);
            }}
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
                {cornerValues.length ? <CornerMarks activeDigit={activeHighlightDigit} values={cornerValues} /> : null}
                {centerValues.length ? <CenterMarks activeDigit={activeHighlightDigit} values={centerValues} /> : null}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* Corner marks fill the cell edge positions in reading order: the first four
   notes claim the corners, later ones the edge midpoints, the ninth the
   middle. */
const CORNER_SLOTS = [
  "slot-tl",
  "slot-tr",
  "slot-bl",
  "slot-br",
  "slot-tc",
  "slot-bc",
  "slot-ml",
  "slot-mr",
  "slot-cc"
] as const;

function CornerMarks({ activeDigit, values }: { activeDigit: number | null; values: number[] }) {
  return (
    <span className="corner-marks" aria-hidden="true">
      {values.slice(0, 9).map((digit, position) => (
        <span
          className={`${CORNER_SLOTS[position]}${digit === activeDigit ? " same-digit-note" : ""}`}
          key={digit}
        >
          {digit}
        </span>
      ))}
    </span>
  );
}

function CenterMarks({ activeDigit, values }: { activeDigit: number | null; values: number[] }) {
  return (
    <span className={values.length > 5 ? "center-marks dense" : "center-marks"} aria-hidden="true">
      {values.map((digit) => (
        <span className={digit === activeDigit ? "same-digit-note" : ""} key={digit}>
          {digit}
        </span>
      ))}
    </span>
  );
}
