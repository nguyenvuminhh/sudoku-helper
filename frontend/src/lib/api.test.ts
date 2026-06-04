import { afterEach, describe, expect, it, vi } from "vitest";

import { requestHint } from "./api";
import { createEmptyGrid, createEmptyNotes } from "./sudoku-state";

describe("api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends note candidates with hint requests", async () => {
    const grid = createEmptyGrid();
    const notes = createEmptyNotes();
    notes[1] = [2, 3];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          technique: { id: "no_progress", name: "No logical progress", rank: 999 },
          action: { type: "none", cell: null, digit: null, eliminations: [] },
          summary: "No supported logical hint is available for this grid yet.",
          explanation: [],
          highlights: { primary_cells: [], related_cells: [], eliminations: [] }
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await requestHint(grid, notes);

    const requestInit = fetchMock.mock.calls[0][1];
    const requestBody = JSON.parse(requestInit?.body as string);
    expect(requestBody.grid).toBe("0".repeat(81));
    expect(requestBody.candidates["1"]).toEqual([2, 3]);
  });
});
