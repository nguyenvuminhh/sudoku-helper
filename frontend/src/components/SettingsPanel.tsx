"use client";

import { FastForward, Hash } from "lucide-react";

import type { Settings } from "../hooks/useSettings";
import { SwitchRow } from "./SwitchRow";

export function SettingsPanel({
  settings,
  onSettingChange
}: {
  settings: Settings;
  onSettingChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}) {
  return (
    <div className="settings-list">
      <SwitchRow
        active={settings.showRemainingCounts}
        icon={<Hash size={16} />}
        label="Show remaining digit counts"
        onClick={() => onSettingChange("showRemainingCounts", !settings.showRemainingCounts)}
      />
      <SwitchRow
        active={settings.autoAdvanceDigit}
        icon={<FastForward size={16} />}
        label="Auto-advance quick fill digit"
        onClick={() => onSettingChange("autoAdvanceDigit", !settings.autoAdvanceDigit)}
      />
    </div>
  );
}
