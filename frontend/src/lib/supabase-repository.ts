export type AccountUser = {
  id: string;
  email: string | null;
  isAnonymous: boolean;
};

export type UserProfile = {
  id: string;
  displayName: string;
  avatarSeed: string;
};

type SupabaseAuthUser = {
  id: string;
  email?: string | null;
  is_anonymous?: boolean;
};

type SupabaseAuthSession = {
  user: SupabaseAuthUser;
};

type SupabaseResult<T> = {
  data: T;
  error: { message?: string } | null;
};

type SupabaseAsyncResult<T> = PromiseLike<SupabaseResult<T>>;

type SupabaseErrorResult = {
  error: { message?: string } | null;
};

export type SupabaseAuthClient = {
  auth: {
    getSession: () => Promise<SupabaseResult<{ session: SupabaseAuthSession | null }>>;
    signInAnonymously: () => Promise<SupabaseResult<{ user: SupabaseAuthUser | null }>>;
    signOut?: () => Promise<SupabaseErrorResult>;
  };
};

export type SupabaseProfileClient = {
  from: (table: string) => SupabaseProfileQuery;
};

export type SupabaseAccountClient = SupabaseAuthClient & SupabaseProfileClient;

type SupabaseProfileQuery = {
  select: (columns?: string) => {
    eq: (column: string, value: string) => {
      maybeSingle: () => SupabaseAsyncResult<ProfileRow | null>;
    };
  };
  insert: (payload: ProfileInsert) => {
    select: (columns?: string) => {
      single: () => SupabaseAsyncResult<ProfileRow>;
    };
  };
  update?: (payload: Partial<ProfileInsert>) => {
    eq: (column: string, value: string) => {
      select: (columns?: string) => {
        single: () => SupabaseAsyncResult<ProfileRow>;
      };
    };
  };
};

type ProfileRow = {
  id: string;
  display_name: string;
  avatar_seed: string;
};

type ProfileInsert = {
  id: string;
  display_name: string;
  avatar_seed: string;
};

const PROFILE_COLUMNS = "id, display_name, avatar_seed";

export async function ensureAnonymousSession(client: SupabaseAuthClient): Promise<AccountUser> {
  const sessionResult = await client.auth.getSession();
  throwIfError(sessionResult.error, "Unable to read Supabase session");

  const sessionUser = sessionResult.data.session?.user;
  if (sessionUser) {
    return mapUser(sessionUser);
  }

  const signInResult = await client.auth.signInAnonymously();
  throwIfError(signInResult.error, "Unable to start guest session");

  if (!signInResult.data.user) {
    throw new Error("Unable to start guest session");
  }

  return mapUser(signInResult.data.user);
}

export async function ensureProfile(client: SupabaseProfileClient, user: AccountUser): Promise<UserProfile> {
  const profiles = getProfilesQuery(client);
  const existing = await profiles.select(PROFILE_COLUMNS).eq("id", user.id).maybeSingle();
  throwIfError(existing.error, "Unable to load profile");

  if (existing.data) {
    return mapProfile(existing.data);
  }

  const insert = await profiles
    .insert({
      id: user.id,
      display_name: defaultDisplayName(user.id),
      avatar_seed: user.id
    })
    .select(PROFILE_COLUMNS)
    .single();
  throwIfError(insert.error, "Unable to create profile");
  return mapProfile(insert.data);
}

export async function updateDisplayName(
  client: SupabaseAccountClient,
  userId: string,
  displayName: string
): Promise<UserProfile> {
  const trimmed = displayName.trim();
  if (!trimmed) {
    throw new Error("Display name cannot be empty");
  }

  const profiles = getProfilesQuery(client);
  if (!profiles.update) {
    throw new Error("Unable to update profile");
  }
  const result = await profiles.update({ display_name: trimmed }).eq("id", userId).select(PROFILE_COLUMNS).single();
  throwIfError(result.error, "Unable to update profile");
  return mapProfile(result.data);
}

export async function signOut(client: SupabaseAuthClient): Promise<void> {
  if (!client.auth.signOut) {
    return;
  }
  const result = await client.auth.signOut();
  throwIfError(result.error, "Unable to sign out");
}

function getProfilesQuery(client: SupabaseProfileClient): SupabaseProfileQuery {
  return client.from("profiles");
}

function mapUser(user: SupabaseAuthUser): AccountUser {
  return {
    id: user.id,
    email: user.email ?? null,
    isAnonymous: user.is_anonymous ?? false
  };
}

function mapProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarSeed: row.avatar_seed
  };
}

function defaultDisplayName(userId: string): string {
  let hash = 0;
  for (const char of userId) {
    hash = (hash * 31 + char.charCodeAt(0)) % 10000;
  }
  return `Guest ${hash.toString().padStart(4, "0")}`;
}

function throwIfError(error: { message?: string } | null, fallback: string): void {
  if (error) {
    throw new Error(error.message || fallback);
  }
}
