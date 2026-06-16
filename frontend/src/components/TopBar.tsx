"use client";

import { Moon, Sun } from "lucide-react";

import type { Theme } from "../hooks/useTheme";
import type { SupabaseAccountState } from "../hooks/useSupabaseAccount";
import { AccountMenu } from "./AccountMenu";

export function TopBar({
  theme,
  account,
  onToggleTheme
}: {
  theme: Theme;
  account: SupabaseAccountState;
  onToggleTheme: () => void;
}) {
  return (
    <header className="top" aria-label="Sudoku tutor header">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">Sudoku strategy desk</span>
      </div>
      <div className="top-actions">
        <AccountMenu account={account} />
        <button
          type="button"
          className="theme-pill"
          onClick={onToggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Moon size={15} /> : <Sun size={15} />}
          <span>{theme === "dark" ? "Dark" : "Light"}</span>
        </button>
      </div>
    </header>
  );
}
