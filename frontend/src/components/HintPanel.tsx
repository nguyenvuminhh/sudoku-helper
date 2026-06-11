"use client";

import { Check, Lightbulb } from "lucide-react";

import type { HintResponse } from "../lib/api";

export function HintPanel({
  canApplyHint,
  hint,
  onApplyHint
}: {
  canApplyHint: boolean;
  hint: HintResponse | null;
  onApplyHint: () => void;
}) {
  if (!hint) {
    return (
      <div className="hint-panel empty">
        <div className="panel-title">
          <Lightbulb size={18} />
          <h2>Next hint</h2>
        </div>
        <p>Enter a valid puzzle and request a hint to see the next logical move.</p>
      </div>
    );
  }

  return (
    <div className="hint-panel">
      <div className="hint-panel-header">
        <div className="panel-title">
          <Lightbulb size={18} />
          <h2>Next hint</h2>
        </div>
        <button type="button" onClick={onApplyHint} disabled={!canApplyHint}>
          <Check size={17} />
          Apply
        </button>
      </div>
      <div className="technique-row">
        <span>{hint.technique.name}</span>
        <small>Rank {hint.technique.rank}</small>
      </div>
      <h2>{hint.summary}</h2>
      <div className="explanation-stack">
        {hint.explanation.map((step, index) => (
          <p key={`${step}-${index}`}>
            <span>{index + 1}</span>
            {step}
          </p>
        ))}
      </div>
      {hint.action.eliminations.length > 0 ? (
        <div className="elimination-list">
          <strong>Eliminations</strong>
          <p>
            {hint.action.eliminations
              .slice(0, 6)
              .map((item) => `R${item.cell.row}C${item.cell.col} - ${item.digit}`)
              .join(", ")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
