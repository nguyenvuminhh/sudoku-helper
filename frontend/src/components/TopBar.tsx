"use client";

import { Moon, Sun } from "lucide-react";

import type { Theme } from "../hooks/useTheme";

export function TopBar({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  return (
    <header className="top" aria-label="Sudoku tutor header">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">Sudoku strategy desk</span>
      </div>
      <button
        type="button"
        className="theme-pill"
        onClick={onToggleTheme}
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        {theme === "dark" ? <Moon size={15} /> : <Sun size={15} />}
        <span>{theme === "dark" ? "Dark" : "Light"}</span>
      </button>
    </header>
  );
}
