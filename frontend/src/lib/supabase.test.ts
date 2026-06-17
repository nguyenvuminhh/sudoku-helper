import { afterEach, describe, expect, it, vi } from "vitest";

import { getSupabaseConfig } from "./supabase";

describe("getSupabaseConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports unavailable when Supabase env vars are missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");

    expect(getSupabaseConfig()).toEqual({ available: false });
  });

  it("returns the browser-safe Supabase config", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_123");

    expect(getSupabaseConfig()).toEqual({
      available: true,
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable_123"
    });
  });
});
