"use client";

import { Brain, Loader2 } from "lucide-react";

export function StatusPanel({ busyLabel, messages }: { busyLabel: string | null; messages: string[] }) {
  const latest = messages[messages.length - 1] ?? "";

  return (
    <div className="strategy">
      <div className="strategy-label">
        <Brain size={15} />
        <span>Strategy note</span>
      </div>
      {busyLabel ? (
        <p className="strategy-text busy">
          <Loader2 className="spin" size={16} />
          {busyLabel}...
        </p>
      ) : latest ? (
        <p className="strategy-text">{latest}</p>
      ) : null}
    </div>
  );
}
