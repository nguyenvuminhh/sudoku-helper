"use client";

import { Eraser } from "lucide-react";

export function Keypad({
  digitCounts,
  selectedNotes,
  quickFillDigit,
  quickFillMode,
  editingNotes,
  isSolving,
  selectedIsGiven,
  selectedCellFilled,
  onDigit
}: {
  digitCounts: number[];
  selectedNotes: number[];
  quickFillDigit: number | null;
  quickFillMode: boolean;
  editingNotes: boolean;
  isSolving: boolean;
  selectedIsGiven: boolean;
  selectedCellFilled: boolean;
  onDigit: (value: number | null) => void;
}) {
  const digitDisabled = quickFillMode ? !isSolving : editingNotes ? !isSolving || selectedCellFilled : selectedIsGiven;
  const eraseDisabled = quickFillMode ? !isSolving : editingNotes ? !isSolving : selectedIsGiven;

  return (
    <div className="keypad" aria-label="Digit entry">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
        <button
          className={[
            editingNotes && selectedNotes.includes(digit) ? "note-active" : "",
            quickFillDigit === digit ? "quick-fill-active" : "",
            digitCounts[digit] >= 9 ? "digit-complete" : ""
          ]
            .filter(Boolean)
            .join(" ")}
          disabled={digitDisabled}
          key={digit}
          type="button"
          onClick={() => onDigit(digit)}
        >
          {digit}
        </button>
      ))}
      <button type="button" onClick={() => onDigit(null)} disabled={eraseDisabled} aria-label="Erase cell">
        <Eraser size={16} />
      </button>
    </div>
  );
}
