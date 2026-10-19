-- User-owned one-line notes for the static memo site.
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 140),
  created_at timestamptz not null default now()
);

alter table public.notes enable row level security;

revoke all on table public.notes from public, anon, authenticated;
grant select, insert, delete on public.notes to authenticated;
grant usage on schema public to authenticated;

create policy "Users can read their own notes"
  on public.notes for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can add their own notes"
  on public.notes for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own notes"
  on public.notes for delete to authenticated
  using ((select auth.uid()) = user_id);
