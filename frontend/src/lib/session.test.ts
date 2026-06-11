import { describe, expect, it } from "vitest";

import { parseSavedSession, serializeSession } from "./session";
import { createEmptyGrid, createEmptyMarks, createEmptyNotes, createGivenMask } from "./sudoku-state";

function makeSession() {
  const grid = createEmptyGrid();
  grid[0] = 5;
  const marks = createEmptyMarks();
  marks.corner[1] = [2];
  marks.center[1] = [2, 3];
  marks.colors[4] = 6;
  return {
    grid,
    marks,
    givenMask: createGivenMask(grid),
    phase: "solving" as const,
    selectedIndex: 4,
    lowConfidence: [7],
    elapsedSeconds: 93,
    hintsUsed: 2,
    checksUsed: 1,
    techniqueNames: ["Naked Single"]
  };
}

describe("session round trip", () => {
  it("serializes and restores a session", () => {
    const session = makeSession();
    const restored = parseSavedSession(serializeSession(session));

    expect(restored).not.toBeNull();
    expect(restored?.grid[0]).toBe(5);
    expect(restored?.marks.corner[1]).toEqual([2]);
    expect(restored?.marks.center[1]).toEqual([2, 3]);
    expect(restored?.marks.colors[4]).toBe(6);
    expect(restored?.givenMask[0]).toBe(true);
    expect(restored?.phase).toBe("solving");
    expect(restored?.selectedIndex).toBe(4);
    expect(restored?.lowConfidence).toEqual([7]);
    expect(restored?.elapsedSeconds).toBe(93);
    expect(restored?.hintsUsed).toBe(2);
    expect(restored?.checksUsed).toBe(1);
    expect(restored?.techniqueNames).toEqual(["Naked Single"]);
  });
});

describe("parseSavedSession", () => {
  it("rejects null, malformed JSON, and non-objects", () => {
    expect(parseSavedSession(null)).toBeNull();
    expect(parseSavedSession("not json{")).toBeNull();
    expect(parseSavedSession('"just a string"')).toBeNull();
  });

  it("migrates version 1 sessions by mapping notes to center marks", () => {
    const grid = createEmptyGrid();
    grid[0] = 5;
    const notes = createEmptyNotes();
    notes[1] = [2, 3];
    const v1 = JSON.stringify({
      version: 1,
      grid,
      notes,
      givenMask: createGivenMask(grid),
      phase: "solving",
      selectedIndex: 4,
      lowConfidence: [],
      elapsedSeconds: 12
    });

    const restored = parseSavedSession(v1);

    expect(restored).not.toBeNull();
    expect(restored?.marks.center[1]).toEqual([2, 3]);
    expect(restored?.marks.corner[1]).toEqual([]);
    expect(restored?.marks.colors.every((color) => color === null)).toBe(true);
    expect(restored?.hintsUsed).toBe(0);
  });

  it("rejects unknown versions", () => {
    const session = JSON.parse(serializeSession(makeSession()));
    session.version = 3;
    expect(parseSavedSession(JSON.stringify(session))).toBeNull();
  });

  it("rejects boards with invalid cells or colors", () => {
    const base = JSON.parse(serializeSession(makeSession()));

    const badGrid = structuredClone(base);
    badGrid.grid[3] = 12;
    expect(parseSavedSession(JSON.stringify(badGrid))).toBeNull();

    const badColor = structuredClone(base);
    badColor.marks.colors[3] = 99;
    expect(parseSavedSession(JSON.stringify(badColor))).toBeNull();
  });

  it("rejects an empty board so there is nothing to restore", () => {
    const session = makeSession();
    session.grid = createEmptyGrid();
    expect(parseSavedSession(serializeSession(session))).toBeNull();
  });

  it("rejects out-of-range selection and elapsed time", () => {
    const base = JSON.parse(serializeSession(makeSession()));

    const badSelection = { ...base, selectedIndex: 99 };
    expect(parseSavedSession(JSON.stringify(badSelection))).toBeNull();

    const badElapsed = { ...base, elapsedSeconds: -5 };
    expect(parseSavedSession(JSON.stringify(badElapsed))).toBeNull();
  });

  it("defaults malformed stat counters to zero", () => {
    const base = JSON.parse(serializeSession(makeSession()));
    base.hintsUsed = "many";
    base.techniqueNames = [1, 2];

    const restored = parseSavedSession(JSON.stringify(base));

    expect(restored?.hintsUsed).toBe(0);
    expect(restored?.techniqueNames).toEqual([]);
  });
});
