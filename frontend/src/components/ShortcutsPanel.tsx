"use client";

import { Keyboard } from "lucide-react";

const KEYBOARD_SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ["1", "–", "9"], label: "Enter a digit in the selected cell" },
  { keys: ["Space"], label: "Clear the selected cell" },
  { keys: ["↑", "↓", "←", "→"], label: "Move between cells (or W A S D)" },
  { keys: ["Enter"], label: "Fill the selected cell with the quick-fill digit" },
  { keys: ["Tab"], label: "Toggle pencil (notes) mode" },
  { keys: ["Ctrl", "Z"], label: "Undo the last board change" }
];

export function ShortcutsPanel() {
  return (
    <div className="shortcuts-panel">
      <div className="panel-title">
        <Keyboard size={18} />
        <h2>Keyboard shortcuts</h2>
      </div>
      <dl className="shortcuts-list">
        {KEYBOARD_SHORTCUTS.map((shortcut) => (
          <div className="shortcut-row" key={shortcut.label}>
            <dt>
              {shortcut.keys.map((key, index) =>
                key === "–" ? (
                  <span className="shortcut-sep" key={`${shortcut.label}-sep-${index}`} aria-hidden="true">
                    –
                  </span>
                ) : (
                  <kbd key={`${shortcut.label}-${key}`}>{key}</kbd>
                )
              )}
            </dt>
            <dd>{shortcut.label}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
