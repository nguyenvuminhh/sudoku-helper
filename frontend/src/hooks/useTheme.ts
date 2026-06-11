"use client";

import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    // The inline script in layout.tsx has already applied the theme to the
    // document; mirror it into React state so the toggle reflects reality.
    const applied = document.documentElement.dataset.theme;
    setTheme(applied === "dark" ? "dark" : "light");
  }, []);

  function toggleTheme() {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      window.localStorage.setItem("sudoku-theme", next);
      return next;
    });
  }

  return { theme, toggleTheme };
}
