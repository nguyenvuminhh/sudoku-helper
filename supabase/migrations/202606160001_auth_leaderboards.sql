create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_seed text not null check (char_length(avatar_seed) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.solve_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  puzzle_fingerprint text not null check (puzzle_fingerprint ~ '^[a-f0-9]{64}$'),
  difficulty text not null check (
    difficulty in ('easy', 'medium', 'hard', 'expert', 'master', 'extreme', 'advanced_7_8', 'advanced_8_plus', 'custom')
  ),
  elapsed_seconds integer not null check (elapsed_seconds >= 0),
  hints_used integer not null check (hints_used >= 0),
  checks_used integer not null check (checks_used >= 0),
  givens integer not null check (givens between 0 and 81),
  filled_by_user integer not null check (filled_by_user between 0 and 81),
  techniques text[] not null default '{}',
  completed_at timestamptz not null default now()
);

create index if not exists solve_records_difficulty_rank_idx
  on public.solve_records (difficulty, elapsed_seconds, completed_at);

create index if not exists solve_records_user_completed_idx
  on public.solve_records (user_id, completed_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.solve_records enable row level security;

drop policy if exists "Profiles are readable for leaderboard display." on public.profiles;
create policy "Profiles are readable for leaderboard display."
  on public.profiles
  for select
  using (true);

drop policy if exists "Users can create their own profile." on public.profiles;
create policy "Users can create their own profile."
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "Users can update their own profile." on public.profiles;
create policy "Users can update their own profile."
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "Users can read their own solve records." on public.solve_records;
create policy "Users can read their own solve records."
  on public.solve_records
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own solve records." on public.solve_records;
create policy "Users can create their own solve records."
  on public.solve_records
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create or replace function public.difficulty_leaderboard(
  selected_difficulty text,
  row_limit integer default 20
)
returns table (
  rank bigint,
  profile_id uuid,
  display_name text,
  difficulty text,
  elapsed_seconds integer,
  hints_used integer,
  checks_used integer,
  completed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ranked.rank,
    ranked.user_id as profile_id,
    profiles.display_name,
    ranked.difficulty,
    ranked.elapsed_seconds,
    ranked.hints_used,
    ranked.checks_used,
    ranked.completed_at
  from (
    select
      solve_records.*,
      rank() over (order by solve_records.elapsed_seconds asc, solve_records.completed_at asc) as rank
    from public.solve_records
    where solve_records.difficulty = selected_difficulty
  ) ranked
  join public.profiles on profiles.id = ranked.user_id
  order by ranked.elapsed_seconds asc, ranked.completed_at asc
  limit least(greatest(coalesce(row_limit, 20), 1), 100);
$$;

grant usage on schema public to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert on public.solve_records to authenticated;
grant execute on function public.difficulty_leaderboard(text, integer) to anon, authenticated;
