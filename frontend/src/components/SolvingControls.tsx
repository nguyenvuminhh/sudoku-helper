"use client";

import { Crosshair, Lightbulb, ListChecks, Loader2, Palette, Pencil, PenLine, Plus, Redo2, Trash2, Type, Undo2 } from "lucide-react";

import { ENTRY_MODES, type EntryMode } from "../lib/constants";
import { SwitchRow } from "./SwitchRow";

const MODE_ICONS: Record<EntryMode, React.ReactNode> = {
  value: <Type size={15} />,
  corner: <PenLine size={15} />,
  center: <Pencil size={15} />,
  color: <Palette size={15} />
};

export function SolvingControls({
  busyLabel,
  canUndo,
  canRedo,
  entryMode,
  quickFillMode,
  isValid,
  filledCount,
  onUndo,
  onRedo,
  onEntryModeChange,
  onToggleQuickFill,
  onFillAllNotes,
  onRemoveAllNotes,
  onCheck,
  onHint
}: {
  busyLabel: string | null;
  canUndo: boolean;
  canRedo: boolean;
  entryMode: EntryMode;
  quickFillMode: boolean;
  isValid: boolean;
  filledCount: number;
  onUndo: () => void;
  onRedo: () => void;
  onEntryModeChange: (mode: EntryMode) => void;
  onToggleQuickFill: () => void;
  onFillAllNotes: () => void;
  onRemoveAllNotes: () => void;
  onCheck: () => void;
  onHint: () => void;
}) {
  return (
    <div className="control-stack" aria-label="Solving controls">
      <div className="note-action-row">
        <button
          type="button"
          className="undo-action"
          onClick={onUndo}
          disabled={!canUndo || Boolean(busyLabel)}
          aria-label="Undo last board change"
        >
          <Undo2 size={17} />
          Undo
        </button>
        <button
          type="button"
          className="redo-action"
          onClick={onRedo}
          disabled={!canRedo || Boolean(busyLabel)}
          aria-label="Redo last undone change"
        >
          <Redo2 size={17} />
          Redo
        </button>
      </div>
      <div className="mode-switcher" role="radiogroup" aria-label="Entry mode">
        {ENTRY_MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            role="radio"
            aria-checked={entryMode === mode.id}
            className={entryMode === mode.id ? "mode-option active" : "mode-option"}
            onClick={() => onEntryModeChange(mode.id)}
          >
            {MODE_ICONS[mode.id]}
            {mode.label}
          </button>
        ))}
      </div>
      <SwitchRow active={quickFillMode} icon={<Crosshair size={17} />} label="Quick fill" onClick={onToggleQuickFill} />
      <div className="note-action-row">
        <button type="button" onClick={onFillAllNotes} disabled={!isValid}>
          <Plus size={17} />
          Fill all notes
        </button>
        <button type="button" onClick={onRemoveAllNotes}>
          <Trash2 size={17} />
          Remove all notes
        </button>
      </div>
      <button
        type="button"
        className="check-action"
        onClick={onCheck}
        disabled={Boolean(busyLabel) || !isValid}
        aria-label="Check the puzzle for wrong numbers"
      >
        <ListChecks size={17} />
        Check
      </button>
      <button
        className="primary hint-action"
        type="button"
        onClick={onHint}
        disabled={Boolean(busyLabel) || filledCount === 0 || !isValid}
      >
        {busyLabel === "Finding hint" ? <Loader2 className="spin" size={17} /> : <Lightbulb size={17} />}
        Hint
      </button>
    </div>
  );
}
