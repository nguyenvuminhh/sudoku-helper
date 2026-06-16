"use client";

import { ChevronRight, History, Keyboard, Lightbulb, Loader2, Settings as SettingsIcon, Trophy } from "lucide-react";
import { useEffect, useState } from "react";

import type { Settings } from "../hooks/useSettings";
import type { SolveRecordsState } from "../hooks/useSolveRecords";
import type { HintResponse } from "../lib/api";
import { HintPanel } from "./HintPanel";
import { HistoryPanel } from "./HistoryPanel";
import { LeaderboardPanel } from "./LeaderboardPanel";
import { SettingsPanel } from "./SettingsPanel";
import { ShortcutsPanel } from "./ShortcutsPanel";
import { StatusPanel } from "./StatusPanel";

type Row = "history" | "leaderboard" | "settings" | "shortcuts";

export function SolvingPanel({
  statusMessages,
  busyLabel,
  currentHint,
  canApplyCurrentHint,
  filledCount,
  isValid,
  hintReady,
  history,
  leaderboard,
  leaderboardOpenToken,
  settings,
  onApplyHint,
  onHint,
  onSettingChange
}: {
  statusMessages: string[];
  busyLabel: string | null;
  currentHint: HintResponse | null;
  canApplyCurrentHint: boolean;
  filledCount: number;
  isValid: boolean;
  hintReady: boolean;
  history: HintResponse[];
  leaderboard: SolveRecordsState;
  leaderboardOpenToken: number;
  settings: Settings;
  onApplyHint: () => void;
  onHint: () => void;
  onSettingChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}) {
  const [open, setOpen] = useState<Row | null>(null);
  const toggle = (row: Row) => setOpen((current) => (current === row ? null : row));

  useEffect(() => {
    if (leaderboardOpenToken > 0) {
      setOpen("leaderboard");
    }
  }, [leaderboardOpenToken]);

  return (
    <div className="panel">
      <StatusPanel busyLabel={busyLabel} messages={statusMessages} />

      <HintPanel canApplyHint={canApplyCurrentHint} hint={currentHint} onApplyHint={onApplyHint} />

      <button
        type="button"
        className="btn primary full"
        onClick={onHint}
        disabled={Boolean(busyLabel) || filledCount === 0 || !isValid || !hintReady}
      >
        {busyLabel === "Finding hint" || !hintReady ? (
          <Loader2 className="spin" size={17} />
        ) : (
          <Lightbulb size={17} />
        )}
        <span>{hintReady ? "Get a hint" : "Loading hint engine…"}</span>
      </button>

      <div className="disclosure">
        <section className="disc-section">
          <button
            type="button"
            className="disc-row"
            aria-expanded={open === "history"}
            onClick={() => toggle("history")}
          >
            <span className="disc-l">
              <History size={15} />
              Hint history
            </span>
            <span className="disc-r">
              {history.length > 0 ? <span className="disc-c">{history.length}</span> : null}
              <ChevronRight className="disc-chevron" size={15} />
            </span>
          </button>
          {open === "history" ? (
            <div className="disc-body">
              <HistoryPanel history={history} />
            </div>
          ) : null}
        </section>

        <section className="disc-section">
          <button
            type="button"
            className="disc-row"
            aria-expanded={open === "leaderboard"}
            onClick={() => toggle("leaderboard")}
          >
            <span className="disc-l">
              <Trophy size={15} />
              Leaderboard
            </span>
            <span className="disc-r">
              {leaderboard.leaderboardRows.length > 0 ? (
                <span className="disc-c">{leaderboard.leaderboardRows.length}</span>
              ) : null}
              <ChevronRight className="disc-chevron" size={15} />
            </span>
          </button>
          {open === "leaderboard" ? (
            <div className="disc-body">
              <LeaderboardPanel state={leaderboard} />
            </div>
          ) : null}
        </section>

        <section className="disc-section">
          <button
            type="button"
            className="disc-row"
            aria-expanded={open === "settings"}
            onClick={() => toggle("settings")}
          >
            <span className="disc-l">
              <SettingsIcon size={15} />
              Settings
            </span>
            <span className="disc-r">
              <ChevronRight className="disc-chevron" size={15} />
            </span>
          </button>
          {open === "settings" ? (
            <div className="disc-body">
              <SettingsPanel settings={settings} onSettingChange={onSettingChange} />
            </div>
          ) : null}
        </section>

        <section className="disc-section">
          <button
            type="button"
            className="disc-row"
            aria-expanded={open === "shortcuts"}
            onClick={() => toggle("shortcuts")}
          >
            <span className="disc-l">
              <Keyboard size={15} />
              Shortcuts
            </span>
            <span className="disc-r">
              <ChevronRight className="disc-chevron" size={15} />
            </span>
          </button>
          {open === "shortcuts" ? (
            <div className="disc-body">
              <ShortcutsPanel />
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
