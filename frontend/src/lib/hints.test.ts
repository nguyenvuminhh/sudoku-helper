import { describe, expect, it } from "vitest";

import type { GeneratedPuzzleResponse, HintResponse } from "./api";
import {
  checkResultMessage,
  collectConflictIndexes,
  collectHintCells,
  collectHintPreview,
  generatedPuzzleMessage
} from "./hints";
import { createEmptyGrid, type ValidationConflict } from "./sudoku-state";

function makeHint(overrides: Partial<HintResponse> = {}): HintResponse {
  return {
    technique: { id: "naked_single", name: "Naked Single", rank: 1 },
    action: { type: "place", cell: { row: 1, col: 1 }, digit: 5, eliminations: [] },
    summary: "R1C1 must be 5.",
    explanation: ["Only 5 fits."],
    highlights: {
      primary_cells: [{ row: 1, col: 1 }],
      related_cells: [{ row: 1, col: 2 }],
      eliminations: [{ cell: { row: 2, col: 1 }, digit: 5 }]
    },
    ...overrides
  };
}

describe("collectConflictIndexes", () => {
  it("flattens conflict cells into a set of board indexes", () => {
    const conflicts: ValidationConflict[] = [
      { unit: "row", unitNumber: 1, digit: 4, cells: [{ row: 1, col: 1 }, { row: 1, col: 9 }] }
    ];
    expect(Array.from(collectConflictIndexes(conflicts)).sort((a, b) => a - b)).toEqual([0, 8]);
  });

  it("returns an empty set without conflicts", () => {
    expect(collectConflictIndexes([]).size).toBe(0);
  });
});

describe("collectHintCells", () => {
  it("maps primary, related, and elimination cells to indexes", () => {
    const hint = makeHint();
    expect(collectHintCells(hint, "primary").has(0)).toBe(true);
    expect(collectHintCells(hint, "related").has(1)).toBe(true);
    expect(collectHintCells(hint, "elimination").has(9)).toBe(true);
  });

  it("returns empty sets for a missing hint", () => {
    expect(collectHintCells(null, "primary").size).toBe(0);
  });
});

describe("collectHintPreview", () => {
  it("returns the placement target for a place hint on an empty cell", () => {
    expect(collectHintPreview(makeHint(), createEmptyGrid())).toEqual({ index: 0, digit: 5 });
  });

  it("returns null when the target cell is already filled", () => {
    const grid = createEmptyGrid();
    grid[0] = 5;
    expect(collectHintPreview(makeHint(), grid)).toBeNull();
  });

  it("returns null for eliminate hints", () => {
    const hint = makeHint({ action: { type: "eliminate", eliminations: [{ cell: { row: 1, col: 1 }, digit: 5 }] } });
    expect(collectHintPreview(hint, createEmptyGrid())).toBeNull();
  });
});

describe("checkResultMessage", () => {
  it("describes each check status", () => {
    expect(checkResultMessage({ status: "solved", incorrectIndexes: [] })).toContain("Solved");
    expect(checkResultMessage({ status: "incorrect", incorrectIndexes: [3] })).toContain("1 wrong number");
    expect(checkResultMessage({ status: "incorrect", incorrectIndexes: [3, 4] })).toContain("2 wrong numbers");
    expect(checkResultMessage({ status: "unsolvable", incorrectIndexes: [] })).toContain("no valid solution");
    expect(checkResultMessage({ status: "incomplete", incorrectIndexes: [] })).toContain("No mistakes so far");
  });
});

describe("generatedPuzzleMessage", () => {
  it("summarizes the generated puzzle metadata", () => {
    const generated = {
      puzzle: "0".repeat(81),
      solution: "1".repeat(81),
      level: { id: "hard", name: "Hard", description: "", techniques: [] },
      requested_level: { id: "medium", name: "Medium", description: "", techniques: [] },
      se_rating: 2.5,
      techniques: [],
      technique_profile: {},
      attribution: { name: "Ukodus", url: "", license: "", copyright: "" }
    } satisfies GeneratedPuzzleResponse;

    const message = generatedPuzzleMessage(generated);
    expect(message).toContain("Generated Medium puzzle");
    expect(message).toContain("Rated Hard");
    expect(message).toContain("SE 2.5");
    expect(message).toContain("Ukodus");
  });
});
