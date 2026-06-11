"use client";

import { History } from "lucide-react";

import type { HintResponse } from "../lib/api";

export function HistoryPanel({ history }: { history: HintResponse[] }) {
  return (
    <div className="history-panel">
      <div className="panel-title">
        <History size={18} />
        <h2>Hint history</h2>
      </div>
      {history.length === 0 ? (
        <p className="muted">Hints you request will appear here for review.</p>
      ) : (
        <ol>
          {history.map((hint, index) => (
            <li key={`${hint.technique.id}-${index}`}>
              <span>{hint.technique.name}</span>
              <p>{hint.summary}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
