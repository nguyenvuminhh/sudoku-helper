import type { LeaderboardDifficulty, SolveRecordInput } from "./leaderboard";

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

export type SupabaseSolveClient = {
  from?: (table: string) => unknown;
  rpc?: (functionName: string, args: Record<string, unknown>) => SupabaseAsyncResult<LeaderboardRpcRow[] | null>;
};

export type SolveRecord = {
  id: string;
  userId: string;
  puzzleFingerprint: string;
  difficulty: LeaderboardDifficulty;
  elapsedSeconds: number;
  hintsUsed: number;
  checksUsed: number;
  givens: number;
  filledByUser: number;
  techniques: string[];
  completedAt: string;
};

export type LeaderboardRow = {
  rank: number;
  profileId: string;
  displayName: string;
  difficulty: LeaderboardDifficulty;
  elapsedSeconds: number;
  hintsUsed: number;
  checksUsed: number;
  completedAt: string;
};

export type PersonalStats = {
  completedSolves: number;
  bestTimeSeconds: number | null;
  recent: SolveRecord[];
};

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

type SolveRecordRow = {
  id: string;
  user_id: string;
  puzzle_fingerprint: string;
  difficulty: string;
  elapsed_seconds: number;
  hints_used: number;
  checks_used: number;
  givens: number;
  filled_by_user: number;
  techniques: string[];
  completed_at: string;
};

type LeaderboardRpcRow = {
  rank: number;
  profile_id: string;
  display_name: string;
  difficulty: string;
  elapsed_seconds: number;
  hints_used: number;
  checks_used: number;
  completed_at: string;
};

type SupabaseSolveRecordsQuery = {
  insert: (payload: SolveRecordInput) => {
    select: (columns?: string) => {
      single: () => SupabaseAsyncResult<SolveRecordRow>;
    };
  };
  select: (columns?: string) => {
    eq: (column: string, value: string) => {
      eq: (column: string, value: string) => {
        order: (column: string, options: { ascending: boolean }) => {
          limit: (count: number) => SupabaseAsyncResult<SolveRecordRow[] | null>;
        };
      };
    };
  };
};

const PROFILE_COLUMNS = "id, display_name, avatar_seed";
const SOLVE_RECORD_COLUMNS =
  "id, user_id, puzzle_fingerprint, difficulty, elapsed_seconds, hints_used, checks_used, givens, filled_by_user, techniques, completed_at";

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

export async function saveSolveRecord(client: SupabaseSolveClient, record: SolveRecordInput): Promise<SolveRecord> {
  const result = await getSolveRecordsQuery(client).insert(record).select(SOLVE_RECORD_COLUMNS).single();
  throwIfError(result.error, "Unable to save solve");
  return mapSolveRecord(result.data);
}

export async function fetchDifficultyLeaderboard(
  client: SupabaseSolveClient,
  difficulty: LeaderboardDifficulty,
  limit = 20
): Promise<LeaderboardRow[]> {
  if (!client.rpc) {
    throw new Error("Leaderboard storage is unavailable");
  }

  const result = await client.rpc("difficulty_leaderboard", {
    selected_difficulty: difficulty,
    row_limit: limit
  });
  throwIfError(result.error, "Unable to load leaderboard");
  return (result.data ?? []).map(mapLeaderboardRow);
}

export async function fetchPersonalStats(
  client: SupabaseSolveClient,
  userId: string,
  difficulty: LeaderboardDifficulty
): Promise<PersonalStats> {
  const result = await getSolveRecordsQuery(client)
    .select(SOLVE_RECORD_COLUMNS)
    .eq("user_id", userId)
    .eq("difficulty", difficulty)
    .order("completed_at", { ascending: false })
    .limit(20);
  throwIfError(result.error, "Unable to load personal stats");

  const recent = (result.data ?? []).map(mapSolveRecord);
  const bestTimeSeconds =
    recent.length > 0 ? Math.min(...recent.map((record) => record.elapsedSeconds)) : null;

  return {
    completedSolves: recent.length,
    bestTimeSeconds,
    recent
  };
}

function getProfilesQuery(client: SupabaseProfileClient): SupabaseProfileQuery {
  return client.from("profiles");
}

function getSolveRecordsQuery(client: SupabaseSolveClient): SupabaseSolveRecordsQuery {
  if (!client.from) {
    throw new Error("Solve record storage is unavailable");
  }
  return client.from("solve_records") as SupabaseSolveRecordsQuery;
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

function mapSolveRecord(row: SolveRecordRow): SolveRecord {
  return {
    id: row.id,
    userId: row.user_id,
    puzzleFingerprint: row.puzzle_fingerprint,
    difficulty: row.difficulty as LeaderboardDifficulty,
    elapsedSeconds: row.elapsed_seconds,
    hintsUsed: row.hints_used,
    checksUsed: row.checks_used,
    givens: row.givens,
    filledByUser: row.filled_by_user,
    techniques: row.techniques,
    completedAt: row.completed_at
  };
}

function mapLeaderboardRow(row: LeaderboardRpcRow): LeaderboardRow {
  return {
    rank: row.rank,
    profileId: row.profile_id,
    displayName: row.display_name,
    difficulty: row.difficulty as LeaderboardDifficulty,
    elapsedSeconds: row.elapsed_seconds,
    hintsUsed: row.hints_used,
    checksUsed: row.checks_used,
    completedAt: row.completed_at
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
