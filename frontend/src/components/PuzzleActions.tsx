"use client";

import { ListChecks, Pen, Power, Share2, Zap } from "lucide-react";

type PuzzleActionsProps = {
  variant: "desktop" | "mobile";
  busyLabel: string | null;
  hasAnyNotes: boolean;
  quickFillMode: boolean;
  isValid: boolean;
  canShare: boolean;
  onToggleQuickFill: () => void;
  onToggleAllNotes: () => void;
  onCheck: () => void;
  onShare: () => void;
  onQuit: () => void;
};

function buttonClass(active = false, danger = false) {
  return ["puzzle-action", active ? "on" : "", danger ? "danger" : ""].filter(Boolean).join(" ");
}

export function PuzzleActions({
  variant,
  busyLabel,
  hasAnyNotes,
  quickFillMode,
  isValid,
  canShare,
  onToggleQuickFill,
  onToggleAllNotes,
  onCheck,
  onShare,
  onQuit
}: PuzzleActionsProps) {
  const busy = Boolean(busyLabel);
  const label = variant === "desktop" ? "Desktop puzzle actions" : "Mobile puzzle actions";
  const className = variant === "desktop" ? "desktop-actions puzzle-actions" : "more-pop puzzle-actions";

  return (
    <div className={className} role="group" aria-label={label}>
      <button
        type="button"
        className={buttonClass(quickFillMode)}
        aria-pressed={quickFillMode}
        aria-label="Quick fill"
        onClick={onToggleQuickFill}
      >
        <Zap size={16} />
        <span>Quick fill</span>
      </button>
      <button
        type="button"
        className={buttonClass(hasAnyNotes)}
        aria-pressed={hasAnyNotes}
        aria-label="Auto fill"
        disabled={!hasAnyNotes && !isValid}
        onClick={onToggleAllNotes}
      >
        <Pen size={16} />
        <span>Auto fill</span>
      </button>
      <button
        type="button"
        className={buttonClass()}
        aria-label="Check the puzzle for wrong numbers"
        disabled={busy || !isValid}
        onClick={onCheck}
      >
        <ListChecks size={16} />
        <span>Check</span>
      </button>
      <button type="button" className={buttonClass()} aria-label="Copy share link" disabled={!canShare} onClick={onShare}>
        <Share2 size={16} />
        <span>Share</span>
      </button>
      <button type="button" className={buttonClass(false, true)} aria-label="Quit to puzzle setup" onClick={onQuit}>
        <Power size={16} />
        <span>Quit</span>
      </button>
    </div>
  );
}
