import { describe, expect, it } from "vitest";

import {
  applyOcrCells,
  createEmptyGrid,
  findNextInputIndex,
  gridToPayload,
  parsePuzzleText,
  resolveKeyboardInput,
  setCellValue
} from "./sudoku-state";

describe("sudoku-state", () => {
  it("parses zero and dot puzzle text into 81 cells", () => {
    const grid = parsePuzzleText("1" + ".".repeat(79) + "0");

    expect(grid).toHaveLength(81);
    expect(grid[0]).toBe(1);
    expect(grid[1]).toBe(null);
    expect(grid[80]).toBe(null);
  });

  it("serializes empty cells as zeroes for the API", () => {
    const grid = setCellValue(createEmptyGrid(), 40, 9);

    expect(gridToPayload(grid)).toHaveLength(81);
    expect(gridToPayload(grid)[40]).toBe("9");
    expect(gridToPayload(grid).replaceAll("0", "")).toBe("9");
  });

  it("applies OCR cells and reports low-confidence indexes", () => {
    const result = applyOcrCells(createEmptyGrid(), [
      { row: 1, col: 1, value: 7, confidence: 0.91 },
      { row: 9, col: 9, value: null, confidence: 0.12 }
    ]);

    expect(result.grid[0]).toBe(7);
    expect(result.grid[80]).toBe(null);
    expect(result.lowConfidence).toEqual([80]);
  });

  it("resolves digit keys and space as clear input", () => {
    expect(resolveKeyboardInput("7")).toBe(7);
    expect(resolveKeyboardInput(" ")).toBe(null);
    expect(resolveKeyboardInput("Backspace")).toBe(null);
    expect(resolveKeyboardInput("ArrowRight")).toBe("ignored");
  });

  it("auto-skips to the next empty cell after keyboard input", () => {
    const grid = setCellValue(setCellValue(createEmptyGrid(), 1, 4), 2, 6);

    expect(findNextInputIndex(grid, 0)).toBe(3);
    expect(findNextInputIndex(grid, 80)).toBe(0);
  });
});
