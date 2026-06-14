"use client";

const KEYBOARD_SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ["1", "–", "9"], label: "Enter a digit, note, or color in the selected cells" },
  { keys: ["Space"], label: "Clear the selected cells" },
  { keys: ["↑", "↓", "←", "→"], label: "Move between cells (or W A S D)" },
  { keys: ["Shift", "↑↓←→"], label: "Extend the selection while moving" },
  { keys: ["Alt", "Click"], label: "Add or remove a cell from the selection (drag also selects)" },
  { keys: ["Enter"], label: "Apply the quick-fill digit to the selection" },
  { keys: ["Tab"], label: "Toggle between Normal and Note entry" },
  { keys: ["Z", "X", "C", "V"], label: "Jump to Normal, Corner, Center, or Color mode" },
  { keys: ["Ctrl", "Z"], label: "Undo the last board change" },
  { keys: ["Ctrl", "Y"], label: "Redo the last undone change" },
  { keys: ["P"], label: "Pause or resume the solve clock" }
];

export function ShortcutsPanel() {
  return (
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
  );
}
