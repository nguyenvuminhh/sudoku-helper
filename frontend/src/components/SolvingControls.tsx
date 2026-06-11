"use client";

import { Crosshair, Lightbulb, ListChecks, Loader2, Pencil, Plus, Redo2, Trash2, Undo2 } from "lucide-react";

export function SolvingControls({
  busyLabel,
  canUndo,
  canRedo,
  editingNotes,
  quickFillMode,
  isValid,
  filledCount,
  onUndo,
  onRedo,
  onToggleNotes,
  onToggleQuickFill,
  onFillAllNotes,
  onRemoveAllNotes,
  onCheck,
  onHint
}: {
  busyLabel: string | null;
  canUndo: boolean;
  canRedo: boolean;
  editingNotes: boolean;
  quickFillMode: boolean;
  isValid: boolean;
  filledCount: number;
  onUndo: () => void;
  onRedo: () => void;
  onToggleNotes: () => void;
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
      <SwitchRow active={editingNotes} icon={<Pencil size={17} />} label="Notes" onClick={onToggleNotes} />
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

function SwitchRow({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={active ? "switch-row active" : "switch-row"}
      onClick={onClick}
      role="switch"
      aria-checked={active}
      aria-label={label}
    >
      <span className="switch-copy">
        {icon}
        {label}
      </span>
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
    </button>
  );
}
