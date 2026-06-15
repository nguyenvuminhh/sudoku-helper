import { describe, expect, it } from "vitest";

import { gridToPayload, parsePuzzleText } from "./sudoku-state";
import { decodePuzzleParam, encodePuzzleParam } from "./share-codec";

const PUZZLE = "530070000600195000098000060800060003400803001700020006060000280000419005000080079";
const SOLUTION = "534678912672195348198342567859761423426853791713924856961537284287419635345286179";

describe("share-codec", () => {
  it("round-trips a sparse Sudoku puzzle through a compact mask code", () => {
    const code = encodePuzzleParam(parsePuzzleText(PUZZLE));

    expect(code[0]).toBe("m");
    expect(code).toMatch(/^[0-9A-Za-z_-]+$/);
    expect(code.length).toBeLessThan(40);
    expect(gridToPayload(decodePuzzleParam(code))).toBe(PUZZLE);
  });

  it("preserves leading empty cells and digit codes that start with zero", () => {
    const puzzle = `${"0".repeat(10)}1${"0".repeat(69)}9`;
    const code = encodePuzzleParam(parsePuzzleText(puzzle));

    expect(code[0]).toBe("m");
    expect(gridToPayload(decodePuzzleParam(code))).toBe(puzzle);
  });

  it("uses the dense fallback for full grids when it is shorter than the mask code", () => {
    const code = encodePuzzleParam(parsePuzzleText(SOLUTION));

    expect(code[0]).toBe("b");
    expect(code.length).toBeLessThan(50);
    expect(gridToPayload(decodePuzzleParam(code))).toBe(SOLUTION);
  });

  it("rejects malformed share params", () => {
    expect(() => decodePuzzleParam("")).toThrow(/share link/i);
    expect(() => decodePuzzleParam("xabc")).toThrow(/share link/i);
    expect(() => decodePuzzleParam("m!")).toThrow(/share link/i);
  });
});
