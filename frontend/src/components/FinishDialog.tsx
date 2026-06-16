"use client";

import { CloudOff, Loader2, Lightbulb, ListChecks, PartyPopper, RotateCcw, Timer, Trophy, X } from "lucide-react";

import { formatElapsedSeconds } from "../lib/time";
import type { SolveSaveStatus } from "../hooks/useSolveRecords";

export type FinishStats = {
  elapsedSeconds: number;
  hintsUsed: number;
  checksUsed: number;
  givens: number;
  filledByYou: number;
  techniques: string[];
};

export function FinishDialog({
  stats,
  saveStatus = "idle",
  saveMessage = "",
  onRetrySave,
  onViewLeaderboard,
  onNewPuzzle,
  onClose
}: {
  stats: FinishStats;
  saveStatus?: SolveSaveStatus;
  saveMessage?: string;
  onRetrySave?: () => void;
  onViewLeaderboard?: () => void;
  onNewPuzzle: () => void;
  onClose: () => void;
}) {
  return (
    <div className="finish-backdrop" role="dialog" aria-modal="true" aria-label="Puzzle solved">
      <div className="finish-card">
        <div className="finish-header">
          <PartyPopper size={26} />
          <h2>Puzzle solved!</h2>
          <p>Every cell checks out. Here is how the solve went.</p>
        </div>
        <dl className="finish-stats">
          <div>
            <dt>
              <Timer size={15} />
              Time
            </dt>
            <dd>{formatElapsedSeconds(stats.elapsedSeconds)}</dd>
          </div>
          <div>
            <dt>
              <Lightbulb size={15} />
              Hints used
            </dt>
            <dd>{stats.hintsUsed}</dd>
          </div>
          <div>
            <dt>
              <ListChecks size={15} />
              Checks used
            </dt>
            <dd>{stats.checksUsed}</dd>
          </div>
          <div>
            <dt>Givens</dt>
            <dd>{stats.givens}</dd>
          </div>
          <div>
            <dt>Cells you filled</dt>
            <dd>{stats.filledByYou}</dd>
          </div>
        </dl>
        {stats.techniques.length > 0 ? (
          <div className="finish-techniques">
            <h3>Techniques from your hints</h3>
            <ul>
              {stats.techniques.map((technique) => (
                <li key={technique}>{technique}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {saveMessage ? (
          <div className={`finish-save ${saveStatus}`} role="status">
            {saveStatus === "saving" ? <Loader2 className="spin" size={16} /> : saveStatus === "unavailable" ? <CloudOff size={16} /> : <Trophy size={16} />}
            <span>{saveMessage}</span>
            {saveStatus === "error" && onRetrySave ? (
              <button type="button" onClick={onRetrySave}>
                Retry
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="finish-actions">
          <button type="button" className="primary" onClick={onNewPuzzle}>
            <RotateCcw size={17} />
            New puzzle
          </button>
          {onViewLeaderboard ? (
            <button type="button" onClick={onViewLeaderboard}>
              <Trophy size={17} />
              View leaderboard
            </button>
          ) : null}
          <button type="button" onClick={onClose}>
            <X size={17} />
            Keep the board
          </button>
        </div>
      </div>
    </div>
  );
}
