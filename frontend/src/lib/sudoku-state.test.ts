import { describe, expect, it } from "vitest";

import {
  applyOcrCells,
  applyHintEliminationsToNotes,
  createBoardSnapshot,
  collectMatchingDigitHighlights,
  createEmptyNotes,
  createEmptyGrid,
  createGivenMask,
  findNextInputIndex,
  gridToPayload,
  parsePuzzleText,
  quickFillNotes,
  removeAllNotes,
  resolveKeyboardInput,
  restoreUndoSnapshot,
  notesToCandidatePayload,
  pushUndoSnapshot,
  setCellValue,
  setCellValueWithNotes,
  toggleCellNote,
  validateSudokuGrid
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

  it("recomputes candidates locally after a cell changes", () => {
    let grid = createEmptyGrid();
    grid = setCellValue(grid, 0, 1);

    expect(validateSudokuGrid(grid).candidates["1"]).not.toContain(1);
    expect(validateSudokuGrid(grid).candidates["1"]).toContain(2);

    grid = setCellValue(grid, 0, 2);

    expect(validateSudokuGrid(grid).candidates["1"]).toContain(1);
    expect(validateSudokuGrid(grid).candidates["1"]).not.toContain(2);
  });

  it("detects row column and box conflicts locally", () => {
    let grid = createEmptyGrid();
    grid = setCellValue(grid, 0, 7);
    grid = setCellValue(grid, 1, 7);
    grid = setCellValue(grid, 9, 7);

    const validation = validateSudokuGrid(grid);

    expect(validation.valid).toBe(false);
    expect(validation.candidates).toEqual({});
    expect(validation.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ unit: "row", unitNumber: 1, digit: 7 }),
        expect.objectContaining({ unit: "col", unitNumber: 1, digit: 7 }),
        expect.objectContaining({ unit: "box", unitNumber: 1, digit: 7 })
      ])
    );
  });

  it("quick-fills notes from current candidates and skips filled cells", () => {
    let grid = createEmptyGrid();
    grid = setCellValue(grid, 0, 1);
    grid = setCellValue(grid, 9, 2);
    grid = setCellValue(grid, 10, 3);

    const notes = quickFillNotes(grid);

    expect(notes).toHaveLength(81);
    expect(notes[0]).toEqual([]);
    expect(notes[1]).toEqual([4, 5, 6, 7, 8, 9]);
  });

  it("removes all notes without changing the grid", () => {
    let grid = createEmptyGrid();
    grid = setCellValue(grid, 0, 1);

    const notes = removeAllNotes(quickFillNotes(grid));

    expect(grid[0]).toBe(1);
    expect(notes.every((cellNotes) => cellNotes.length === 0)).toBe(true);
  });

  it("adds and removes a single note on an empty cell", () => {
    let grid = createEmptyGrid();
    grid = setCellValue(grid, 0, 9);
    let notes = createEmptyNotes();

    notes = toggleCellNote(notes, grid, 1, 5);
    notes = toggleCellNote(notes, grid, 1, 2);
    expect(notes[1]).toEqual([2, 5]);

    notes = toggleCellNote(notes, grid, 1, 5);
    notes = toggleCellNote(notes, grid, 0, 5);

    expect(notes[1]).toEqual([2]);
    expect(notes[0]).toEqual([]);
  });

  it("filling a cell prunes notes without adding missing notes", () => {
    const grid = createEmptyGrid();
    const notes = createEmptyNotes();
    notes[0] = [1, 2];
    notes[1] = [1, 4];
    notes[9] = [1, 5];
    notes[40] = [1, 6];

    const result = setCellValueWithNotes(grid, notes, 0, 1);

    expect(result.grid[0]).toBe(1);
    expect(result.notes[0]).toEqual([]);
    expect(result.notes[1]).toEqual([4]);
    expect(result.notes[9]).toEqual([5]);
    expect(result.notes[40]).toEqual([1, 6]);
  });

  it("captures filled cells as givens for the solving phase", () => {
    let grid = createEmptyGrid();
    grid = setCellValue(grid, 0, 8);
    grid = setCellValue(grid, 80, 4);

    const givens = createGivenMask(grid);

    expect(givens[0]).toBe(true);
    expect(givens[1]).toBe(false);
    expect(givens[80]).toBe(true);
  });

  it("collects matching filled cells and notes for one active digit", () => {
    let grid = createEmptyGrid();
    grid = setCellValue(grid, 0, 5);
    grid = setCellValue(grid, 10, 5);
    grid = setCellValue(grid, 80, 8);
    const notes = createEmptyNotes();
    notes[1] = [2, 5];
    notes[2] = [4];
    notes[79] = [5, 9];

    const highlights = collectMatchingDigitHighlights(grid, notes, 5);

    expect(highlights.valueIndexes).toEqual([0, 10]);
    expect(highlights.noteIndexes).toEqual([1, 79]);
  });

  it("applies hint eliminations by removing those candidate notes", () => {
    const grid = parsePuzzleText(
      "000010020" +
        "108267304" +
        "623000000" +
        "900026000" +
        "200000003" +
        "000590201" +
        "000030708" +
        "301970400" +
        "070050030"
    );
    const notes = quickFillNotes(grid);

    const nextNotes = applyHintEliminationsToNotes(grid, notes, [
      { cell: { row: 1, col: 4 }, digit: 4 },
      { cell: { row: 1, col: 6 }, digit: 4 }
    ]);

    expect(notes[3]).toContain(4);
    expect(notes[5]).toContain(4);
    expect(nextNotes[3]).not.toContain(4);
    expect(nextNotes[3]).toEqual([3, 8]);
    expect(nextNotes[5]).not.toContain(4);
    expect(nextNotes[5]).toEqual([3, 5, 8, 9]);
  });

  it("serializes notes as candidate payload while filling unnoted empty cells from grid candidates", () => {
    const grid = parsePuzzleText("1" + "0".repeat(80));
    const notes = createEmptyNotes();
    notes[1] = [2, 3];

    const payload = notesToCandidatePayload(grid, notes);

    expect(payload?.["1"]).toEqual([2, 3]);
    expect(payload?.["2"]).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(payload?.["0"]).toBeUndefined();
  });

  it("stores and restores undo snapshots without sharing mutable board arrays", () => {
    const grid = setCellValue(createEmptyGrid(), 0, 5);
    const notes = createEmptyNotes();
    notes[1] = [2, 3];
    const lowConfidence = [8];

    const stack = pushUndoSnapshot([], createBoardSnapshot(grid, notes, 1, lowConfidence));
    grid[0] = 9;
    notes[1].push(4);
    lowConfidence.push(9);

    const restored = restoreUndoSnapshot(stack);

    expect(restored.snapshot?.grid[0]).toBe(5);
    expect(restored.snapshot?.notes[1]).toEqual([2, 3]);
    expect(restored.snapshot?.selectedIndex).toBe(1);
    expect(restored.snapshot?.lowConfidence).toEqual([8]);
    expect(restored.stack).toEqual([]);
  });

  it("limits undo snapshots to the newest board states", () => {
    const oldest = createBoardSnapshot(setCellValue(createEmptyGrid(), 0, 1), createEmptyNotes(), 0, []);
    const middle = createBoardSnapshot(setCellValue(createEmptyGrid(), 1, 2), createEmptyNotes(), 1, []);
    const newest = createBoardSnapshot(setCellValue(createEmptyGrid(), 2, 3), createEmptyNotes(), 2, []);

    let stack = pushUndoSnapshot([], oldest, 2);
    stack = pushUndoSnapshot(stack, middle, 2);
    stack = pushUndoSnapshot(stack, newest, 2);

    expect(stack.map((snapshot) => snapshot.selectedIndex)).toEqual([2, 1]);
  });
});
