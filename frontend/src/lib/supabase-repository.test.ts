import { describe, expect, it, vi } from "vitest";

import { ensureAnonymousSession, ensureProfile } from "./supabase-repository";

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
