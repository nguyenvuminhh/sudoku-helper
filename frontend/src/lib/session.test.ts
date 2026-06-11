import { describe, expect, it } from "vitest";

import { parseSavedSession, serializeSession } from "./session";
import { createEmptyGrid, createEmptyNotes, createGivenMask } from "./sudoku-state";

function makeSession() {
  const grid = createEmptyGrid();
  grid[0] = 5;
  return {
    grid,
    notes: createEmptyNotes(),
    givenMask: createGivenMask(grid),
    phase: "solving" as const,
    selectedIndex: 4,
    lowConfidence: [7],
    elapsedSeconds: 93
  };
}

describe("session round trip", () => {
  it("serializes and restores a session", () => {
    const session = makeSession();
    const restored = parseSavedSession(serializeSession(session));

    expect(restored).not.toBeNull();
    expect(restored?.grid[0]).toBe(5);
    expect(restored?.givenMask[0]).toBe(true);
    expect(restored?.phase).toBe("solving");
    expect(restored?.selectedIndex).toBe(4);
    expect(restored?.lowConfidence).toEqual([7]);
    expect(restored?.elapsedSeconds).toBe(93);
  });
});

describe("parseSavedSession", () => {
  it("rejects null, malformed JSON, and non-objects", () => {
    expect(parseSavedSession(null)).toBeNull();
    expect(parseSavedSession("not json{")).toBeNull();
    expect(parseSavedSession('"just a string"')).toBeNull();
  });

  it("rejects unknown versions", () => {
    const session = JSON.parse(serializeSession(makeSession()));
    session.version = 2;
    expect(parseSavedSession(JSON.stringify(session))).toBeNull();
  });

  it("rejects boards with invalid cells", () => {
    const session = JSON.parse(serializeSession(makeSession()));
    session.grid[3] = 12;
    expect(parseSavedSession(JSON.stringify(session))).toBeNull();
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
});
