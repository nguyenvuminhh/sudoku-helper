"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { SupabaseAccountState } from "./useSupabaseAccount";
import {
  buildSolveRecordInput,
  type LeaderboardDifficulty
} from "../lib/leaderboard";
import {
  fetchDifficultyLeaderboard,
  fetchPersonalStats,
  saveSolveRecord,
  type LeaderboardRow,
  type PersonalStats,
  type SupabaseSolveClient
} from "../lib/supabase-repository";
import { createBrowserSupabaseClient } from "../lib/supabase";
import type { GivenMask, SudokuGrid } from "../lib/sudoku-state";

export type SolveMetadata = {
  completionKey: string;
  givensGrid: SudokuGrid;
  givenMask: GivenMask;
  difficulty: LeaderboardDifficulty;
  elapsedSeconds: number;
  hintsUsed: number;
  checksUsed: number;
  techniques: string[];
};

export type SolveSaveStatus = "idle" | "saving" | "saved" | "error" | "unavailable";

export type SolveRecordsState = {
  saveStatus: SolveSaveStatus;
  saveMessage: string;
  saveError: string | null;
  leaderboardDifficulty: LeaderboardDifficulty;
  leaderboardRows: LeaderboardRow[];
  leaderboardLoading: boolean;
  leaderboardError: string | null;
  personalStats: PersonalStats | null;
  setLeaderboardDifficulty: (difficulty: LeaderboardDifficulty) => void;
  retrySave: () => void;
  refreshLeaderboard: () => Promise<void>;
};

export function useSolveRecords({
  account,
  solveMetadata
}: {
  account: SupabaseAccountState;
  solveMetadata: SolveMetadata | null;
}): SolveRecordsState {
  const clientRef = useRef<SupabaseSolveClient | null>(null);
  const savedKeysRef = useRef(new Set<string>());
  const savingKeyRef = useRef<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SolveSaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [leaderboardDifficulty, setLeaderboardDifficulty] = useState<LeaderboardDifficulty>(
    solveMetadata?.difficulty ?? "custom"
  );
  const [leaderboardRows, setLeaderboardRows] = useState<LeaderboardRow[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [personalStats, setPersonalStats] = useState<PersonalStats | null>(null);

  useEffect(() => {
    clientRef.current = createBrowserSupabaseClient() as SupabaseSolveClient | null;
  }, []);

  useEffect(() => {
    if (solveMetadata) {
      setLeaderboardDifficulty(solveMetadata.difficulty);
    }
  }, [solveMetadata?.difficulty]);

  const refreshLeaderboard = useCallback(async () => {
    const client = clientRef.current;
    if (!client) {
      setLeaderboardRows([]);
      setPersonalStats(null);
      setLeaderboardError("Leaderboard unavailable until Supabase is configured.");
      return;
    }

    setLeaderboardLoading(true);
    setLeaderboardError(null);
    try {
      const rows = await fetchDifficultyLeaderboard(client, leaderboardDifficulty, 20);
      setLeaderboardRows(rows);
      const user = account.user;
      if (user) {
        setPersonalStats(await fetchPersonalStats(client, user.id, leaderboardDifficulty));
      } else {
        setPersonalStats(null);
      }
    } catch (cause) {
      setLeaderboardError(cause instanceof Error ? cause.message : "Leaderboard could not be loaded.");
    } finally {
      setLeaderboardLoading(false);
    }
  }, [account.user, leaderboardDifficulty]);

  useEffect(() => {
    void refreshLeaderboard();
  }, [refreshLeaderboard]);

  useEffect(() => {
    const metadata = solveMetadata;
    if (!metadata) {
      setSaveStatus("idle");
      setSaveError(null);
      return;
    }

    const key = metadata.completionKey;
    if (savedKeysRef.current.has(key) || savingKeyRef.current === key) {
      return;
    }

    const client = clientRef.current;
    if (!client) {
      setSaveStatus("unavailable");
      setSaveError("Supabase is not configured.");
      return;
    }
    const activeClient: SupabaseSolveClient = client;
    const activeMetadata: SolveMetadata = metadata;

    let cancelled = false;
    savingKeyRef.current = key;
    setSaveStatus("saving");
    setSaveError(null);

    async function save() {
      try {
        const user = account.user ?? (await account.ensureAccount());
        if (!user) {
          throw new Error("Guest session could not be started.");
        }
        const record = await buildSolveRecordInput({
          userId: user.id,
          givensGrid: activeMetadata.givensGrid,
          givenMask: activeMetadata.givenMask,
          difficulty: activeMetadata.difficulty,
          elapsedSeconds: activeMetadata.elapsedSeconds,
          hintsUsed: activeMetadata.hintsUsed,
          checksUsed: activeMetadata.checksUsed,
          techniques: activeMetadata.techniques
        });
        await saveSolveRecord(activeClient, record);
        if (cancelled) {
          return;
        }
        savedKeysRef.current.add(key);
        setSaveStatus("saved");
        await refreshLeaderboard();
      } catch (cause) {
        if (!cancelled) {
          setSaveStatus("error");
          setSaveError(cause instanceof Error ? cause.message : "Solve could not be saved.");
        }
      } finally {
        if (savingKeyRef.current === key) {
          savingKeyRef.current = null;
        }
      }
    }

    void save();
    return () => {
      cancelled = true;
    };
  }, [account.ensureAccount, account.user, refreshLeaderboard, retryToken, solveMetadata?.completionKey]);

  const saveMessage = useMemo(() => {
    if (saveStatus === "saving") {
      return "Saving to leaderboard...";
    }
    if (saveStatus === "saved") {
      return "Saved to leaderboard.";
    }
    if (saveStatus === "error") {
      return saveError ?? "Solve could not be saved.";
    }
    if (saveStatus === "unavailable") {
      return "Leaderboard unavailable until Supabase is configured.";
    }
    return "";
  }, [saveError, saveStatus]);

  return {
    saveStatus,
    saveMessage,
    saveError,
    leaderboardDifficulty,
    leaderboardRows,
    leaderboardLoading,
    leaderboardError,
    personalStats,
    setLeaderboardDifficulty,
    retrySave: () => setRetryToken((value) => value + 1),
    refreshLeaderboard
  };
}
