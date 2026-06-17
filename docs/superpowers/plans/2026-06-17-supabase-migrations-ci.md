# Supabase Migrations CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically apply checked-in Supabase migrations to the production Supabase project after migration changes land on `main`.

**Architecture:** Add one GitHub Actions workflow scoped to `supabase/migrations/**` pushes and manual dispatch. The workflow installs the Supabase CLI, initializes a config file when this repo has only a migrations directory, links to the project using GitHub secrets, and runs `supabase db push` non-interactively.

**Tech Stack:** GitHub Actions, `supabase/setup-cli@v2`, Supabase CLI, Python `unittest` release-file checks, Markdown docs.

## Global Constraints

- Run only on `main` pushes that touch `supabase/migrations/**`, plus manual `workflow_dispatch`.
- Use GitHub secrets only for database credentials and Supabase access tokens.
- Do not put service-role keys in frontend build variables.
- Keep anonymous Supabase sign-ins disabled.
- Use `--yes` and `--password` so CI cannot hang on prompts.

---

### Task 1: Supabase Migration Deploy Workflow

**Files:**
- Create: `.github/workflows/supabase-migrations.yml`
- Modify: `tests/test_public_release_files.py`
- Modify: `README.md`

**Interfaces:**
- Consumes: Supabase SQL migrations under `supabase/migrations/**`.
- Produces: A GitHub Actions workflow named `Deploy Supabase Migrations` that uses `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, and `SUPABASE_DB_PASSWORD`.

- [x] **Step 1: Write the failing release-file test**

Add assertions that `.github/workflows/supabase-migrations.yml` exists, installs the Supabase CLI, links with `SUPABASE_PROJECT_ID`, pushes migrations with `supabase db push`, and documents the required secrets in `README.md`.

- [x] **Step 2: Verify the test fails**

Run: `python3 -m unittest tests.test_public_release_files.PublicReleaseFilesTests.test_supabase_migration_workflow_deploys_checked_in_migrations -v`

Expected: FAIL because `.github/workflows/supabase-migrations.yml` does not exist.

- [x] **Step 3: Add the workflow and docs**

Create `.github/workflows/supabase-migrations.yml` with path-scoped `main` push and manual dispatch triggers, `supabase/setup-cli@v2`, `supabase init` when `supabase/config.toml` is absent, `supabase link`, and `supabase db push`.

Update `README.md` with the exact required GitHub Actions secrets and the auto-run behavior.

- [x] **Step 4: Verify the test passes**

Run: `python3 -m unittest tests.test_public_release_files.PublicReleaseFilesTests.test_supabase_migration_workflow_deploys_checked_in_migrations -v`

Expected: PASS.

- [x] **Step 5: Run full verification**

Run:

```bash
python3 -m unittest discover -s tests -v
cd frontend && npm test -- --run
cd frontend && npm run typecheck
cd frontend && npm run build
```

Expected: all commands exit 0.
