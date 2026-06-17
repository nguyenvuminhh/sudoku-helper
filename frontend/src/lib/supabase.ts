import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SupabaseConfig =
  | { available: false }
  | {
      available: true;
      url: string;
      publishableKey: string;
    };

let browserClient: SupabaseClient | null = null;

export function getSupabaseConfig(): SupabaseConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";

  if (!url || !publishableKey) {
    return { available: false };
  }

  return { available: true, url, publishableKey };
}

export function createBrowserSupabaseClient(): SupabaseClient | null {
  const config = getSupabaseConfig();
  if (!config.available) {
    return null;
  }

  if (!browserClient) {
    browserClient = createClient(config.url, config.publishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true
      }
    });
  }

  return browserClient;
}
