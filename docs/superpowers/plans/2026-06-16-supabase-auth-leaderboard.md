# Supabase Auth Leaderboards Implementation Plan

## 2026-06-17 Update

This plan was superseded for guest behavior: guest play is local-only and does
not start anonymous Supabase auth or touch leaderboard storage. Solve records
and leaderboard reads are active only for non-anonymous signed-in sessions.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local guest play plus Supabase Auth-backed saved solve records, personal stats, and difficulty leaderboards where every completed signed-in solve is leaderboard-eligible.

**Architecture:** The static Next.js frontend talks directly to Supabase through small helper modules guarded by RLS. FastAPI remains responsible for Sudoku/OCR endpoints only. The UI keeps local in-progress persistence and saves cloud records only after a puzzle is solved.

**Tech Stack:** Next.js static export, React hooks, TypeScript, Vitest/Testing Library, `@supabase/supabase-js`, Supabase Auth, Supabase Postgres SQL migrations with RLS.

## Global Constraints

- Default mode is local guest mode without Supabase anonymous auth.
- Every completed signed-in solve is saved and promoted to the leaderboard.
- V1 leaderboard grouping is by difficulty only.
- No clean-solve filtering or eligibility rules in V1.
- No Supabase service-role key in frontend code.
- FastAPI route wiring stays in `backend/app/main.py`; this feature should not add auth routes there.
- Add tests before changing behavior.
- Frontend behavior tests stay in Testing Library/Vitest and must not string-match component source.

---

## File Structure

- Create `supabase/migrations/202606160001_auth_leaderboards.sql`: tables, constraints, RLS policies, grants, and leaderboard RPC.
- Modify `frontend/package.json` and `frontend/package-lock.json`: add `@supabase/supabase-js`.
- Create `frontend/src/lib/supabase.ts`: env/config guard and lazy browser client factory.
- Create `frontend/src/lib/leaderboard.ts`: pure solve payload, fingerprint, display, and stats helpers.
- Create `frontend/src/lib/supabase-repository.ts`: Supabase read/write calls for profile, solve record, stats, and leaderboard data.
- Create `frontend/src/hooks/useSupabaseAccount.ts`: guest session/profile orchestration.
- Create `frontend/src/hooks/useSolveRecords.ts`: save-on-finish, retry, personal stats, and leaderboard loading.
- Create `frontend/src/components/AccountMenu.tsx`: compact account popover.
- Create `frontend/src/components/LeaderboardPanel.tsx`: difficulty leaderboard and personal stats UI.
- Modify `frontend/src/components/TopBar.tsx`: place account button beside theme toggle.
- Modify `frontend/src/components/FinishDialog.tsx`: show cloud save state and leaderboard action.
- Modify `frontend/src/components/SolvingPanel.tsx`: add leaderboard disclosure row.
- Modify `frontend/src/hooks/useSudokuGame.ts`: expose solve metadata needed by cloud saving.
- Modify `frontend/src/app/page.tsx`: wire account and solve record hooks into UI.
- Modify `frontend/src/app/globals.css`: compact account/leaderboard/finish-save styling.
- Add tests beside new lib modules and extend `frontend/src/app/page.test.tsx`.

---

### Task 1: Supabase Config, SQL Migration, and Pure Leaderboard Helpers

**Files:**
- Create: `supabase/migrations/202606160001_auth_leaderboards.sql`
- Create: `frontend/src/lib/supabase.ts`
- Create: `frontend/src/lib/supabase.test.ts`
- Create: `frontend/src/lib/leaderboard.ts`
- Create: `frontend/src/lib/leaderboard.test.ts`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`

**Interfaces:**
- Produces: `getSupabaseConfig(): SupabaseConfig`
- Produces: `createBrowserSupabaseClient(): SupabaseClient | null`
- Produces: `buildPuzzleFingerprint(givens: SudokuGrid, difficulty: GeneratedLevel | "custom"): string`
- Produces: `buildSolveRecordInput(args: BuildSolveRecordArgs): SolveRecordInput`
- Produces: `formatLeaderboardTime(seconds: number): string`

- [ ] **Step 1: Write failing config tests**

```ts
// frontend/src/lib/supabase.test.ts
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
```

- [ ] **Step 2: Verify config tests fail**

Run: `cd frontend && npm test -- src/lib/supabase.test.ts --run`

Expected: FAIL because `frontend/src/lib/supabase.ts` does not exist.

- [ ] **Step 3: Write failing leaderboard helper tests**

```ts
// frontend/src/lib/leaderboard.test.ts
import { describe, expect, it } from "vitest";

import { buildPuzzleFingerprint, buildSolveRecordInput, formatLeaderboardTime } from "./leaderboard";
import { createEmptyGrid, createGivenMask } from "./sudoku-state";

describe("leaderboard helpers", () => {
  it("builds a stable puzzle fingerprint from givens and difficulty", async () => {
    const grid = createEmptyGrid();
    grid[0] = 5;
    grid[80] = 9;

    const first = await buildPuzzleFingerprint(grid, "easy");
    const second = await buildPuzzleFingerprint([...grid], "easy");
    const harder = await buildPuzzleFingerprint(grid, "hard");

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
    expect(harder).not.toBe(first);
  });

  it("builds a solve record payload from finish stats", async () => {
    const grid = createEmptyGrid();
    grid[0] = 5;
    grid[1] = 3;
    const givenMask = createGivenMask(grid);

    const result = await buildSolveRecordInput({
      userId: "user-1",
      givensGrid: grid,
      givenMask,
      difficulty: "medium",
      elapsedSeconds: 125,
      hintsUsed: 2,
      checksUsed: 1,
      techniques: ["Naked Single"]
    });

    expect(result).toMatchObject({
      user_id: "user-1",
      difficulty: "medium",
      elapsed_seconds: 125,
      hints_used: 2,
      checks_used: 1,
      givens: 2,
      filled_by_user: 79,
      techniques: ["Naked Single"]
    });
    expect(result.puzzle_fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("formats leaderboard times compactly", () => {
    expect(formatLeaderboardTime(65)).toBe("01:05");
    expect(formatLeaderboardTime(3661)).toBe("1:01:01");
  });
});
```

- [ ] **Step 4: Verify leaderboard tests fail**

Run: `cd frontend && npm test -- src/lib/leaderboard.test.ts --run`

Expected: FAIL because `frontend/src/lib/leaderboard.ts` does not exist.

- [ ] **Step 5: Install Supabase client**

Run: `cd frontend && npm install @supabase/supabase-js`

Expected: package and lockfile update with `@supabase/supabase-js`.

- [ ] **Step 6: Implement config and helpers**

Implement `frontend/src/lib/supabase.ts` with env guards and a lazy client. Implement `frontend/src/lib/leaderboard.ts` with Web Crypto hashing and pure payload/format helpers.

- [ ] **Step 7: Add SQL migration**

Create tables `profiles` and `solve_records`, enable RLS, create policies, grants, and an RPC named `difficulty_leaderboard(selected_difficulty text, row_limit integer default 20)`.

- [ ] **Step 8: Verify Task 1**

Run:

```bash
cd frontend
npm test -- src/lib/supabase.test.ts src/lib/leaderboard.test.ts --run
npm run typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit Task 1**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/lib/supabase.ts frontend/src/lib/supabase.test.ts frontend/src/lib/leaderboard.ts frontend/src/lib/leaderboard.test.ts supabase/migrations/202606160001_auth_leaderboards.sql
git commit -m "feat: add supabase leaderboard foundation"
```

---

### Task 2: Supabase Repository and Account Hook

**Files:**
- Create: `frontend/src/lib/supabase-repository.ts`
- Create: `frontend/src/lib/supabase-repository.test.ts`
- Create: `frontend/src/hooks/useSupabaseAccount.ts`
- Create: `frontend/src/components/AccountMenu.tsx`
- Modify: `frontend/src/components/TopBar.tsx`
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/app/page.test.tsx`

**Interfaces:**
- Consumes: `createBrowserSupabaseClient()`
- Produces: `ensureAnonymousSession(client): Promise<AccountUser>`
- Produces: `ensureProfile(client, user): Promise<UserProfile>`
- Produces: `useSupabaseAccount(): SupabaseAccountState`
- Produces: `<AccountMenu account={account} />`
- Produces: `<TopBar theme={theme} onToggleTheme={toggleTheme} account={account} />`

- [ ] **Step 1: Write repository tests first**

Mock a minimal Supabase client shape and assert that anonymous sign-in is not called in the default guest path, and that profile upsert uses a non-anonymous authenticated user id.

- [ ] **Step 2: Verify repository tests fail**

Run: `cd frontend && npm test -- src/lib/supabase-repository.test.ts --run`

Expected: FAIL because repository module does not exist.

- [ ] **Step 3: Implement repository functions**

Implement `ensureAnonymousSession`, `ensureProfile`, `updateDisplayName`, `signOut`, and typed errors for unavailable Supabase.

- [ ] **Step 4: Write behavior test for guest default**

Extend `frontend/src/app/page.test.tsx` so initial render shows an account button named `Guest` and still shows `Start a puzzle`.

- [ ] **Step 5: Verify behavior test fails**

Run: `cd frontend && npm test -- src/app/page.test.tsx --run`

Expected: FAIL because account UI is not rendered.

- [ ] **Step 6: Implement hook and account menu**

Implement `useSupabaseAccount` and `AccountMenu`; wire into `TopBar` and `page.tsx`.

- [ ] **Step 7: Verify Task 2**

Run:

```bash
cd frontend
npm test -- src/lib/supabase-repository.test.ts src/app/page.test.tsx --run
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

```bash
git add frontend/src/lib/supabase-repository.ts frontend/src/lib/supabase-repository.test.ts frontend/src/hooks/useSupabaseAccount.ts frontend/src/components/AccountMenu.tsx frontend/src/components/TopBar.tsx frontend/src/app/page.tsx frontend/src/app/page.test.tsx
git commit -m "feat: add guest account shell"
```

---

### Task 3: Save Solves and Show Leaderboards

**Files:**
- Create: `frontend/src/hooks/useSolveRecords.ts`
- Create: `frontend/src/components/LeaderboardPanel.tsx`
- Modify: `frontend/src/lib/supabase-repository.ts`
- Modify: `frontend/src/lib/supabase-repository.test.ts`
- Modify: `frontend/src/hooks/useSudokuGame.ts`
- Modify: `frontend/src/components/FinishDialog.tsx`
- Modify: `frontend/src/components/SolvingPanel.tsx`
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/app/page.test.tsx`
- Modify: `frontend/src/app/globals.css`

**Interfaces:**
- Consumes: `buildSolveRecordInput(args)`
- Produces: `saveSolveRecord(client, record): Promise<SolveRecordRow>`
- Produces: `fetchDifficultyLeaderboard(client, difficulty, limit): Promise<LeaderboardRow[]>`
- Produces: `fetchPersonalStats(client, userId, difficulty): Promise<PersonalStats>`
- Produces: `useSolveRecords({ account, solveMetadata }): SolveRecordsState`
- Produces: `<LeaderboardPanel state={solveRecords} />`

- [ ] **Step 1: Write repository data tests first**

Add tests for `saveSolveRecord`, `fetchDifficultyLeaderboard`, and `fetchPersonalStats` using a fake Supabase query builder.

- [ ] **Step 2: Verify repository data tests fail**

Run: `cd frontend && npm test -- src/lib/supabase-repository.test.ts --run`

Expected: FAIL because save/read functions do not exist.

- [ ] **Step 3: Implement repository data functions**

Insert solve records into `solve_records`, call `difficulty_leaderboard`, and select personal rows scoped by current user.

- [ ] **Step 4: Write finish-save behavior test first**

Mock the Supabase repository boundary and complete the existing two-cell puzzle. Assert that the finish dialog shows `Saved to leaderboard` and a leaderboard row with the selected difficulty.

- [ ] **Step 5: Verify finish-save behavior test fails**

Run: `cd frontend && npm test -- src/app/page.test.tsx --run`

Expected: FAIL because solve saving and leaderboard UI do not exist.

- [ ] **Step 6: Expose solve metadata from game hook**

Add locked givens grid, generated/current difficulty, and a stable completion key to `useSudokuGame`.

- [ ] **Step 7: Implement save hook and UI wiring**

Implement `useSolveRecords`, add save status to `FinishDialog`, add `LeaderboardPanel` inside `SolvingPanel`, and wire everything in `page.tsx`.

- [ ] **Step 8: Add CSS**

Add compact styles for `.account-menu`, `.leaderboard-panel`, `.leaderboard-row`, `.stat-strip`, and `.finish-save`.

- [ ] **Step 9: Verify Task 3**

Run:

```bash
cd frontend
npm test -- src/lib/supabase-repository.test.ts src/app/page.test.tsx --run
npm run typecheck
npm run build
```

Expected: PASS.

- [ ] **Step 10: Commit Task 3**

```bash
git add frontend/src/hooks/useSolveRecords.ts frontend/src/components/LeaderboardPanel.tsx frontend/src/lib/supabase-repository.ts frontend/src/lib/supabase-repository.test.ts frontend/src/hooks/useSudokuGame.ts frontend/src/components/FinishDialog.tsx frontend/src/components/SolvingPanel.tsx frontend/src/app/page.tsx frontend/src/app/page.test.tsx frontend/src/app/globals.css
git commit -m "feat: save solves to difficulty leaderboards"
```

---

### Task 4: Final Verification and Docs

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-06-16-supabase-auth-leaderboard.md`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: documented Supabase env and migration setup.

- [ ] **Step 1: Add README setup notes**

Document `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, disabled anonymous sign-in, and migration application.

- [ ] **Step 2: Run full verification**

Run:

```bash
python3 -m unittest discover -s tests -v
cd frontend
npm test -- --run
npm run typecheck
npm run build
```

Expected: all pass.

- [ ] **Step 3: Commit docs and final plan state**

```bash
git add README.md docs/superpowers/plans/2026-06-16-supabase-auth-leaderboard.md
git commit -m "docs: document supabase leaderboard setup"
```

---

## Execution Status

- Task 1 complete in `b776ec9`: Supabase dependency, config helper, leaderboard helpers, and SQL migration.
- Task 2 complete in `dea6e98`: guest account repository, hook, top-bar account menu, and behavior test.
- Task 3 complete in `228ac6b`: solve saving, difficulty leaderboard UI, finish-dialog save state, and focused verification.
- Task 4 in progress: README setup notes and full verification.
