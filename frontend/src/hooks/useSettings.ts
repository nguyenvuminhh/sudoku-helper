"use client";

import { useEffect, useState } from "react";

export const SETTINGS_STORAGE_KEY = "sudoku-settings-v1";

export type Settings = {
  /** Show how many of each digit are still missing on the keypad. */
  showRemainingCounts: boolean;
  /** Jump quick fill to the next incomplete digit when one is finished. */
  autoAdvanceDigit: boolean;
  /** Check value entries against the puzzle solution as they are placed. */
  autoCheck: boolean;
};

const DEFAULT_SETTINGS: Settings = {
  showRemainingCounts: true,
  autoAdvanceDigit: true,
  autoCheck: false
};

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const stored = JSON.parse(raw) as Partial<Settings>;
      setSettings({
        showRemainingCounts:
          typeof stored.showRemainingCounts === "boolean" ? stored.showRemainingCounts : DEFAULT_SETTINGS.showRemainingCounts,
        autoAdvanceDigit:
          typeof stored.autoAdvanceDigit === "boolean" ? stored.autoAdvanceDigit : DEFAULT_SETTINGS.autoAdvanceDigit,
        autoCheck: typeof stored.autoCheck === "boolean" ? stored.autoCheck : DEFAULT_SETTINGS.autoCheck
      });
    } catch {
      // Ignore corrupt settings and keep defaults.
    }
  }, []);

  function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((current) => {
      const next = { ...current, [key]: value };
      try {
        window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Storage may be unavailable; keep the in-memory value.
      }
      return next;
    });
  }

  return { settings, setSetting };
}
