"use client";

import { Medal, RefreshCw } from "lucide-react";

import type { SolveRecordsState } from "../hooks/useSolveRecords";
import { GENERATED_LEVELS } from "../lib/constants";
import { formatLeaderboardTime, type LeaderboardDifficulty } from "../lib/leaderboard";

const DIFFICULTIES: Array<{ id: LeaderboardDifficulty; label: string }> = [
  ...GENERATED_LEVELS,
  { id: "custom", label: "Custom" }
];

export function LeaderboardPanel({ state }: { state: SolveRecordsState }) {
  const currentLabel = DIFFICULTIES.find((difficulty) => difficulty.id === state.leaderboardDifficulty)?.label ?? "Custom";

  return (
    <div className="leaderboard-panel">
      <div className="leaderboard-head">
        <div>
          <span className="mini-label">Difficulty</span>
          <strong>{currentLabel} leaderboard</strong>
        </div>
        <button type="button" className="icon-btn" aria-label="Refresh leaderboard" onClick={() => void state.refreshLeaderboard()}>
          <RefreshCw size={15} />
        </button>
      </div>

      <select
        className="leaderboard-select"
        aria-label="Leaderboard difficulty"
        value={state.leaderboardDifficulty}
        onChange={(event) => state.setLeaderboardDifficulty(event.target.value as LeaderboardDifficulty)}
      >
        {DIFFICULTIES.map((difficulty) => (
          <option key={difficulty.id} value={difficulty.id}>
            {difficulty.label}
          </option>
        ))}
      </select>

      {state.personalStats ? (
        <div className="stat-strip">
          <span>{state.personalStats.completedSolves} solved</span>
          <span>
            Best {state.personalStats.bestTimeSeconds === null ? "no time yet" : formatLeaderboardTime(state.personalStats.bestTimeSeconds)}
          </span>
        </div>
      ) : null}

      {state.leaderboardError ? <p className="leaderboard-error">{state.leaderboardError}</p> : null}

      <ol className="leaderboard-list" aria-label={`${currentLabel} leaderboard rows`}>
        {state.leaderboardRows.map((row) => (
          <li key={`${row.rank}-${row.profileId}-${row.completedAt}`} className="leaderboard-row">
            <span className="rank">
              <Medal size={14} />
              {row.rank}
            </span>
            <span className="who">{row.displayName}</span>
            <span className="time">{formatLeaderboardTime(row.elapsedSeconds)}</span>
            <span className="meta">
              {row.hintsUsed} hints · {row.checksUsed} checks
            </span>
          </li>
        ))}
      </ol>

      {!state.leaderboardLoading && state.leaderboardRows.length === 0 && !state.leaderboardError ? (
        <p className="empty-leaderboard">No solves recorded for this difficulty yet.</p>
      ) : null}
    </div>
  );
}
