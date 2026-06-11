"use client";

import { AlertTriangle, Brain, Grid3X3, Loader2 } from "lucide-react";

export function StatusPanel({ busyLabel, messages }: { busyLabel: string | null; messages: string[] }) {
  return (
    <div className="status-panel">
      <div className="panel-title">
        <Brain size={19} />
        <h2>Strategy note</h2>
      </div>
      {busyLabel ? (
        <p className="busy">
          <Loader2 className="spin" size={18} />
          {busyLabel}...
        </p>
      ) : null}
      <div className="messages">
        {messages.map((message, index) => (
          <p key={`${message}-${index}`}>
            {message.toLowerCase().includes("conflict") || message.toLowerCase().includes("failed") ? (
              <AlertTriangle size={16} />
            ) : (
              <Grid3X3 size={16} />
            )}
            {message}
          </p>
        ))}
      </div>
    </div>
  );
}
