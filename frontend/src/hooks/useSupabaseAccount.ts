"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ensureProfile,
  readExistingSession,
  sendSignInLink,
  signOut,
  updateDisplayName,
  type AccountUser,
  type SupabaseAccountClient,
  type UserProfile
} from "../lib/supabase-repository";
import { createBrowserSupabaseClient } from "../lib/supabase";

export type SupabaseAccountStatus = "guest" | "signed-in" | "loading" | "unavailable" | "error";

export type SupabaseAccountState = {
  status: SupabaseAccountStatus;
  user: AccountUser | null;
  profile: UserProfile | null;
  displayName: string;
  error: string | null;
  ensureAccount: () => Promise<AccountUser | null>;
  signInWithEmail: (email: string) => Promise<void>;
  updateName: (displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
};

type SupabaseClientRef = SupabaseAccountClient | null;

export function useSupabaseAccount(): SupabaseAccountState {
  const clientRef = useRef<SupabaseClientRef>(null);
  const [status, setStatus] = useState<SupabaseAccountStatus>("guest");
  const [user, setUser] = useState<AccountUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getClient = useCallback((): SupabaseClientRef => {
    if (!clientRef.current) {
      clientRef.current = createBrowserSupabaseClient() as SupabaseClientRef;
    }
    return clientRef.current;
  }, []);

  const loadSession = useCallback(async (
    client: SupabaseAccountClient,
    missingSessionError: string | null
  ): Promise<AccountUser | null> => {
    setStatus("loading");
    setError(null);
    try {
      const nextUser = await readExistingSession(client);
      if (!nextUser) {
        setUser(null);
        setProfile(null);
        setStatus("guest");
        setError(missingSessionError);
        return null;
      }
      if (nextUser.isAnonymous) {
        setUser(null);
        setProfile(null);
        setStatus("guest");
        setError("Anonymous guest sessions do not save leaderboard records.");
        return null;
      }
      const nextProfile = await ensureProfile(client, nextUser);
      setUser(nextUser);
      setProfile(nextProfile);
      setStatus("signed-in");
      return nextUser;
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "Account is unavailable");
      return null;
    }
  }, []);

  useEffect(() => {
    if (!hasAuthCallback()) {
      return;
    }
    const client = getClient();
    if (!client) {
      setStatus("unavailable");
      setError("Supabase is not configured.");
      return;
    }
    void loadSession(client, "Sign-in link could not be completed.");
  }, [getClient, loadSession]);

  const ensureAccount = useCallback(async (): Promise<AccountUser | null> => {
    const client = getClient();
    if (!client) {
      setStatus("unavailable");
      return null;
    }

    return loadSession(client, "Sign in to save leaderboard records.");
  }, [getClient, loadSession]);

  const signInWithEmail = useCallback(async (email: string) => {
    const client = getClient();
    if (!client) {
      setStatus("unavailable");
      setError("Supabase is not configured.");
      throw new Error("Supabase is not configured.");
    }

    setStatus("loading");
    setError(null);
    try {
      await sendSignInLink(client, email, getAuthRedirectUrl());
      setStatus("guest");
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "Sign-in link could not be sent");
      throw cause;
    }
  }, [getClient]);

  const updateName = useCallback(async (displayName: string) => {
    const client = clientRef.current;
    if (!client || !user || user.isAnonymous) {
      setStatus(client ? "guest" : "unavailable");
      return;
    }

    try {
      const nextProfile = await updateDisplayName(client, user.id, displayName);
      setProfile(nextProfile);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Display name could not be saved");
    }
  }, [user]);

  const signOutAccount = useCallback(async () => {
    const client = clientRef.current;
    if (!client) {
      setStatus("unavailable");
      return;
    }

    try {
      await signOut(client);
    } finally {
      setUser(null);
      setProfile(null);
      setStatus("guest");
    }
  }, []);

  return {
    status,
    user,
    profile,
    displayName: profile?.displayName ?? "Guest",
    error,
    ensureAccount,
    signInWithEmail,
    updateName,
    signOut: signOutAccount
  };
}

function getAuthRedirectUrl(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return `${window.location.origin}${window.location.pathname}`;
}

function hasAuthCallback(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const url = new URL(window.location.href);
  if (url.searchParams.has("code") || url.searchParams.has("error")) {
    return true;
  }

  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return hash.has("access_token") || hash.has("refresh_token") || hash.has("error");
}
