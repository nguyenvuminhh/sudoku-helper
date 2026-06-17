import { describe, expect, it, vi } from "vitest";

import {
  ensureAnonymousSession,
  ensureProfile,
  fetchDifficultyLeaderboard,
  fetchPersonalStats,
  saveSolveRecord
} from "./supabase-repository";

describe("supabase repository account helpers", () => {
  it("reuses an existing Supabase session without creating another anonymous user", async () => {
    const signInAnonymously = vi.fn();
    const client = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { user: { id: "user-1", email: null, is_anonymous: true } } },
          error: null
        })),
        signInAnonymously
      }
    };

    const user = await ensureAnonymousSession(client);

    expect(user).toEqual({ id: "user-1", email: null, isAnonymous: true });
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it("creates an anonymous Supabase session when none exists", async () => {
    const client = {
      auth: {
        getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
        signInAnonymously: vi.fn(async () => ({
          data: { user: { id: "guest-1", email: null, is_anonymous: true } },
          error: null
        }))
      }
    };

    const user = await ensureAnonymousSession(client);

    expect(client.auth.signInAnonymously).toHaveBeenCalledTimes(1);
    expect(user).toEqual({ id: "guest-1", email: null, isAnonymous: true });
  });

  it("creates a profile for the authenticated user when one does not exist", async () => {
    const inserts: Array<{ id: string; display_name: string; avatar_seed: string }> = [];
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null }))
          }))
        })),
        insert: vi.fn((payload: { id: string; display_name: string; avatar_seed: string }) => {
          inserts.push(payload);
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: payload.id,
                  display_name: payload.display_name,
                  avatar_seed: payload.avatar_seed
                },
                error: null
              }))
            }))
          };
        })
      }))
    };

    const profile = await ensureProfile(client, { id: "abc123", email: null, isAnonymous: true });

    const captured = inserts[0];
    expect(captured).toBeDefined();
    if (!captured) {
      throw new Error("Profile insert was not captured");
    }
    expect(captured.id).toBe("abc123");
    expect(captured.display_name).toMatch(/^Guest \d{4}$/);
    expect(captured.avatar_seed).toBe("abc123");
    expect(profile).toEqual({
      id: "abc123",
      displayName: captured.display_name,
      avatarSeed: "abc123"
    });
  });
});

describe("supabase repository solve records", () => {
  it("inserts a solve record and maps the saved row", async () => {
    const inserts: unknown[] = [];
    const client = {
      from: vi.fn(() => ({
        insert: vi.fn((payload: unknown) => {
          inserts.push(payload);
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: "record-1",
                  user_id: "user-1",
                  puzzle_fingerprint: "a".repeat(64),
                  difficulty: "hard",
                  elapsed_seconds: 205,
                  hints_used: 1,
                  checks_used: 0,
                  givens: 28,
                  filled_by_user: 53,
                  techniques: ["Naked Single"],
                  completed_at: "2026-06-16T19:00:00.000Z"
                },
                error: null
              }))
            }))
          };
        })
      }))
    };

    const result = await saveSolveRecord(client, {
      user_id: "user-1",
      puzzle_fingerprint: "a".repeat(64),
      difficulty: "hard",
      elapsed_seconds: 205,
      hints_used: 1,
      checks_used: 0,
      givens: 28,
      filled_by_user: 53,
      techniques: ["Naked Single"]
    });

    expect(inserts).toHaveLength(1);
    expect(result).toMatchObject({
      id: "record-1",
      userId: "user-1",
      difficulty: "hard",
      elapsedSeconds: 205,
      hintsUsed: 1,
      checksUsed: 0,
      completedAt: "2026-06-16T19:00:00.000Z"
    });
  });

  it("fetches difficulty leaderboard rows from the leaderboard RPC", async () => {
    const client = {
      rpc: vi.fn(async () => ({
        data: [
          {
            rank: 1,
            profile_id: "user-1",
            display_name: "Guest 1234",
            difficulty: "medium",
            elapsed_seconds: 95,
            hints_used: 0,
            checks_used: 0,
            completed_at: "2026-06-16T19:00:00.000Z"
          }
        ],
        error: null
      }))
    };

    const rows = await fetchDifficultyLeaderboard(client, "medium", 10);

    expect(client.rpc).toHaveBeenCalledWith("difficulty_leaderboard", {
      selected_difficulty: "medium",
      row_limit: 10
    });
    expect(rows).toEqual([
      {
        rank: 1,
        profileId: "user-1",
        displayName: "Guest 1234",
        difficulty: "medium",
        elapsedSeconds: 95,
        hintsUsed: 0,
        checksUsed: 0,
        completedAt: "2026-06-16T19:00:00.000Z"
      }
    ]);
  });

  it("derives personal stats from recent solve records for one difficulty", async () => {
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(async () => ({
                  data: [
                    {
                      id: "record-2",
                      user_id: "user-1",
                      puzzle_fingerprint: "b".repeat(64),
                      difficulty: "easy",
                      elapsed_seconds: 80,
                      hints_used: 0,
                      checks_used: 1,
                      givens: 30,
                      filled_by_user: 51,
                      techniques: [],
                      completed_at: "2026-06-16T20:00:00.000Z"
                    },
                    {
                      id: "record-1",
                      user_id: "user-1",
                      puzzle_fingerprint: "a".repeat(64),
                      difficulty: "easy",
                      elapsed_seconds: 120,
                      hints_used: 2,
                      checks_used: 0,
                      givens: 30,
                      filled_by_user: 51,
                      techniques: ["Hidden Single"],
                      completed_at: "2026-06-16T19:00:00.000Z"
                    }
                  ],
                  error: null
                }))
              }))
            }))
          }))
        }))
      }))
    };

    const stats = await fetchPersonalStats(client, "user-1", "easy");

    expect(stats.completedSolves).toBe(2);
    expect(stats.bestTimeSeconds).toBe(80);
    expect(stats.recent[0]).toMatchObject({ id: "record-2", elapsedSeconds: 80 });
  });
});
