import { describe, expect, it } from "vitest";

import { buildPuzzleFingerprint, buildSolveRecordInput, formatLeaderboardTime } from "./leaderboard";
import { createEmptyGrid, createGivenMask } from "./sudoku-state";

describe("leaderboard helpers", () => {
  it("builds a stable puzzle fingerprint from givens and difficulty", async () => {
    const grid = createEmptyGrid();
    grid[0] = 5;
    grid[80] = 9;

    const first = await buildPuzzleFingerprint(grid, "easy");
    const second = await buildPuzzleFingerprint([...grid], "easy");
    const harder = await buildPuzzleFingerprint(grid, "hard");

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
    expect(harder).not.toBe(first);
  });

  it("builds a solve record payload from finish stats", async () => {
    const grid = createEmptyGrid();
    grid[0] = 5;
    grid[1] = 3;
    const givenMask = createGivenMask(grid);

    const result = await buildSolveRecordInput({
      userId: "user-1",
      givensGrid: grid,
      givenMask,
      difficulty: "medium",
      elapsedSeconds: 125,
      hintsUsed: 2,
      checksUsed: 1,
      techniques: ["Naked Single"]
    });

    expect(result).toMatchObject({
      user_id: "user-1",
      difficulty: "medium",
      elapsed_seconds: 125,
      hints_used: 2,
      checks_used: 1,
      givens: 2,
      filled_by_user: 79,
      techniques: ["Naked Single"]
    });
    expect(result.puzzle_fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("formats leaderboard times compactly", () => {
    expect(formatLeaderboardTime(65)).toBe("01:05");
    expect(formatLeaderboardTime(3661)).toBe("1:01:01");
  });
});
