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
});
