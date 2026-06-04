import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf-8");

describe("sudoku tutor layout source", () => {
  it("does not render the 81-character paste import strip", () => {
    expect(pageSource).not.toContain("pasteText");
    expect(pageSource).not.toContain("import-strip");
    expect(pageSource).not.toContain("Paste 81");
  });

  it("places action controls in the right rail before the strategy note", () => {
    const actionsPanel = pageSource.indexOf('className="actions-panel"');
    const strategyPanel = pageSource.indexOf('className="status-panel"');

    expect(actionsPanel).toBeGreaterThan(-1);
    expect(strategyPanel).toBeGreaterThan(actionsPanel);
  });

  it("groups controls into game and hint sections without a validate button", () => {
    const gameGroup = pageSource.indexOf('aria-label="Game controls"');
    const hintGroup = pageSource.indexOf('aria-label="Hint controls"');

    expect(gameGroup).toBeGreaterThan(-1);
    expect(hintGroup).toBeGreaterThan(gameGroup);
    expect(pageSource).not.toContain("handleValidate");
    expect(pageSource).not.toContain(">Validate<");
  });

  it("previews place hints on the board before applying them", () => {
    expect(pageSource).toContain("hintPreview");
    expect(pageSource).toContain("hint-preview");
    expect(pageSource).toContain("hint-preview-value");
  });

  it("keeps hint placement behind an explicit apply button", () => {
    const hintGroup = pageSource.indexOf('aria-label="Hint controls"');
    const applyHandler = pageSource.indexOf("handleApplyHint");
    const applyButton = pageSource.indexOf("onClick={handleApplyHint}");
    const applyLabel = pageSource.indexOf("Apply", applyButton);

    expect(applyHandler).toBeGreaterThan(-1);
    expect(applyButton).toBeGreaterThan(hintGroup);
    expect(applyLabel).toBeGreaterThan(hintGroup);
  });
});
