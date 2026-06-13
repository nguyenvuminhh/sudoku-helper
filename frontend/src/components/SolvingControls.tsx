"use client";

import { AlignCenter, Crosshair, Lightbulb, ListChecks, Loader2, Palette, Pen, Pencil, PenLine, Redo2, Undo2 } from "lucide-react";

import type { EntryMode } from "../lib/constants";

export function SolvingControls({
  busyLabel,
  canUndo,
  canRedo,
  entryMode,
  hasAnyNotes,
  quickFillMode,
  isValid,
  filledCount,
  onUndo,
  onRedo,
  onEntryModeChange,
  onToggleNoteMode,
  onToggleQuickFill,
  onToggleAllNotes,
  onCheck,
  onHint
}: {
  busyLabel: string | null;
  canUndo: boolean;
  canRedo: boolean;
  entryMode: EntryMode;
  hasAnyNotes: boolean;
  quickFillMode: boolean;
  isValid: boolean;
  filledCount: number;
  onUndo: () => void;
  onRedo: () => void;
  onEntryModeChange: (mode: EntryMode) => void;
  onToggleNoteMode: () => void;
  onToggleQuickFill: () => void;
  onToggleAllNotes: () => void;
  onCheck: () => void;
  onHint: () => void;
}) {
  const noteMode = entryMode !== "value";
  const busy = Boolean(busyLabel);

  return (
    <div className="control-rows" aria-label="Solving controls">
      <div className="control-toggles control-toggles-primary">
        <ControlButton
          icon={<Undo2 size={18} />}
          label="Undo"
          ariaLabel="Undo last board change"
          disabled={!canUndo || busy}
          onClick={onUndo}
        />
        <ControlButton
          icon={<Redo2 size={18} />}
          label="Redo"
          ariaLabel="Redo last undone change"
          disabled={!canRedo || busy}
          onClick={onRedo}
        />
        <ControlButton icon={<Pencil size={18} />} label="Note" pressed={noteMode} onClick={onToggleNoteMode} />
        <ControlButton
          icon={<Crosshair size={18} />}
          label="Quick fill"
          pressed={quickFillMode}
          onClick={onToggleQuickFill}
        />
      </div>
      <div className="control-toggles control-toggles-secondary">
        <ControlButton
          icon={<PenLine size={18} />}
          label="Corner"
          pressed={entryMode === "corner"}
          onClick={() => onEntryModeChange("corner")}
        />
        <ControlButton
          icon={<AlignCenter size={18} />}
          label="Center"
          pressed={entryMode === "center"}
          onClick={() => onEntryModeChange("center")}
        />
        <ControlButton
          icon={<Palette size={18} />}
          label="Color"
          pressed={entryMode === "color"}
          onClick={() => onEntryModeChange("color")}
        />
        <ControlButton
          icon={<Pen size={18} />}
          label="Auto fill"
          pressed={hasAnyNotes}
          disabled={!hasAnyNotes && !isValid}
          onClick={onToggleAllNotes}
        />
        <ControlButton
          icon={<ListChecks size={18} />}
          label="Check"
          ariaLabel="Check the puzzle for wrong numbers"
          disabled={busy || !isValid}
          onClick={onCheck}
        />
        <ControlButton
          icon={busyLabel === "Finding hint" ? <Loader2 className="spin" size={18} /> : <Lightbulb size={18} />}
          label="Hint"
          primary
          disabled={busy || filledCount === 0 || !isValid}
          onClick={onHint}
        />
      </div>
    </div>
  );
}

/* One compact control. Toggles pass `pressed` and advertise their on/off state
   through aria-pressed plus the filled/outlined icon styling; momentary actions
   leave `pressed` undefined. */
function ControlButton({
  icon,
  label,
  ariaLabel,
  pressed,
  primary,
  disabled,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  ariaLabel?: string;
  pressed?: boolean;
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const className = ["control-toggle", pressed ? "active" : "", primary ? "primary" : ""].filter(Boolean).join(" ");
  return (
    <button
      type="button"
      className={className}
      aria-label={ariaLabel ?? label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      <span className="control-toggle-label">{label}</span>
    </button>
  );
}
