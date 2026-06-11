import { describe, expect, it } from "vitest";

import {
  applyOcrCells,
  applyHintEliminationsToNotes,
  checkPuzzle,
  createBoardSnapshot,
  collectMatchingDigitHighlights,
  createEmptyMarks,
  createEmptyNotes,
  createEmptyGrid,
  createGivenMask,
  findNextCellWithValue,
  findNextInputIndex,
  gridToPayload,
  moveSelection,
  nextIncompleteDigit,
  resolveNavigationKey,
  parsePuzzleText,
  pruneEliminationsFromNotes,
  quickFillNotes,
  removeAllNotes,
  resolveKeyboardInput,
  restoreUndoSnapshot,
  notesToCandidatePayload,
  pushUndoSnapshot,
  setCellValue,
  setCellValueWithMarks,
  setCellValueWithNotes,
  solveSudoku,
  toggleCellNote,
  toggleColorOnCells,
  toggleNoteOnCells,
  validateSudokuGrid,
  type BoardMarks
} from "./sudoku-state";

const SOLVABLE_PUZZLE =
  "530070000600195000098000060800060003400803001700020006060000280000419005000080079";
const SOLVED_PUZZLE =
  "534678912672195348198342567859761423426853791713924856961537284287419635345286179";

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
    const marks = createEmptyMarks();
    marks.center[1] = [2, 3];
    marks.colors[2] = 4;
    const lowConfidence = [8];

    const stack = pushUndoSnapshot([], createBoardSnapshot(grid, marks, 1, lowConfidence));
    grid[0] = 9;
    marks.center[1].push(4);
    marks.colors[2] = 7;
    lowConfidence.push(9);

    const restored = restoreUndoSnapshot(stack);

    expect(restored.snapshot?.grid[0]).toBe(5);
    expect(restored.snapshot?.marks.center[1]).toEqual([2, 3]);
    expect(restored.snapshot?.marks.colors[2]).toBe(4);
    expect(restored.snapshot?.selectedIndex).toBe(1);
    expect(restored.snapshot?.lowConfidence).toEqual([8]);
    expect(restored.stack).toEqual([]);
  });

  it("limits undo snapshots to the newest board states", () => {
    const oldest = createBoardSnapshot(setCellValue(createEmptyGrid(), 0, 1), createEmptyMarks(), 0, []);
    const middle = createBoardSnapshot(setCellValue(createEmptyGrid(), 1, 2), createEmptyMarks(), 1, []);
    const newest = createBoardSnapshot(setCellValue(createEmptyGrid(), 2, 3), createEmptyMarks(), 2, []);

    let stack = pushUndoSnapshot([], oldest, 2);
    stack = pushUndoSnapshot(stack, middle, 2);
    stack = pushUndoSnapshot(stack, newest, 2);

    expect(stack.map((snapshot) => snapshot.selectedIndex)).toEqual([2, 1]);
  });

  it("clears both note layers in the cell and prunes peers when placing a value", () => {
    const grid = createEmptyGrid();
    const marks: BoardMarks = createEmptyMarks();
    marks.corner[0] = [1, 9];
    marks.center[0] = [1, 2];
    marks.corner[1] = [1, 4];
    marks.center[9] = [1, 5];
    marks.colors[0] = 3;

    const result = setCellValueWithMarks(grid, marks, 0, 1);

    expect(result.grid[0]).toBe(1);
    expect(result.marks.corner[0]).toEqual([]);
    expect(result.marks.center[0]).toEqual([]);
    expect(result.marks.corner[1]).toEqual([4]);
    expect(result.marks.center[9]).toEqual([5]);
    expect(result.marks.colors[0]).toBe(3); // paint survives placement
  });

  it("smart-toggles a note across a multi-cell selection", () => {
    const grid = setCellValue(createEmptyGrid(), 2, 7); // filled cells are skipped
    let notes = createEmptyNotes();
    notes[0] = [5];

    // Mixed state: adds the note everywhere that lacks it.
    notes = toggleNoteOnCells(notes, grid, [0, 1, 2], 5);
    expect(notes[0]).toEqual([5]);
    expect(notes[1]).toEqual([5]);
    expect(notes[2]).toEqual([]);

    // Uniform state: removes the note everywhere.
    notes = toggleNoteOnCells(notes, grid, [0, 1], 5);
    expect(notes[0]).toEqual([]);
    expect(notes[1]).toEqual([]);
  });

  it("smart-toggles paint colors across a selection", () => {
    let colors = toggleColorOnCells(createEmptyMarks().colors, [0, 1], 4);
    expect(colors[0]).toBe(4);
    expect(colors[1]).toBe(4);

    colors = toggleColorOnCells(colors, [0, 1], 4); // same color clears
    expect(colors[0]).toBeNull();
    expect(colors[1]).toBeNull();

    colors = toggleColorOnCells(colors, [0], 2);
    colors = toggleColorOnCells(colors, [0], null); // explicit clear
    expect(colors[0]).toBeNull();
  });

  it("prunes eliminations from notes without backfilling candidates", () => {
    const notes = createEmptyNotes();
    notes[3] = [4, 8];

    const next = pruneEliminationsFromNotes(notes, [{ cell: { row: 1, col: 4 }, digit: 4 }]);

    expect(next[3]).toEqual([8]);
    expect(next[5]).toEqual([]); // untouched cells stay empty
  });

  it("finds the next incomplete digit with wrap-around", () => {
    const grid = createEmptyGrid();
    for (let i = 0; i < 9; i += 1) {
      grid[i * 9] = 1; // digit 1 fully placed (ignoring validity for the test)
    }

    expect(nextIncompleteDigit(grid, 1)).toBe(2);
    expect(nextIncompleteDigit(grid, 9)).toBe(2);

    const full = parsePuzzleText(SOLVED_PUZZLE);
    expect(nextIncompleteDigit(full, 5)).toBeNull();
  });

  it("maps arrow keys and WASD to navigation directions", () => {
    expect(resolveNavigationKey("ArrowUp")).toBe("up");
    expect(resolveNavigationKey("w")).toBe("up");
    expect(resolveNavigationKey("S")).toBe("down");
    expect(resolveNavigationKey("a")).toBe("left");
    expect(resolveNavigationKey("ArrowRight")).toBe("right");
    expect(resolveNavigationKey("q")).toBeNull();
  });

  it("moves the selection within the grid and clamps at the edges", () => {
    expect(moveSelection(40, "up")).toBe(31); // R5C5 -> R4C5
    expect(moveSelection(40, "down")).toBe(49);
    expect(moveSelection(40, "left")).toBe(39);
    expect(moveSelection(40, "right")).toBe(41);

    expect(moveSelection(4, "up")).toBe(4); // top row stays put
    expect(moveSelection(76, "down")).toBe(76); // bottom row stays put
    expect(moveSelection(9, "left")).toBe(9); // first column stays put
    expect(moveSelection(17, "right")).toBe(17); // last column stays put
  });

  it("cycles selection through cells holding a value", () => {
    let grid = setCellValue(createEmptyGrid(), 4, 5);
    grid = setCellValue(grid, 20, 5);
    grid = setCellValue(grid, 60, 5);

    expect(findNextCellWithValue(grid, 5, 0)).toBe(4);
    expect(findNextCellWithValue(grid, 5, 4)).toBe(20);
    expect(findNextCellWithValue(grid, 5, 60)).toBe(4); // wraps around
    expect(findNextCellWithValue(grid, 7, 0)).toBeNull(); // no such value
  });

  it("returns the same cell when it is the only one holding the value", () => {
    const grid = setCellValue(createEmptyGrid(), 40, 9);

    expect(findNextCellWithValue(grid, 9, 40)).toBe(40);
  });

  it("solves a valid puzzle to its unique solution", () => {
    const solution = solveSudoku(parsePuzzleText(SOLVABLE_PUZZLE));

    expect(solution).not.toBeNull();
    expect(solution?.map((value) => value ?? 0).join("")).toBe(SOLVED_PUZZLE);
  });

  it("returns null when the givens have no valid solution", () => {
    const broken = setCellValue(parsePuzzleText(SOLVABLE_PUZZLE), 1, 5); // duplicate 5 in the top band

    expect(solveSudoku(broken)).toBeNull();
  });

  it("flags entries that do not match the solution as wrong", () => {
    const givens = parsePuzzleText(SOLVABLE_PUZZLE);
    const wrong = setCellValue(givens, 2, 1); // solution at index 2 is 4, not 1

    const result = checkPuzzle(givens, wrong);

    expect(result.status).toBe("incorrect");
    expect(result.incorrectIndexes).toEqual([2]);
  });

  it("reports a fully correct board as solved", () => {
    const result = checkPuzzle(parsePuzzleText(SOLVABLE_PUZZLE), parsePuzzleText(SOLVED_PUZZLE));

    expect(result.status).toBe("solved");
    expect(result.incorrectIndexes).toEqual([]);
  });

  it("reports a partially filled board with no mistakes as incomplete", () => {
    const givens = parsePuzzleText(SOLVABLE_PUZZLE);
    const result = checkPuzzle(givens, setCellValue(givens, 2, 4)); // index 2 matches the solution

    expect(result.status).toBe("incomplete");
    expect(result.incorrectIndexes).toEqual([]);
  });
});
