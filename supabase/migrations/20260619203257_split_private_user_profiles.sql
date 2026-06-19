create table if not exists public.user_private_profiles (
  user_id uuid references public.users(id) on delete cascade primary key,
  email varchar(255) unique not null,
  name varchar(100) not null,
  phone varchar(20) not null,
  phone_verified_at timestamp with time zone,
  phone_mfa_factor_id uuid,
  status varchar(20) not null default 'active' check (status in ('active', 'suspended')),
  suspended_until timestamp with time zone,
  suspension_reason text,
  moderation_updated_at timestamp with time zone,
  is_admin boolean not null default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

insert into public.user_private_profiles (
  user_id,
  email,
  name,
  phone,
  phone_verified_at,
  phone_mfa_factor_id,
  status,
  suspended_until,
  suspension_reason,
  moderation_updated_at,
  is_admin,
  created_at,
  updated_at
)
select
  id,
  email,
  name,
  phone,
  phone_verified_at,
  phone_mfa_factor_id,
  coalesce(status, 'active'),
  suspended_until,
  suspension_reason,
  moderation_updated_at,
  coalesce(is_admin, false),
  created_at,
  updated_at
from public.users
on conflict (user_id) do update
set
  email = excluded.email,
  name = excluded.name,
  phone = excluded.phone,
  phone_verified_at = excluded.phone_verified_at,
  phone_mfa_factor_id = excluded.phone_mfa_factor_id,
  status = excluded.status,
  suspended_until = excluded.suspended_until,
  suspension_reason = excluded.suspension_reason,
  moderation_updated_at = excluded.moderation_updated_at,
  is_admin = excluded.is_admin,
  updated_at = excluded.updated_at;

alter table public.user_private_profiles enable row level security;

revoke all on table public.user_private_profiles from anon, authenticated;
grant select on table public.user_private_profiles to authenticated;
grant all on table public.user_private_profiles to service_role;

drop policy if exists "Users can read own private profile" on public.user_private_profiles;
create policy "Users can read own private profile"
  on public.user_private_profiles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop trigger if exists handle_updated_at on public.user_private_profiles;
create trigger handle_updated_at before update on public.user_private_profiles
  for each row execute procedure public.handle_updated_at();

drop policy if exists "Users can read all users" on public.users;
drop policy if exists "Users can insert own profile" on public.users;

revoke all on table public.users from anon, authenticated;
grant select (id, nickname, nickname_updated_at, department, created_at, updated_at)
  on table public.users to authenticated;
grant update (nickname, nickname_updated_at)
  on table public.users to authenticated;
grant all on table public.users to service_role;

create policy "Authenticated users can read public profiles"
  on public.users
  for select
  to authenticated
  using (true);

drop policy if exists "Users can update own profile" on public.users;
create policy "Users can update own public profile"
  on public.users
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "Admins can read all reports" on public.reports;
create policy "Admins can read all reports"
  on public.reports
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.user_private_profiles
      where user_private_profiles.user_id = (select auth.uid())
        and user_private_profiles.is_admin = true
        and user_private_profiles.status = 'active'
    )
  );

drop policy if exists "Admins can update reports" on public.reports;
create policy "Admins can update reports"
  on public.reports
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.user_private_profiles
      where user_private_profiles.user_id = (select auth.uid())
        and user_private_profiles.is_admin = true
        and user_private_profiles.status = 'active'
    )
  )
  with check (
    exists (
      select 1
      from public.user_private_profiles
      where user_private_profiles.user_id = (select auth.uid())
        and user_private_profiles.is_admin = true
        and user_private_profiles.status = 'active'
    )
  );

drop policy if exists "Admins can read moderation actions" on public.user_moderation_actions;
create policy "Admins can read moderation actions"
  on public.user_moderation_actions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.user_private_profiles
      where user_private_profiles.user_id = (select auth.uid())
        and user_private_profiles.is_admin = true
        and user_private_profiles.status = 'active'
    )
  );

drop policy if exists "Admins can insert moderation actions" on public.user_moderation_actions;
create policy "Admins can insert moderation actions"
  on public.user_moderation_actions
  for insert
  to authenticated
  with check (
    admin_id = (select auth.uid())
    and exists (
      select 1
      from public.user_private_profiles
      where user_private_profiles.user_id = (select auth.uid())
        and user_private_profiles.is_admin = true
        and user_private_profiles.status = 'active'
    )
  );

drop policy if exists "Authenticated active users can create chat rooms" on public.chat_rooms;
create policy "Authenticated active users can create chat rooms"
  on public.chat_rooms
  for insert
  to authenticated
  with check (
    (select auth.uid()) = created_by
    and exists (
      select 1
      from public.user_private_profiles
      where user_private_profiles.user_id = (select auth.uid())
        and user_private_profiles.status = 'active'
    )
  );

drop policy if exists "Anyone can read participants" on public.room_participants;
drop policy if exists "Active users can join rooms" on public.room_participants;
drop policy if exists "Room creators can add themselves as participant" on public.room_participants;
drop policy if exists "Users can leave rooms" on public.room_participants;
drop policy if exists "Users can update their participation" on public.room_participants;

revoke all on table public.room_participants from anon, authenticated;
grant select, insert on table public.room_participants to authenticated;
grant all on table public.room_participants to service_role;

create policy "Authenticated users can read participants"
  on public.room_participants
  for select
  to authenticated
  using (true);

create policy "Room creators can add themselves as participant"
  on public.room_participants
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and confirmed = true
    and exists (
      select 1
      from public.chat_rooms
      where chat_rooms.id = room_participants.room_id
        and chat_rooms.created_by = (select auth.uid())
        and chat_rooms.status = 'active'
    )
  );

drop policy if exists "Active room participants can send messages" on public.messages;
create policy "Active room participants can send messages"
  on public.messages
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.user_private_profiles
      where user_private_profiles.user_id = (select auth.uid())
        and user_private_profiles.status = 'active'
    )
    and exists (
      select 1
      from public.room_participants
      where room_participants.room_id = messages.room_id
        and room_participants.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can manage own payout account" on public.user_payout_accounts;
drop policy if exists "Room participants can read creator payout accounts" on public.user_payout_accounts;

revoke all on table public.user_payout_accounts from anon, authenticated;
grant select, insert, update on table public.user_payout_accounts to authenticated;
grant all on table public.user_payout_accounts to service_role;

create policy "Users can read own payout account"
  on public.user_payout_accounts
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own payout account"
  on public.user_payout_accounts
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update own payout account"
  on public.user_payout_accounts
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter table public.users
  drop column if exists email,
  drop column if exists name,
  drop column if exists phone,
  drop column if exists phone_verified_at,
  drop column if exists phone_mfa_factor_id,
  drop column if exists status,
  drop column if exists suspended_until,
  drop column if exists suspension_reason,
  drop column if exists moderation_updated_at,
  drop column if exists is_admin;

create index if not exists user_private_profiles_email_idx
  on public.user_private_profiles (email);
create index if not exists user_private_profiles_status_idx
  on public.user_private_profiles (status);
create index if not exists user_private_profiles_is_admin_idx
  on public.user_private_profiles (is_admin)
  where is_admin = true;
