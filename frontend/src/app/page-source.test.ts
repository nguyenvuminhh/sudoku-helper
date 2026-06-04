import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf-8");
const globalStyles = readFileSync(new URL("./globals.css", import.meta.url), "utf-8");

describe("sudoku tutor layout source", () => {
  it("renders an 81-character puzzle loader with row-order instructions", () => {
    expect(pageSource).toContain("puzzleText");
    expect(pageSource).toContain("puzzle-loader");
    expect(pageSource).toContain("81 characters");
    expect(pageSource).toContain("0 for empty");
    expect(pageSource).toContain("left to right, top to bottom");
    expect(pageSource).toContain("handleLoadPuzzleText");
  });

  it("places action controls in the right rail before the strategy note", () => {
    const actionsPanel = pageSource.indexOf('className="actions-panel"');
    const strategyPanel = pageSource.indexOf('className="status-panel"');

    expect(actionsPanel).toBeGreaterThan(-1);
    expect(strategyPanel).toBeGreaterThan(actionsPanel);
  });

  it("uses phase-specific control groups without a validate button", () => {
    const loadingGroup = pageSource.indexOf('aria-label="Loading controls"');
    const solvingGroup = pageSource.indexOf('aria-label="Solving controls"');

    expect(loadingGroup).toBeGreaterThan(-1);
    expect(solvingGroup).toBeGreaterThan(loadingGroup);
    expect(pageSource).not.toContain("handleValidate");
    expect(pageSource).not.toContain(">Validate<");
  });

  it("replaces the candidate toggle with note controls", () => {
    expect(pageSource).not.toContain("showCandidates");
    expect(pageSource).not.toContain(">Candidates<");
    expect(pageSource).not.toContain("Enable editing notes");
    expect(pageSource).toContain("aria-checked={editingNotes}");
    expect(pageSource).toContain("aria-checked={quickFillMode}");
    expect(pageSource).toContain("Fill all notes");
    expect(pageSource).not.toContain("Quick fill notes");
    expect(pageSource).toContain("Remove all notes");
    expect(pageSource).toContain("handleToggleNote");
  });

  it("separates loading and solving phases with locked givens", () => {
    expect(pageSource).toContain("phase");
    expect(pageSource).toContain("loading");
    expect(pageSource).toContain("solving");
    expect(pageSource).toContain("Confirm");
    expect(pageSource).toContain("locked-given");
    expect(pageSource).toContain("givenMask");
  });

  it("shows loading-only controls and solving-only controls by phase", () => {
    expect(pageSource).toContain('aria-label="Loading controls"');
    expect(pageSource).toContain('aria-label="Solving controls"');
    expect(pageSource).toContain('phase === "loading" ?');
    expect(pageSource).toContain("Sample");
    expect(pageSource).toContain("Upload");
    expect(pageSource).toContain("Reset");
    expect(pageSource).toContain("Confirm");
  });

  it("supports quick fill mode with a locked digit and board-cell placement", () => {
    expect(pageSource).toContain("quickFillMode");
    expect(pageSource).toContain("quickFillDigit");
    expect(pageSource).toContain("Quick fill");
    expect(pageSource).toContain("handleCellClick");
    expect(pageSource).toContain("quick-fill-active");

    const quickFillBranch = pageSource.indexOf("if (quickFillMode)");
    const noteBranch = pageSource.indexOf("if (editingNotes && value !== null)");
    expect(quickFillBranch).toBeGreaterThan(-1);
    expect(noteBranch).toBeGreaterThan(quickFillBranch);
  });

  it("allows notes and quick fill to be active at the same time", () => {
    const cellClickBody = sourceBetween("function handleCellClick", "function handleToggleNote");
    const quickFillModeBody = sourceBetween("function handleQuickFillMode", "function handleToggleEditingNotes");
    const toggleNotesBody = sourceBetween("function handleToggleEditingNotes", "function handleQuickFillNotes");
    const fillNotesBody = sourceBetween("function handleQuickFillNotes", "function handleRemoveAllNotes");

    expect(cellClickBody).toContain("if (editingNotes)");
    expect(cellClickBody).toContain("toggleCellNote(currentNotes, grid, index, quickFillDigit)");
    expect(quickFillModeBody).not.toContain("setEditingNotes(false)");
    expect(toggleNotesBody).not.toContain("setQuickFillMode(false)");
    expect(toggleNotesBody).not.toContain("setQuickFillDigit(null)");
    expect(fillNotesBody).not.toContain("setQuickFillMode(false)");
    expect(fillNotesBody).not.toContain("setQuickFillDigit(null)");
  });

  it("lays out solving controls as switches, note actions, reset icon, and hint", () => {
    const controlsHeader = pageSource.indexOf('className="controls-header"');
    const resetIcon = pageSource.indexOf('className="reset-icon-button"', controlsHeader);
    const notesSwitch = pageSource.indexOf('aria-label="Notes"', resetIcon);
    const quickFillSwitch = pageSource.indexOf('aria-label="Quick fill"', notesSwitch);
    const noteActionRow = pageSource.indexOf('className="note-action-row"', quickFillSwitch);
    const fillAllNotes = pageSource.indexOf("Fill all notes", noteActionRow);
    const removeAllNotes = pageSource.indexOf("Remove all notes", fillAllNotes);
    const hintAction = pageSource.indexOf('className="primary hint-action"', removeAllNotes);

    expect(resetIcon).toBeGreaterThan(controlsHeader);
    expect(notesSwitch).toBeGreaterThan(resetIcon);
    expect(quickFillSwitch).toBeGreaterThan(notesSwitch);
    expect(fillAllNotes).toBeGreaterThan(noteActionRow);
    expect(removeAllNotes).toBeGreaterThan(fillAllNotes);
    expect(hintAction).toBeGreaterThan(removeAllNotes);
    expect(pageSource).toContain('role="switch"');
    expect(globalStyles).toContain(".switch-row");
    expect(globalStyles).toContain(".switch-track");
    expect(globalStyles).toContain(".reset-icon-button");
    expect(globalStyles).toContain(".note-action-row");
  });

  it("keeps switch and reset surfaces white while centering hint action content", () => {
    expect(globalStyles).toContain(".reset-icon-button {\n  background: var(--panel);");
    expect(globalStyles).toContain(".switch-row.active {\n  background: var(--panel);");
    expect(globalStyles).toContain(".action-grid .hint-action {\n  justify-content: center;");
  });

  it("uses single-row keypad and solving controls on mobile only", () => {
    const mobileStyles = globalStyles.slice(globalStyles.indexOf("@media (max-width: 620px)"));

    expect(mobileStyles).toContain(".keypad {\n    gap: 5px;\n    grid-template-columns: repeat(10, minmax(0, 1fr));");
    expect(mobileStyles).toContain(".control-stack {\n    grid-auto-flow: column;");
    expect(mobileStyles).toContain("overflow-x: auto;");
    expect(mobileStyles).toContain(".note-action-row {\n    display: contents;");
    expect(mobileStyles).toContain(".control-stack > button,");
    expect(mobileStyles).toContain("width: auto;");
  });

  it("highlights matching filled cells and note digits for the active number", () => {
    expect(pageSource).toContain("activeHighlightDigit");
    expect(pageSource).toContain("collectMatchingDigitHighlights");
    expect(pageSource).toContain("same-digit-cell");
    expect(pageSource).toContain("same-digit-note-cell");
    expect(pageSource).toContain("same-digit-note");
  });

  it("marks loaded cells without drawing extra grid borders", () => {
    expect(pageSource).toContain("locked-given");
    expect(globalStyles).not.toContain(".sudoku-cell.locked-given::before");
  });

  it("previews place hints on the board before applying them", () => {
    expect(pageSource).toContain("hintPreview");
    expect(pageSource).toContain("hint-preview");
    expect(pageSource).toContain("hint-preview-value");
  });

  it("keeps hint placement behind an explicit apply button in the next hint panel", () => {
    const hintPanelCall = pageSource.indexOf("<HintPanel");
    const applyHandler = pageSource.indexOf("handleApplyHint");
    const applyButton = pageSource.indexOf("onApplyHint={handleApplyHint}");
    const hintPanelDefinition = pageSource.indexOf("function HintPanel");
    const applyLabel = pageSource.indexOf("Apply", hintPanelDefinition);

    expect(applyHandler).toBeGreaterThan(-1);
    expect(applyButton).toBeGreaterThan(hintPanelCall);
    expect(applyLabel).toBeGreaterThan(hintPanelDefinition);
    expect(pageSource.indexOf("onClick={onApplyHint}")).toBeGreaterThan(hintPanelDefinition);
  });
});

function sourceBetween(start: string, end: string): string {
  const startIndex = pageSource.indexOf(start);
  const endIndex = pageSource.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThan(-1);
  expect(endIndex).toBeGreaterThan(startIndex);
  return pageSource.slice(startIndex, endIndex);
}
