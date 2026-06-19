alter table public.reports
  add column if not exists resolution_action varchar(30),
  add column if not exists resolution_note text,
  add column if not exists resolved_by uuid references public.users(id) on delete set null,
  add column if not exists resolved_at timestamp with time zone;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reports_resolution_action_check'
      and conrelid = 'public.reports'::regclass
  ) then
    alter table public.reports
      add constraint reports_resolution_action_check
      check (
        resolution_action is null
        or resolution_action in ('no_action', 'warning', 'suspend_7d', 'suspend_30d', 'suspend_permanent')
      );
  end if;
end $$;

alter table public.user_moderation_actions
  add column if not exists acknowledged_at timestamp with time zone;

create index if not exists reports_resolution_action_idx
  on public.reports (resolution_action);

create index if not exists reports_resolved_at_idx
  on public.reports (resolved_at desc);

create index if not exists user_moderation_actions_unacknowledged_warning_idx
  on public.user_moderation_actions (user_id, created_at desc)
  where action = 'warning' and acknowledged_at is null;

-- Prevent client-side privilege escalation. Public clients may create their
-- profile and update ordinary profile fields, but operational columns stay
-- server/admin-only.
revoke insert, update on table public.users from authenticated;

grant insert (id, email, name, phone, nickname, department)
  on table public.users to authenticated;

grant update (nickname, nickname_updated_at)
  on table public.users to authenticated;

drop policy if exists "Users can update own profile" on public.users;
create policy "Users can update own profile"
  on public.users
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "Users can insert own profile" on public.users;
create policy "Users can insert own profile"
  on public.users
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "Admins can read all reports" on public.reports;
create policy "Admins can read all reports"
  on public.reports
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.users
      where users.id = (select auth.uid())
        and users.is_admin = true
        and users.status = 'active'
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
      from public.users
      where users.id = (select auth.uid())
        and users.is_admin = true
        and users.status = 'active'
    )
  )
  with check (
    exists (
      select 1
      from public.users
      where users.id = (select auth.uid())
        and users.is_admin = true
        and users.status = 'active'
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
      from public.users
      where users.id = (select auth.uid())
        and users.is_admin = true
        and users.status = 'active'
    )
  );

drop policy if exists "Authenticated users can create chat rooms" on public.chat_rooms;
create policy "Authenticated active users can create chat rooms"
  on public.chat_rooms
  for insert
  to authenticated
  with check (
    (select auth.uid()) = created_by
    and exists (
      select 1
      from public.users
      where users.id = (select auth.uid())
        and users.status = 'active'
    )
  );

drop policy if exists "Users can join rooms" on public.room_participants;
create policy "Active users can join rooms"
  on public.room_participants
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.users
      where users.id = (select auth.uid())
        and users.status = 'active'
    )
  );

drop policy if exists "Room participants can send messages" on public.messages;
create policy "Active room participants can send messages"
  on public.messages
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.users
      where users.id = (select auth.uid())
        and users.status = 'active'
    )
    and exists (
      select 1
      from public.room_participants
      where room_participants.room_id = messages.room_id
        and room_participants.user_id = (select auth.uid())
    )
  );
