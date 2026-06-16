"use client";

import { useEffect } from "react";

import { parseSavedSession, serializeSession, SESSION_STORAGE_KEY, type SavedSession } from "../lib/session";

type SessionState = Omit<SavedSession, "version">;

/**
 * Restores a saved game once on mount and persists the board to localStorage
 * whenever the tracked state changes, so a refresh never loses progress.
 */
export function useSessionPersistence(state: SessionState, onRestore: (saved: SavedSession) => void) {
  useEffect(() => {
    let saved: SavedSession | null;
    try {
      saved = parseSavedSession(window.localStorage.getItem(SESSION_STORAGE_KEY));
    } catch {
      return;
    }
    if (saved) {
      onRestore(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SESSION_STORAGE_KEY, serializeSession(state));
    } catch {
      // Storage may be unavailable (private mode, quota); play without saving.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.grid,
    state.marks,
    state.givenMask,
    state.phase,
    state.selectedIndex,
    state.lowConfidence,
    state.elapsedSeconds,
    state.hintsUsed,
    state.checksUsed,
    state.techniqueNames
  ]);
}
