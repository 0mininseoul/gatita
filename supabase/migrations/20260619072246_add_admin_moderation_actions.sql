alter table public.users
  add column if not exists suspended_until timestamp with time zone,
  add column if not exists suspension_reason text,
  add column if not exists moderation_updated_at timestamp with time zone;

create table if not exists public.user_moderation_actions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  admin_id uuid references public.users(id) on delete set null,
  report_id uuid references public.reports(id) on delete set null,
  action varchar(30) not null check (
    action in ('warning', 'suspend_7d', 'suspend_30d', 'suspend_permanent', 'release')
  ),
  reason text,
  previous_status varchar(20),
  next_status varchar(20),
  suspended_until timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.user_moderation_actions enable row level security;

grant select, insert on table public.user_moderation_actions to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_moderation_actions'
      and policyname = 'Admins can read moderation actions'
  ) then
    create policy "Admins can read moderation actions"
      on public.user_moderation_actions
      for select
      using (
        exists (
          select 1
          from public.users
          where users.id = auth.uid()
            and users.is_admin = true
            and users.status = 'active'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_moderation_actions'
      and policyname = 'Admins can insert moderation actions'
  ) then
    create policy "Admins can insert moderation actions"
      on public.user_moderation_actions
      for insert
      with check (
        exists (
          select 1
          from public.users
          where users.id = auth.uid()
            and users.is_admin = true
            and users.status = 'active'
        )
      );
  end if;
end $$;

create index if not exists user_moderation_actions_user_id_idx
  on public.user_moderation_actions (user_id, created_at desc);

create index if not exists user_moderation_actions_report_id_idx
  on public.user_moderation_actions (report_id);

create index if not exists user_moderation_actions_created_at_idx
  on public.user_moderation_actions (created_at desc);
