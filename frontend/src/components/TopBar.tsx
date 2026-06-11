"use client";

import { Moon, Sun } from "lucide-react";

import type { Theme } from "../hooks/useTheme";

export function TopBar({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  return (
    <section className="topbar" aria-label="Sudoku tutor header">
      <div>
        <p className="eyebrow">Puzzle Hint</p>
        <h1>Sudoku strategy desk</h1>
      </div>
      <button
        type="button"
        className="theme-toggle"
        onClick={onToggleTheme}
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        {theme === "dark" ? "Light" : "Dark"}
      </button>
    </section>
  );
}
