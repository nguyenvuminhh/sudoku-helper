// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSupabaseAccount } from "./useSupabaseAccount";

const supabaseHarness = vi.hoisted(() => ({
  createBrowserSupabaseClient: vi.fn(),
  getSession: vi.fn(),
  signInWithOtp: vi.fn(),
  signInAnonymously: vi.fn()
}));

vi.mock("../lib/supabase", () => ({
  createBrowserSupabaseClient: supabaseHarness.createBrowserSupabaseClient
}));

function AccountProbe() {
  const account = useSupabaseAccount();
  return <div data-testid="account-status">{account.status}</div>;
}

function SignInProbe() {
  const account = useSupabaseAccount();
  return <button onClick={() => void account.signInWithEmail("player@example.com")}>Sign in</button>;
}

describe("useSupabaseAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseHarness.getSession.mockResolvedValue({ data: { session: null }, error: null });
    supabaseHarness.signInAnonymously.mockResolvedValue({
      data: { user: { id: "guest-1", email: null, is_anonymous: true } },
      error: null
    });
    supabaseHarness.signInWithOtp.mockResolvedValue({ data: {}, error: null });
    supabaseHarness.createBrowserSupabaseClient.mockReturnValue({
      auth: {
        getSession: supabaseHarness.getSession,
        signInWithOtp: supabaseHarness.signInWithOtp,
        signInAnonymously: supabaseHarness.signInAnonymously
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null }))
          }))
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: "guest-1", display_name: "Guest 0001", avatar_seed: "guest-1" },
              error: null
            }))
          }))
        }))
      }))
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps default guest mode local without starting Supabase anonymous auth", async () => {
    render(<AccountProbe />);

    await Promise.resolve();

    expect(screen.getByTestId("account-status").textContent).toBe("guest");
    expect(supabaseHarness.createBrowserSupabaseClient).not.toHaveBeenCalled();
    expect(supabaseHarness.getSession).not.toHaveBeenCalled();
    expect(supabaseHarness.signInAnonymously).not.toHaveBeenCalled();
  });

  it("sends an email sign-in link without starting anonymous auth", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/");
    render(<SignInProbe />);

    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(supabaseHarness.signInWithOtp).toHaveBeenCalledWith({
      email: "player@example.com",
      options: { emailRedirectTo: `${window.location.origin}/` }
    });
    expect(supabaseHarness.signInAnonymously).not.toHaveBeenCalled();
  });
});
