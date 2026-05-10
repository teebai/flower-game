create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  provider text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are readable by everyone"
on public.profiles
for select
using (true);

create policy "users can upsert their own profile"
on public.profiles
for all
using (auth.uid() = id)
with check (auth.uid() = id);
