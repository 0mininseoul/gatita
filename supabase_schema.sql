-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- Location enum
create type location_type as enum (
  '가천대역_1번출구',
  '가천대학교_정문',
  '교육대학원',
  '제3기숙사',
  '제2기숙사',
  'AI공학관',
  '중앙도서관',
  '학생회관'
);

-- Users table (public profile). A row is auto-created on Gachon login via
-- handle_new_user(); nickname/department stay null until onboarding completes.
create table public.users (
  id uuid references auth.users on delete cascade primary key,
  nickname varchar(50) unique,
  nickname_updated_at timestamp with time zone,
  department varchar(100),
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Private profiles table. Never expose this table broadly to browser clients.
-- A row is auto-created on Gachon login; phone/bank fields and onboarded_at are
-- filled when the user completes onboarding. Payout (bank) fields live here.
create table public.user_private_profiles (
  user_id uuid references public.users(id) on delete cascade primary key,
  email varchar(255) unique not null,
  name varchar(100),
  phone varchar(20),
  phone_verified_at timestamp with time zone,
  phone_mfa_factor_id uuid,
  bank_name varchar(50),
  account_number varchar(80),
  account_holder varchar(100),
  status varchar(20) not null default 'active' check (status in ('active', 'suspended')),
  suspended_until timestamp with time zone,
  suspension_reason text,
  moderation_updated_at timestamp with time zone,
  is_admin boolean not null default false,
  onboarded_at timestamp with time zone,
  pwa_installed boolean not null default false,
  push_enabled boolean not null default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Chat rooms table
create table public.chat_rooms (
  id uuid default uuid_generate_v4() primary key,
  title varchar(200) not null,
  from_location location_type not null,
  to_location location_type not null,
  departure_date date not null,
  departure_time time not null,
  max_participants integer default 4 check (max_participants >= 2 and max_participants <= 4),
  created_by uuid references public.users(id) on delete cascade not null,
  status varchar(20) default 'active' check (status in ('active', 'closed')),
  payout_revealed_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Room participants table
create table public.room_participants (
  id uuid default uuid_generate_v4() primary key,
  room_id uuid references public.chat_rooms(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  confirmed boolean default false,
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
  last_read_at timestamp with time zone,
  unique(room_id, user_id)
);

-- Messages table
create table public.messages (
  id uuid default uuid_generate_v4() primary key,
  room_id uuid references public.chat_rooms(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Reports table
create table public.reports (
  id uuid default uuid_generate_v4() primary key,
  room_id uuid references public.chat_rooms(id) on delete set null,
  reporter_id uuid references public.users(id) on delete cascade not null,
  reported_id uuid references public.users(id) on delete cascade not null,
  reason text not null,
  status varchar(20) default 'pending' check (status in ('pending', 'reviewed', 'resolved')),
  resolution_action varchar(30) check (
    resolution_action is null
    or resolution_action in ('no_action', 'warning', 'suspend_7d', 'suspend_30d', 'suspend_permanent')
  ),
  resolution_note text,
  resolved_by uuid references public.users(id) on delete set null,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- User moderation actions table
create table public.user_moderation_actions (
  id uuid default uuid_generate_v4() primary key,
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
  acknowledged_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Favorites table. 즐겨찾기 겸 "경로 구독" — notify_* 컬럼으로 알림 조건을 정의한다.
-- notify_from > notify_to 이면 자정을 넘는 구간으로 해석한다 (예: 22:00~02:00).
-- 둘 다 null 이면 종일. 이 대소 관계를 의미로 쓰므로 from/to 순서에 제약을 걸지 않는다.
create table public.favorites (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  from_location location_type not null,
  to_location location_type not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  notify_enabled boolean not null default true,
  notify_from time,
  notify_to time,
  -- 0=일요일 … 6=토요일. 빈 배열은 "알림 없음"과 같으므로 금지한다.
  -- array_length(빈배열, 1)은 0이 아니라 NULL을 반환하므로 coalesce로 감싼다
  -- (감싸지 않으면 NULL between ... => NULL이 되어 CHECK가 통과시켜버린다).
  notify_weekdays smallint[] not null default '{0,1,2,3,4,5,6}',
  unique(user_id, from_location, to_location),
  constraint favorites_notify_weekdays_valid check (
    coalesce(array_length(notify_weekdays, 1), 0) between 1 and 7
    and notify_weekdays <@ '{0,1,2,3,4,5,6}'::smallint[]
  ),
  -- 한쪽만 설정된 반쪽 구간을 막는다.
  constraint favorites_notify_window_paired check (
    (notify_from is null and notify_to is null)
    or (notify_from is not null and notify_to is not null)
  )
);

-- 매칭 이력 보존용 append-only 이벤트 로그.
-- room_participants 는 나가기 시 행이 삭제되므로(app/api/rooms/[id]/leave/route.ts)
-- "누가 언제 참여했다 나갔는가"가 남지 않는다. 정원 체크와 메시지 RLS 가 모두
-- room_participants 를 참조하므로 그 테이블의 의미는 바꾸지 않고 이벤트 로그로
-- 별도 기록한다.
--
-- 멤버십 상태 1행이 아니라 이벤트 로그다: 참여할 때마다 'joined' 행을, 나갈 때마다
-- 'left' 행을 추가만 한다(기존 행을 갱신하지 않음). 재입장/재이탈도 전부 기록에 남는다.
-- RLS 정책은 두지 않는다 — service_role(서버) 전용 접근이며 일반 클라이언트는 읽기도
-- 쓰기도 불가하다.
create table public.room_participant_events (
  id uuid default uuid_generate_v4() primary key,
  room_id uuid references public.chat_rooms(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  event_type varchar(10) not null check (event_type in ('joined', 'left')),
  occurred_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique(room_id, user_id, event_type, occurred_at)
);

create index room_participant_events_room_id_occurred_at_idx
  on public.room_participant_events using btree (room_id, occurred_at);

-- Web Push 구독 (기기별 endpoint 유일). 저장/발송은 서버(service_role).
-- 발송 파이프라인: messages insert 트리거(notify_new_message) → pg_net → /api/push/dispatch → web-push.
create table public.push_subscriptions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 출발시각 이후 나가기 시 "택시 탑승을 완료하셨나요?" 응답(예/아니오) 기록.
create table public.ride_completions (
  id uuid default uuid_generate_v4() primary key,
  room_id uuid references public.chat_rooms(id) on delete set null,
  user_id uuid references public.users(id) on delete cascade not null,
  boarded boolean not null,
  answered_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (room_id, user_id)
);

-- Enable RLS (Row Level Security)
alter table public.users enable row level security;
alter table public.user_private_profiles enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.room_participants enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;
alter table public.user_moderation_actions enable row level security;
alter table public.favorites enable row level security;
alter table public.room_participant_events enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.ride_completions enable row level security;

-- Explicit Data API grants
grant usage on schema public to authenticated;
grant usage on type public.location_type to authenticated;

grant select (id, nickname, nickname_updated_at, department, avatar_url, created_at, updated_at)
  on table public.users to authenticated;
grant update (nickname, nickname_updated_at, avatar_url) on table public.users to authenticated;
grant select on table public.user_private_profiles to authenticated;
grant select, insert, update, delete on table public.chat_rooms to authenticated;
grant select, insert on table public.room_participants to authenticated;
grant all on table public.room_participants to service_role;
grant select, insert on table public.messages to authenticated;
grant select, insert, update on table public.reports to authenticated;
grant select, insert on table public.user_moderation_actions to authenticated;
-- 경로 구독 API가 notify_* 값을 수정/생성한다. 처음에는 PATCH 전용으로 notify_* 4개
-- 컬럼만 update grant를 좁혔었지만(20260806093000), POST /api/routes 의
-- upsert(ON CONFLICT DO UPDATE)는 충돌 발생 여부와 무관하게 SET 대상 전체 컬럼
-- (user_id/from_location/to_location 포함)에 ACL_UPDATE를 요구해 모든 구독 생성 요청이
-- permission denied로 실패했다(C-1 최종 리뷰 발견). 20260807000000이 테이블 전체
-- update grant로 넓혔다 — RLS(auth.uid() = user_id, using만 지정)가 행을 스코프하므로
-- 소유자 이전은 여전히 불가능하다.
grant select, insert, update, delete on table public.favorites to authenticated;

-- RLS Policies
-- Users: public profile fields only. Private fields live in user_private_profiles.
create policy "Authenticated users can read public profiles"
  on public.users for select to authenticated using (true);
create policy "Users can update own public profile"
  on public.users for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

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

create policy "Users can read own private profile"
  on public.user_private_profiles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Payout (bank) fields live on user_private_profiles and are written only by the
-- server (admin client) via /api/profile/complete and /api/profile/payout. Room
-- creator payout display is served through a room-scoped server API.

-- Chat rooms: Everyone can read, authenticated active users can create
create policy "Anyone can read chat rooms" on public.chat_rooms for select using (true);
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
create policy "Room creators can transfer active rooms to participants"
  on public.chat_rooms for update
  using (auth.uid() = created_by)
  with check (
    auth.uid() = created_by
    or exists (
      select 1
      from public.room_participants
      where room_participants.room_id = chat_rooms.id
        and room_participants.user_id = chat_rooms.created_by
    )
  );
create policy "Authenticated users can lock active rooms for capacity checks"
  on public.chat_rooms
  for update
  to authenticated
  using (status = 'active')
  with check (false);
create policy "Room creators can delete their rooms" on public.chat_rooms for delete using (auth.uid() = created_by);

-- Room participants: browser clients can read participants and only add themselves
-- as the creator's initial participant row. Joins, leaves, and confirmation use server APIs.
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

-- Messages: Room participants can read/send messages
create policy "Room participants can read messages" on public.messages
  for select using (
    exists (
      select 1 from public.room_participants
      where room_id = messages.room_id and user_id = auth.uid()
    )
  );
create policy "Active room participants can send messages" on public.messages
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
    and
    exists (
      select 1 from public.room_participants
      where room_id = messages.room_id and user_id = (select auth.uid())
    )
  );

-- Reports: Users can create reports, admins can read all
create policy "Users can create reports" on public.reports for insert with check (auth.uid() = reporter_id);
create policy "Admins can read all reports" on public.reports for select using (
  exists (
    select 1 from public.user_private_profiles
    where user_id = auth.uid() and is_admin = true and status = 'active'
  )
);
create policy "Admins can update reports" on public.reports for update using (
  exists (
    select 1 from public.user_private_profiles
    where user_id = auth.uid() and is_admin = true and status = 'active'
  )
)
with check (
  exists (
    select 1 from public.user_private_profiles
    where user_id = auth.uid() and is_admin = true and status = 'active'
  )
);

-- User moderation actions: admins can read and insert operational actions
create policy "Admins can read moderation actions"
  on public.user_moderation_actions
  for select
  using (
    exists (
      select 1 from public.user_private_profiles
      where user_id = auth.uid()
        and is_admin = true
        and status = 'active'
    )
  );

create policy "Admins can insert moderation actions"
  on public.user_moderation_actions
  for insert
  with check (
    admin_id = (select auth.uid())
    and exists (
      select 1 from public.user_private_profiles
      where user_id = auth.uid()
        and is_admin = true
        and status = 'active'
    )
  );

-- Favorites: Users can manage their own favorites
create policy "Users can manage own favorites" on public.favorites for all using (auth.uid() = user_id);

-- Functions and triggers for updated_at
create or replace function public.handle_updated_at()
returns trigger
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

revoke all on function public.handle_updated_at() from public, anon, authenticated;

create trigger handle_updated_at before update on public.users
  for each row execute procedure public.handle_updated_at();

create trigger handle_updated_at before update on public.user_private_profiles
  for each row execute procedure public.handle_updated_at();

-- Auto-create profile rows for Gachon users on signup. Mirrors the app's
-- extractGachonProfileFromMetadata() parsing ("이름/학과") in SQL. Non-Gachon
-- signups are left without profile rows (callback rejects + deletes them).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  display_name text;
  parsed_name text;
  parsed_department text;
  parsed_avatar text;
begin
  if new.email is null or lower(new.email) not like '%@gachon.ac.kr' then
    return new;
  end if;

  display_name := coalesce(
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'display_name'
  );

  parsed_name := nullif(trim(split_part(coalesce(display_name, ''), '/', 1)), '');
  parsed_department := nullif(trim(split_part(coalesce(display_name, ''), '/', 2)), '');
  parsed_avatar := coalesce(
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'picture'
  );

  insert into public.users (id, nickname, department, avatar_url)
  values (new.id, null, parsed_department, parsed_avatar)
  on conflict (id) do nothing;

  insert into public.user_private_profiles (user_id, email, name, status, is_admin, onboarded_at)
  values (new.id, new.email, parsed_name, 'active', false, null)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Total unread messages across the caller's active rooms (for the map badge).
create or replace function public.get_my_unread_count()
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::int
  from public.messages m
  join public.room_participants rp on rp.room_id = m.room_id
  join public.chat_rooms r on r.id = m.room_id
  where rp.user_id = auth.uid()
    and r.status = 'active'
    and m.user_id <> auth.uid()
    and m.created_at > coalesce(rp.last_read_at, rp.joined_at);
$$;

revoke all on function public.get_my_unread_count() from public, anon;
grant execute on function public.get_my_unread_count() to authenticated;

-- Unread messages grouped by active room for the map "my rooms" sheet.
create or replace function public.get_my_unread_room_counts()
returns table(room_id uuid, unread_count integer)
language sql
security definer
set search_path = public
as $$
  select
    m.room_id,
    count(*)::int as unread_count
  from public.messages m
  join public.room_participants rp on rp.room_id = m.room_id
  join public.chat_rooms r on r.id = m.room_id
  where rp.user_id = auth.uid()
    and r.status = 'active'
    and m.user_id <> auth.uid()
    and m.created_at > coalesce(rp.last_read_at, rp.joined_at)
  group by m.room_id;
$$;

revoke all on function public.get_my_unread_room_counts() from public, anon;
grant execute on function public.get_my_unread_room_counts() to authenticated;

-- Guard room capacity at the database level.
create or replace function public.enforce_room_capacity()
returns trigger
set search_path = ''
as $$
declare
  current_count integer;
  max_count integer;
  room_status text;
begin
  select chat_rooms.max_participants, chat_rooms.status
    into max_count, room_status
    from public.chat_rooms
    where chat_rooms.id = new.room_id
    for update;

  if max_count is null then
    raise exception 'chat room not found';
  end if;

  if room_status <> 'active' then
    raise exception 'chat room is not active';
  end if;

  select count(*)
    into current_count
    from public.room_participants
    where room_participants.room_id = new.room_id;

  if current_count >= max_count then
    raise exception 'chat room is full';
  end if;

  return new;
end;
$$ language plpgsql;

revoke all on function public.enforce_room_capacity() from public, anon, authenticated;

create trigger enforce_room_capacity_before_insert
  before insert on public.room_participants
  for each row execute procedure public.enforce_room_capacity();

-- Query indexes for the main mobile flows
create index chat_rooms_route_date_status_time_idx
  on public.chat_rooms (from_location, to_location, departure_date, status, departure_time);

create index chat_rooms_created_by_idx on public.chat_rooms (created_by);
create index room_participants_room_id_idx on public.room_participants (room_id);
create index room_participants_user_id_idx on public.room_participants (user_id);
create index messages_room_id_created_at_idx on public.messages (room_id, created_at);
create index reports_reporter_id_idx on public.reports (reporter_id);
create index reports_reported_id_idx on public.reports (reported_id);
create index reports_status_idx on public.reports (status);
create index reports_resolution_action_idx on public.reports (resolution_action);
create index reports_resolved_at_idx on public.reports (resolved_at desc);
create index user_private_profiles_email_idx on public.user_private_profiles (email);
create index user_private_profiles_status_idx on public.user_private_profiles (status);
create index user_private_profiles_is_admin_idx
  on public.user_private_profiles (is_admin)
  where is_admin = true;
create index user_moderation_actions_user_id_idx on public.user_moderation_actions (user_id, created_at desc);
create index user_moderation_actions_report_id_idx on public.user_moderation_actions (report_id);
create index user_moderation_actions_created_at_idx on public.user_moderation_actions (created_at desc);
create index user_moderation_actions_unacknowledged_warning_idx
  on public.user_moderation_actions (user_id, created_at desc)
  where action = 'warning' and acknowledged_at is null;
create index favorites_user_id_idx on public.favorites (user_id);
create index favorites_route_idx
  on public.favorites (from_location, to_location) where notify_enabled;

-- 참여 이력: RLS 정책 없음(일반 클라이언트는 읽기/쓰기 모두 차단), service_role 전용 접근.
grant all on table public.room_participant_events to service_role;

-- Push subscriptions / ride completions: 접근은 서버(service_role)에서, 본인 소유만 클라이언트 허용
create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);
create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete using (auth.uid() = user_id);
create policy "ride_completions_select_own" on public.ride_completions
  for select using (auth.uid() = user_id);

-- 새 메시지 → Web Push 발송 트리거 (실패해도 메시지 전송은 절대 막지 않음).
-- Vault 시크릿 'push_dispatch_secret' 필요. 자세한 내용은 migrations/20260717002000_message_push_notification.sql
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  begin
    select decrypted_secret into v_secret
    from vault.decrypted_secrets
    where name = 'push_dispatch_secret';

    if v_secret is not null then
      perform net.http_post(
        url := 'https://gatita.kro.kr/api/push/dispatch',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
        body := jsonb_build_object('message_id', new.id)
      );
    end if;
  exception when others then
    raise warning 'push dispatch notify failed: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists on_message_created_push on public.messages;
create trigger on_message_created_push
  after insert on public.messages
  for each row execute function public.notify_new_message();

-- 새 방 생성 → 그 경로를 구독한 이용자에게 Web Push 발송 트리거 (notify_new_message 와 동일 구조).
-- 발송 실패가 방 생성을 막지 않도록 예외를 삼킨다. 자세한 내용은
-- migrations/20260806092000_room_alert_notification.sql
create or replace function public.notify_new_room()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  begin
    select decrypted_secret into v_secret
    from vault.decrypted_secrets
    where name = 'push_dispatch_secret';

    if v_secret is not null then
      perform net.http_post(
        url := 'https://gatita.kro.kr/api/push/dispatch',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
        body := jsonb_build_object('room_id', new.id)
      );
    end if;
  exception when others then
    raise warning 'room push dispatch notify failed: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists notify_new_room_trigger on public.chat_rooms;
create trigger notify_new_room_trigger
  after insert on public.chat_rooms
  for each row execute function public.notify_new_room();

-- Supabase Realtime publication for live chat and participant membership updates
alter table public.messages replica identity full;
alter table public.room_participants replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'room_participants'
  ) then
    alter publication supabase_realtime add table public.room_participants;
  end if;
end $$;
