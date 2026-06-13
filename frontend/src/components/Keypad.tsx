"use client";

import { Eraser } from "lucide-react";

import { PAINT_COLOR_NAMES, type EntryMode } from "../lib/constants";

export function Keypad({
  digitCounts,
  selectedNotes,
  quickFillDigit,
  quickFillMode,
  entryMode,
  isSolving,
  selectionAllGiven,
  selectionAllFilled,
  showRemainingCounts,
  onDigit
}: {
  digitCounts: number[];
  selectedNotes: number[];
  quickFillDigit: number | null;
  quickFillMode: boolean;
  entryMode: EntryMode;
  isSolving: boolean;
  selectionAllGiven: boolean;
  selectionAllFilled: boolean;
  showRemainingCounts: boolean;
  onDigit: (value: number | null) => void;
}) {
  const noteMode = entryMode === "corner" || entryMode === "center";
  const digitDisabled = quickFillMode
    ? !isSolving
    : noteMode
      ? !isSolving || selectionAllFilled
      : entryMode === "color"
        ? !isSolving
        : selectionAllGiven;
  const eraseDisabled = quickFillMode ? !isSolving : noteMode || entryMode === "color" ? !isSolving : selectionAllGiven;

  // A digit is "done" once all nine copies are on the board. Colors never
  // complete, so every swatch always shows.
  const isComplete = (digit: number) => entryMode !== "color" && digitCounts[digit] >= 9;

  return (
    <div className="keypad" aria-label="Digit entry">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => {
        const remaining = Math.max(0, 9 - (digitCounts[digit] ?? 0));
        if (entryMode === "color") {
          return (
            <button
              className={`swatch paint-${digit}${quickFillDigit === digit ? " quick-fill-active" : ""}`}
              disabled={digitDisabled}
              key={digit}
              type="button"
              aria-label={`Paint ${PAINT_COLOR_NAMES[digit]}`}
              onClick={() => onDigit(digit)}
            >
              <span className="swatch-chip" aria-hidden="true" />
            </button>
          );
        }

        // A finished digit leaves an empty slot so the others keep their place.
        if (isComplete(digit)) {
          return <span className="keypad-blank" key={digit} aria-hidden="true" />;
        }

        return (
          <button
            className={[
              noteMode && selectedNotes.includes(digit) ? "note-active" : "",
              quickFillDigit === digit ? "quick-fill-active" : ""
            ]
              .filter(Boolean)
              .join(" ")}
            disabled={digitDisabled}
            key={digit}
            type="button"
            onClick={() => onDigit(digit)}
          >
            {digit}
            {showRemainingCounts && remaining > 0 ? (
              <span className="remaining-count" aria-hidden="true">
                {remaining}
              </span>
            ) : null}
          </button>
        );
      })}
      <button type="button" onClick={() => onDigit(null)} disabled={eraseDisabled} aria-label="Erase cell">
        <Eraser size={16} />
      </button>
    </div>
  );
}
