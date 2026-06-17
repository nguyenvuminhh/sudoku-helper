"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ensureAnonymousSession,
  ensureProfile,
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

  const ensureAccount = useCallback(async (): Promise<AccountUser | null> => {
    const client = clientRef.current;
    if (!client) {
      setStatus("unavailable");
      return null;
    }

    setStatus("loading");
    setError(null);
    try {
      const nextUser = await ensureAnonymousSession(client);
      const nextProfile = await ensureProfile(client, nextUser);
      setUser(nextUser);
      setProfile(nextProfile);
      setStatus(nextUser.isAnonymous ? "guest" : "signed-in");
      return nextUser;
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "Account is unavailable");
      return null;
    }
  }, []);

  useEffect(() => {
    clientRef.current = createBrowserSupabaseClient() as SupabaseClientRef;
    if (!clientRef.current) {
      setStatus("unavailable");
      return;
    }
    void ensureAccount();
  }, [ensureAccount]);

  const updateName = useCallback(async (displayName: string) => {
    const client = clientRef.current;
    if (!client || !user) {
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
    updateName,
    signOut: signOutAccount
  };
}
