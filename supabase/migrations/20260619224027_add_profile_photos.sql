alter table public.users
  add column if not exists avatar_url text;

grant select (id, nickname, nickname_updated_at, department, avatar_url, created_at, updated_at)
  on table public.users to authenticated;
grant update (nickname, nickname_updated_at, avatar_url) on table public.users to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read own profile photo object" on storage.objects;
drop policy if exists "Users can upload own profile photo" on storage.objects;
drop policy if exists "Users can update own profile photo" on storage.objects;
drop policy if exists "Users can delete own profile photo" on storage.objects;

create policy "Users can read own profile photo object"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can upload own profile photo"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can update own profile photo"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can delete own profile photo"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
