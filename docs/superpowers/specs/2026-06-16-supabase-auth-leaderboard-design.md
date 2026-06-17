# Supabase Auth and Leaderboards Design

## 2026-06-17 Update

Guest mode is now local-only. The app must not start Supabase anonymous auth,
create anonymous profiles, fetch leaderboards, or save solve records while the
user is unauthenticated. Leaderboard reads and writes are reserved for
non-anonymous signed-in sessions, and the SQL policies reject anonymous users
even if anonymous auth is later enabled in Supabase.

## Decision

Puzzle Hint will add Supabase Auth and Supabase Postgres as an optional account layer without changing the default play flow. The default mode is local guest mode, which does not create a Supabase session or write database rows. A guest can solve immediately on-device; cloud profiles, stats, and leaderboard records require a non-anonymous signed-in session.

Every completed signed-in solve is saved and promoted to the leaderboard. V1 does not filter for clean solves, hints used, checks used, or any other eligibility rule after a solve is eligible to save. Leaderboards group by difficulty only. Later product work can add moderation, eligibility filters, or curated leaderboard rules without changing the solve-record foundation.

## Goals

- Keep the current Sudoku tutor workspace playable without a visible signup wall.
- Use Supabase Auth for user identity and Supabase Postgres for profiles, solve records, and leaderboard reads.
- Store solved puzzle stats: difficulty, puzzle fingerprint, elapsed time, hints used, checks used, givens, cells filled by the player, techniques encountered, and completion timestamp.
- Let users see their own solve history and basic personal stats.
- Show public difficulty leaderboards from saved solve records.
- Keep FastAPI focused on Sudoku generation, OCR, validation, and static frontend serving.
- Stay compatible with static Next.js export.

## Non-Goals

- No clean-solve eligibility in V1.
- No admin moderation UI in V1.
- No paid Supabase features.
- No service-role key in the frontend.
- No server-side Next.js auth routes, because this frontend is statically exported.
- No migration away from local in-progress session persistence.

## Supabase Constraints

The implementation uses the browser Supabase client with a public publishable key and Row Level Security. Supabase Auth stores users in the `auth` schema and app-facing profile data lives in `public.profiles`, as recommended by Supabase user-management docs. RLS policies use `auth.uid()` to connect browser requests to the current user.

Supabase free plan constraints influence the V1 design:

- Free plan capacity is suitable for the first public version: 50,000 monthly active users and 500 MB database size are listed on current Supabase pricing.
- Built-in Auth email sending is rate-limited, so V1 should not depend on frequent email OTP or password reset flows.
- Local guest mode avoids anonymous Auth and keeps unauthenticated play away from leaderboard storage.

References:

- https://supabase.com/docs/guides/auth/auth-anonymous
- https://supabase.com/docs/guides/auth/managing-user-data
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/auth/rate-limits
- https://supabase.com/pricing

## Data Model

### `public.profiles`

One row per Supabase user.

- `id uuid primary key references auth.users(id) on delete cascade`
- `display_name text not null`
- `avatar_seed text not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Display names are public because leaderboard rows need a name. A newly signed-in user receives a generated name such as `Player 4821`. Users can update their own display name.

### `public.solve_records`

One row per completed solve.

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `puzzle_fingerprint text not null`
- `difficulty text not null`
- `elapsed_seconds integer not null`
- `hints_used integer not null`
- `checks_used integer not null`
- `givens integer not null`
- `filled_by_user integer not null`
- `techniques text[] not null default '{}'`
- `completed_at timestamptz not null default now()`

Validation constraints:

- `difficulty` must be one of the frontend/backend generated difficulty ids.
- `elapsed_seconds >= 0`
- `hints_used >= 0`
- `checks_used >= 0`
- `givens between 0 and 81`
- `filled_by_user between 0 and 81`

The puzzle fingerprint is a deterministic, non-secret hash derived from the locked givens and difficulty. It allows future duplicate handling and per-puzzle boards without storing a complete user-entered puzzle as public data.

### Leaderboard Read Surface

V1 exposes leaderboard-safe rows through a view or RPC that joins solve records to profiles and returns:

- rank order fields
- display name
- difficulty
- elapsed seconds
- hints used
- checks used
- completed timestamp

Sorting is by fastest `elapsed_seconds`, then earliest `completed_at`. Hints/checks are shown as context but do not affect eligibility or rank in V1.

## RLS and Grants

RLS is enabled on all public tables.

Profiles:

- Anyone can read `id`, `display_name`, and `avatar_seed` for leaderboard display.
- Authenticated users can insert their own profile row.
- Authenticated users can update only their own profile row.

Solve records:

- Authenticated users can insert solve records where `user_id = auth.uid()`.
- Authenticated users can read their own raw solve records.
- Public leaderboard reads use a view/RPC that exposes only leaderboard-safe fields.
- Users cannot update or delete solve records in V1.

The app never ships a service-role key. All browser writes go through RLS.

## Frontend Architecture

Add a small Supabase boundary in `frontend/src/lib/supabase.ts` and keep data operations in focused helpers:

- `frontend/src/lib/auth.ts`: current user/session handling, sign-out, and future account sign-in entry points.
- `frontend/src/lib/profiles.ts`: create/read/update profile.
- `frontend/src/lib/solve-records.ts`: save completed solve, fetch personal stats, fetch difficulty leaderboard.

Add a `useSupabaseAccount` hook that:

- Creates or restores a Supabase session.
- Keeps guest play local and reads an existing non-anonymous session only after an explicit account action.
- Ensures a profile row exists after sign-in.
- Exposes account state to the page: loading, guest/permanent, display name, error.

Add a `useSolveRecords` hook that:

- Accepts finish stats from `useSudokuGame`.
- Saves exactly once per completed solve.
- Exposes save state for the finish dialog and leaderboard panel.
- Fetches leaderboard rows by selected difficulty.

The existing local storage session remains the source for an in-progress board. Supabase stores completed solves, not live board edits, in V1.

## UI Design

The app remains a tutor workspace. Auth UI is compact and operational, not a landing-page feature.

Top bar:

- Add an account button beside the theme control.
- Guest state displays `Guest` with a small user icon.
- Permanent state displays the profile display name.
- The account popover lets users edit display name, sign in or upgrade, and sign out.

Finish dialog:

- Add a save status line after stats: saving, saved to leaderboard, or unable to save.
- Add a `View leaderboard` action.
- Keep `New puzzle` and `Keep the board`.

Right rail:

- Add a collapsible `Leaderboard` section.
- Difficulty selector defaults to the current generated difficulty when known.
- Rows show rank, display name, time, hints, checks, and date.
- Add a compact `Your stats` section showing completed solves, best time by selected difficulty, and recent solves.

Visual direction:

- Keep the existing dense Sudoku desk layout.
- Use restrained status badges and table-like leaderboard rows.
- Avoid marketing-style account cards or a large auth modal unless an OAuth provider requires redirect.

## Data Flow

1. User opens the app and can enter/import/generate a puzzle without interacting with auth UI.
2. When solving begins, `useSupabaseAccount` stays local. It does not create a Supabase session.
3. When the board reaches a valid complete solution, `useSudokuGame` exposes finish stats and locked givens.
4. `useSolveRecords` builds a solve record with the user id, profile, difficulty, puzzle fingerprint, and finish stats.
5. The record is inserted into Supabase under RLS.
6. The finish dialog shows whether the result was saved.
7. Leaderboard and personal stats read from Supabase and refresh after save.

## Error Handling

- If Supabase environment variables are missing, the app stays playable and shows account/leaderboard as unavailable.
- If no non-anonymous signed-in session exists, solving still works locally and the finish dialog reports that leaderboard saving requires sign-in.
- If saving a solve fails, the user can keep playing; the UI exposes a retry action while the finish dialog is open.
- If leaderboard loading fails, show an inline error and keep the rest of the solving UI usable.
- Duplicate save attempts for the same completed board in the same browser session are ignored client-side.

## Environment

Frontend build variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Supabase project setup:

- Keep anonymous sign-ins disabled.
- Configure optional OAuth provider later if desired.
- Run SQL migrations for profiles, solve records, RLS, grants, and leaderboard read surface.

## Testing

Tests are behavior tests and unit tests, not source-string checks.

Frontend unit tests:

- Supabase config returns unavailable when env vars are absent.
- Solve-record payload builder produces the expected difficulty, stats, and fingerprint.
- Leaderboard formatter sorts and displays rows consistently.

Frontend behavior tests:

- The app still starts in guest mode without requiring login.
- Solving a puzzle attempts to save a solve record once.
- The finish dialog shows saved/unavailable/retry states.
- The leaderboard section can display difficulty rows.

Backend tests:

- Existing FastAPI tests remain unchanged because Supabase data access is direct from the static frontend in V1.

Verification commands:

- `python3 -m unittest discover -s tests -v`
- `cd frontend && npm test -- --run`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run build`

## Rollout Notes

The first deployed version can ship with leaderboard unavailable until Supabase environment variables are set. This keeps local development and static builds stable. Production deployment needs Supabase redirect URLs only when permanent sign-in providers are enabled.
