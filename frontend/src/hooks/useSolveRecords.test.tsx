// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SupabaseAccountState } from "./useSupabaseAccount";
import { useSolveRecords, type SolveMetadata } from "./useSolveRecords";

const supabaseHarness = vi.hoisted(() => ({
  createBrowserSupabaseClient: vi.fn()
}));

const repositoryHarness = vi.hoisted(() => ({
  fetchDifficultyLeaderboard: vi.fn(),
  fetchPersonalStats: vi.fn(),
  saveSolveRecord: vi.fn()
}));

vi.mock("../lib/supabase", () => ({
  createBrowserSupabaseClient: supabaseHarness.createBrowserSupabaseClient
}));

vi.mock("../lib/supabase-repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/supabase-repository")>();
  return {
    ...actual,
    fetchDifficultyLeaderboard: repositoryHarness.fetchDifficultyLeaderboard,
    fetchPersonalStats: repositoryHarness.fetchPersonalStats,
    saveSolveRecord: repositoryHarness.saveSolveRecord
  };
});

const localGuestAccount: SupabaseAccountState = {
  status: "guest",
  user: null,
  profile: null,
  displayName: "Guest",
  error: null,
  ensureAccount: vi.fn(async () => null),
  updateName: vi.fn(async () => undefined),
  signOut: vi.fn(async () => undefined)
};

const solvedMetadata: SolveMetadata = {
  completionKey: "solve-1",
  givensGrid: Array.from({ length: 81 }, () => 1),
  givenMask: Array.from({ length: 81 }, (_, index) => index < 79),
  difficulty: "custom",
  elapsedSeconds: 12,
  hintsUsed: 0,
  checksUsed: 0,
  techniques: []
};

function SolveRecordsProbe() {
  useSolveRecords({ account: localGuestAccount, solveMetadata: solvedMetadata });
  return null;
}

describe("useSolveRecords", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localGuestAccount.ensureAccount = vi.fn(async () => null);
    supabaseHarness.createBrowserSupabaseClient.mockReturnValue({
      from: vi.fn(),
      rpc: vi.fn()
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("does not touch Supabase while solved puzzle belongs to a local guest", async () => {
    render(<SolveRecordsProbe />);

    await Promise.resolve();
    await Promise.resolve();

    expect(supabaseHarness.createBrowserSupabaseClient).not.toHaveBeenCalled();
    expect(localGuestAccount.ensureAccount).not.toHaveBeenCalled();
    expect(repositoryHarness.fetchDifficultyLeaderboard).not.toHaveBeenCalled();
    expect(repositoryHarness.fetchPersonalStats).not.toHaveBeenCalled();
    expect(repositoryHarness.saveSolveRecord).not.toHaveBeenCalled();
  });
});
