-- Weld Seam Planner: database + storage schema.
-- Run once in Supabase Dashboard -> SQL Editor.

-- 1. Parts table: one row per uploaded STL, owned by one user.
create table if not exists public.parts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  file_path   text not null unique,       -- path inside the storage bucket: <user_id>/<file>
  size_bytes  bigint not null,
  plan        jsonb,                      -- saved seams + parameters (added in a later step)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists parts_user_id_created_at_idx
  on public.parts (user_id, created_at desc);

-- 2. Row Level Security: a user can only touch their own rows.
alter table public.parts enable row level security;

create policy "parts_select_own" on public.parts
  for select to authenticated using (user_id = auth.uid());

create policy "parts_insert_own" on public.parts
  for insert to authenticated with check (user_id = auth.uid());

create policy "parts_update_own" on public.parts
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "parts_delete_own" on public.parts
  for delete to authenticated using (user_id = auth.uid());

-- 3. Private storage bucket for STL files (50 MB cap per file).
insert into storage.buckets (id, name, public, file_size_limit)
values ('stl-files', 'stl-files', false, 52428800)
on conflict (id) do nothing;

-- 4. Storage policies: files live under a folder named after the user's id,
--    so a user can only read/write paths that start with their own id.
create policy "stl_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'stl-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "stl_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'stl-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "stl_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'stl-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "stl_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'stl-files' and (storage.foldername(name))[1] = auth.uid()::text);
