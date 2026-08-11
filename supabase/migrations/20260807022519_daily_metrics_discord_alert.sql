-- GATITA 일일 Metrics 알림.
--
-- 발송 시각은 Supabase/Postgres 기본 timezone(UTC) 기준 15:03이며,
-- 한국시간 00:03에 전일(KST) 데이터를 Discord 채널로 보낸다.
-- Discord 봇 토큰은 기존 가입 알림과 동일하게 Supabase Vault의
-- `discord_bot_token` 시크릿을 사용한다.

create schema if not exists private;
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- PWA 설치율을 날짜별로 계산할 수 있도록 최초 설치 시각을 남긴다.
alter table public.user_private_profiles
  add column if not exists pwa_installed_at timestamp with time zone;

update public.user_private_profiles
set pwa_installed_at = coalesce(updated_at, created_at, now())
where pwa_installed = true
  and pwa_installed_at is null;

comment on column public.user_private_profiles.pwa_installed_at
  is 'First observed PWA installation time; used for historical install-rate snapshots.';

-- 인증된 페이지 방문 이벤트를 서버에서 기록한다. Metrics의 일일 방문자 집계와
-- 보조 분석에 사용한다.
create table if not exists public.user_visit_events (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  path varchar(200),
  visited_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.user_visit_events enable row level security;
revoke all on table public.user_visit_events from anon, authenticated;
grant all on table public.user_visit_events to service_role;

create index if not exists user_visit_events_visited_at_user_id_idx
  on public.user_visit_events (visited_at, user_id);

create index if not exists user_visit_events_user_id_visited_at_idx
  on public.user_visit_events (user_id, visited_at);

-- 참여자 row는 나가기 시 삭제되므로, 방에 2명 이상이었던 적이 있는지를
-- 이후에도 계산할 수 있도록 join/leave 이력을 별도 보존한다.
create table if not exists public.room_participant_events (
  id uuid default uuid_generate_v4() primary key,
  room_id uuid references public.chat_rooms(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  event_type varchar(10) not null check (event_type in ('joined', 'left')),
  occurred_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (room_id, user_id, event_type, occurred_at)
);

alter table public.room_participant_events enable row level security;
revoke all on table public.room_participant_events from anon, authenticated;
grant all on table public.room_participant_events to service_role;

create index if not exists room_participant_events_room_id_occurred_at_idx
  on public.room_participant_events (room_id, occurred_at);

-- 출발지 마커를 눌러 하단 시트를 확인한 이력. MAU 집계에 사용한다.
create table if not exists public.location_sheet_view_events (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  from_location varchar(50) not null,
  viewed_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.location_sheet_view_events enable row level security;
revoke all on table public.location_sheet_view_events from anon, authenticated;
grant all on table public.location_sheet_view_events to service_role;

create index if not exists location_sheet_view_events_viewed_at_user_id_idx
  on public.location_sheet_view_events (viewed_at, user_id);

create index if not exists location_sheet_view_events_location_viewed_at_idx
  on public.location_sheet_view_events (from_location, viewed_at);

create or replace function private.set_pwa_installed_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.pwa_installed = true
     and old.pwa_installed = false
     and new.pwa_installed_at is null then
    new.pwa_installed_at = timezone('utc'::text, now());
  end if;

  return new;
end;
$$;

revoke all on function private.set_pwa_installed_at() from public, anon, authenticated;

drop trigger if exists set_pwa_installed_at on public.user_private_profiles;
create trigger set_pwa_installed_at
  before update on public.user_private_profiles
  for each row execute function private.set_pwa_installed_at();

create or replace function private.log_room_participant_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.room_participant_events (room_id, user_id, event_type, occurred_at)
    values (new.room_id, new.user_id, 'joined', coalesce(new.joined_at, timezone('utc'::text, now())))
    on conflict do nothing;
    return new;
  end if;

  insert into public.room_participant_events (room_id, user_id, event_type, occurred_at)
  values (old.room_id, old.user_id, 'left', timezone('utc'::text, now()))
  on conflict do nothing;
  return old;
end;
$$;

revoke all on function private.log_room_participant_event() from public, anon, authenticated;

drop trigger if exists log_room_participant_join on public.room_participants;
create trigger log_room_participant_join
  after insert on public.room_participants
  for each row execute function private.log_room_participant_event();

drop trigger if exists log_room_participant_leave on public.room_participants;
create trigger log_room_participant_leave
  after delete on public.room_participants
  for each row execute function private.log_room_participant_event();

-- 현재 남아 있는 참여자만이라도 최초 이력으로 채워 신규 설치 직후의 집계를
-- 빈 값으로 시작하지 않게 한다. 과거에 이미 나간 참여자는 과거 migration으로
-- 복원할 수 없으므로, 이 migration 이후부터 이력이 완전하게 쌓인다.
insert into public.room_participant_events (room_id, user_id, event_type, occurred_at)
select room_id, user_id, 'joined', joined_at
from public.room_participants
on conflict do nothing;

create table if not exists private.daily_metrics_delivery_log (
  report_date date primary key,
  queued_at timestamp with time zone default timezone('utc'::text, now()) not null,
  request_id bigint not null
);

create or replace function private.format_integer_delta(value bigint)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when coalesce(value, 0) > 0 then '+' || value::text
    when coalesce(value, 0) < 0 then value::text
    else '+0'
  end;
$$;

revoke all on function private.format_integer_delta(bigint) from public, anon, authenticated;

create or replace function private.format_rate(value numeric)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select to_char(coalesce(value, 0), 'FM999990.0') || '%';
$$;

revoke all on function private.format_rate(numeric) from public, anon, authenticated;

create or replace function private.format_rate_delta(value numeric)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when round(coalesce(value, 0), 1) > 0
      then '+' || to_char(round(value, 1), 'FM999990.0') || '%p'
    when round(coalesce(value, 0), 1) < 0
      then to_char(round(value, 1), 'FM999990.0') || '%p'
    else '+0.0%p'
  end;
$$;

revoke all on function private.format_rate_delta(numeric) from public, anon, authenticated;

create or replace function private.room_had_two_participants(
  room_id uuid,
  until_time timestamp with time zone
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select coalesce(
    (
      select max(active_count) >= 2
      from (
        select sum(
          case when e.event_type = 'joined' then 1 else -1 end
        ) over (
          order by e.occurred_at, e.id
          rows between unbounded preceding and current row
        ) as active_count
        from public.room_participant_events e
        where e.room_id = $1
          and e.user_id <> '5a018580-6558-44fc-a621-1fa2506e9d5e'::uuid
          and e.occurred_at <= $2
      ) counts
    ),
    false
  );
$$;

revoke all on function private.room_had_two_participants(uuid, timestamp with time zone)
  from public, anon, authenticated;

create or replace function private.send_daily_metrics()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_admin_id uuid := '5a018580-6558-44fc-a621-1fa2506e9d5e'::uuid;
  v_today_kst date;
  v_report_date date;
  v_previous_date date;
  v_day_start timestamp with time zone;
  v_day_end timestamp with time zone;
  v_previous_day_start timestamp with time zone;
  v_previous_day_end timestamp with time zone;
  v_mau_start timestamp with time zone;
  v_previous_mau_start timestamp with time zone;
  v_top_window_start timestamp with time zone;
  v_total_users bigint;
  v_previous_total_users bigint;
  v_onboarded_users bigint;
  v_previous_onboarded_users bigint;
  v_pwa_users bigint;
  v_previous_pwa_users bigint;
  v_today_visitors bigint;
  v_previous_visitors bigint;
  v_mau bigint;
  v_previous_mau bigint;
  v_today_rooms bigint;
  v_previous_rooms bigint;
  v_today_room_creators bigint;
  v_previous_room_creators bigint;
  v_today_active_rooms bigint;
  v_previous_active_rooms bigint;
  v_today_ride_successes bigint;
  v_previous_ride_successes bigint;
  v_onboarding_rate numeric;
  v_previous_onboarding_rate numeric;
  v_pwa_rate numeric;
  v_previous_pwa_rate numeric;
  v_today_room_ids uuid[] := '{}'::uuid[];
  v_previous_room_ids uuid[] := '{}'::uuid[];
  v_top record;
  v_top_rank integer := 0;
  v_top3 text := '';
  v_title text;
  v_fields jsonb := '[]'::jsonb;
  v_token text;
  v_request_id bigint;
begin
  -- Supabase DB는 UTC로 유지하고, 날짜 경계만 KST로 변환한다.
  v_today_kst := timezone('Asia/Seoul', clock_timestamp())::date;
  v_report_date := v_today_kst - 1;
  v_previous_date := v_report_date - 1;
  v_day_start := v_report_date::timestamp at time zone 'Asia/Seoul';
  v_day_end := (v_report_date + 1)::timestamp at time zone 'Asia/Seoul';
  v_previous_day_start := v_previous_date::timestamp at time zone 'Asia/Seoul';
  v_previous_day_end := v_report_date::timestamp at time zone 'Asia/Seoul';
  v_mau_start := (v_report_date - 29)::timestamp at time zone 'Asia/Seoul';
  v_previous_mau_start := (v_report_date - 30)::timestamp at time zone 'Asia/Seoul';
  v_top_window_start := timestamp '2026-06-15 00:00:00' at time zone 'Asia/Seoul';

  -- 보고일 기준으로 가입된 유저만 분모에 포함한다. 명시된 관리자 ID와
  -- is_admin 플래그가 켜진 계정은 모든 지표에서 제외한다.
  select count(*)
  into v_total_users
  from public.users u
  left join public.user_private_profiles p on p.user_id = u.id
  where u.created_at < v_day_end
    and u.id <> v_admin_id
    and coalesce(p.is_admin, false) = false;

  select count(*)
  into v_previous_total_users
  from public.users u
  left join public.user_private_profiles p on p.user_id = u.id
  where u.created_at < v_previous_day_end
    and u.id <> v_admin_id
    and coalesce(p.is_admin, false) = false;

  select count(*)
  into v_onboarded_users
  from public.users u
  left join public.user_private_profiles p on p.user_id = u.id
  where u.created_at < v_day_end
    and p.onboarded_at is not null
    and p.onboarded_at < v_day_end
    and u.id <> v_admin_id
    and coalesce(p.is_admin, false) = false;

  select count(*)
  into v_previous_onboarded_users
  from public.users u
  left join public.user_private_profiles p on p.user_id = u.id
  where u.created_at < v_previous_day_end
    and p.onboarded_at is not null
    and p.onboarded_at < v_previous_day_end
    and u.id <> v_admin_id
    and coalesce(p.is_admin, false) = false;

  select count(*)
  into v_pwa_users
  from public.users u
  left join public.user_private_profiles p on p.user_id = u.id
  where u.created_at < v_day_end
    and p.pwa_installed_at is not null
    and p.pwa_installed_at < v_day_end
    and u.id <> v_admin_id
    and coalesce(p.is_admin, false) = false;

  select count(*)
  into v_previous_pwa_users
  from public.users u
  left join public.user_private_profiles p on p.user_id = u.id
  where u.created_at < v_previous_day_end
    and p.pwa_installed_at is not null
    and p.pwa_installed_at < v_previous_day_end
    and u.id <> v_admin_id
    and coalesce(p.is_admin, false) = false;

  select count(distinct e.user_id)
  into v_today_visitors
  from public.room_participant_events e
  left join public.user_private_profiles p on p.user_id = e.user_id
  where e.event_type = 'joined'
    and e.occurred_at >= v_day_start
    and e.occurred_at < v_day_end
    and e.user_id <> v_admin_id
    and coalesce(p.is_admin, false) = false;

  select count(distinct e.user_id)
  into v_previous_visitors
  from public.room_participant_events e
  left join public.user_private_profiles p on p.user_id = e.user_id
  where e.event_type = 'joined'
    and e.occurred_at >= v_previous_day_start
    and e.occurred_at < v_previous_day_end
    and e.user_id <> v_admin_id
    and coalesce(p.is_admin, false) = false;

  select count(distinct e.user_id)
  into v_mau
  from public.location_sheet_view_events e
  left join public.user_private_profiles p on p.user_id = e.user_id
  where e.viewed_at >= v_mau_start
    and e.viewed_at < v_day_end
    and e.user_id <> v_admin_id
    and coalesce(p.is_admin, false) = false;

  select count(distinct e.user_id)
  into v_previous_mau
  from public.location_sheet_view_events e
  left join public.user_private_profiles p on p.user_id = e.user_id
  where e.viewed_at >= v_previous_mau_start
    and e.viewed_at < v_previous_day_end
    and e.user_id <> v_admin_id
    and coalesce(p.is_admin, false) = false;

  select count(*)
  into v_today_rooms
  from public.chat_rooms r
  left join public.user_private_profiles p on p.user_id = r.created_by
  where r.created_at >= v_day_start
    and r.created_at < v_day_end
    and r.created_by <> v_admin_id
    and coalesce(p.is_admin, false) = false;

  select count(*)
  into v_previous_rooms
  from public.chat_rooms r
  left join public.user_private_profiles p on p.user_id = r.created_by
  where r.created_at >= v_previous_day_start
    and r.created_at < v_previous_day_end
    and r.created_by <> v_admin_id
    and coalesce(p.is_admin, false) = false;

  if v_today_rooms > 0 then
    select coalesce(array_agg(r.id), '{}'::uuid[])
    into v_today_room_ids
    from public.chat_rooms r
    left join public.user_private_profiles p on p.user_id = r.created_by
    where r.created_at >= v_day_start
      and r.created_at < v_day_end
      and r.created_by <> v_admin_id
      and coalesce(p.is_admin, false) = false;

    select coalesce(array_agg(r.id), '{}'::uuid[])
    into v_previous_room_ids
    from public.chat_rooms r
    left join public.user_private_profiles p on p.user_id = r.created_by
    where r.created_at >= v_previous_day_start
      and r.created_at < v_previous_day_end
      and r.created_by <> v_admin_id
      and coalesce(p.is_admin, false) = false;

    select count(distinct r.created_by)
    into v_today_room_creators
    from public.chat_rooms r
    left join public.user_private_profiles p on p.user_id = r.created_by
    where r.created_at >= v_day_start
      and r.created_at < v_day_end
      and r.created_by <> v_admin_id
      and coalesce(p.is_admin, false) = false;

    select count(distinct r.created_by)
    into v_previous_room_creators
    from public.chat_rooms r
    left join public.user_private_profiles p on p.user_id = r.created_by
    where r.created_at >= v_previous_day_start
      and r.created_at < v_previous_day_end
      and r.created_by <> v_admin_id
      and coalesce(p.is_admin, false) = false;

    -- 활성화된 방은 보고일 생성 방 중 출발지 하단 시트가 한 번이라도
    -- 조회된 방으로 정의한다. 시트는 출발지 기준으로 방 목록을 보여준다.
    select count(distinct m.id)
    into v_today_active_rooms
    from public.chat_rooms m
    where m.id = any(v_today_room_ids)
      and exists (
        select 1
        from public.location_sheet_view_events e
        left join public.user_private_profiles p on p.user_id = e.user_id
        where e.from_location = m.from_location::text
          and e.viewed_at >= v_day_start
          and e.viewed_at < v_day_end
          and e.user_id <> v_admin_id
          and coalesce(p.is_admin, false) = false
      );

    select count(distinct m.id)
    into v_previous_active_rooms
    from public.chat_rooms m
    where m.id = any(v_previous_room_ids)
      and exists (
        select 1
        from public.location_sheet_view_events e
        left join public.user_private_profiles p on p.user_id = e.user_id
        where e.from_location = m.from_location::text
          and e.viewed_at >= v_previous_day_start
          and e.viewed_at < v_previous_day_end
          and e.user_id <> v_admin_id
          and coalesce(p.is_admin, false) = false
      );

    -- 탑승 완료는 해당 일자에 답변한 비관리자 응답 수이며, 답변 시각까지
    -- 메시지와 2명 이상 참여 조건을 만족한 보고일 생성 cohort만 센다.
    select count(*)
    into v_today_ride_successes
    from public.ride_completions rc
    where rc.room_id = any(v_today_room_ids)
      and rc.user_id <> v_admin_id
      and rc.boarded = true
      and rc.answered_at >= v_day_start
      and rc.answered_at < v_day_end
      and exists (
        select 1
        from public.messages m
        where m.room_id = rc.room_id
          and m.user_id <> v_admin_id
          and m.created_at <= rc.answered_at
      )
      and private.room_had_two_participants(rc.room_id, rc.answered_at);

    select count(*)
    into v_previous_ride_successes
    from public.ride_completions rc
    where rc.room_id = any(v_previous_room_ids)
      and rc.user_id <> v_admin_id
      and rc.boarded = true
      and rc.answered_at >= v_previous_day_start
      and rc.answered_at < v_previous_day_end
      and exists (
        select 1
        from public.messages m
        where m.room_id = rc.room_id
          and m.user_id <> v_admin_id
          and m.created_at <= rc.answered_at
      )
      and private.room_had_two_participants(rc.room_id, rc.answered_at);
  end if;

  for v_top in
    select c.user_id,
      coalesce(nullif(u.nickname, ''), '닉네임 미설정') as display_name,
      c.visit_count,
      c.last_visit_at
    from (
      select e.user_id,
        count(*)::bigint as visit_count,
        max(e.occurred_at) as last_visit_at
      from public.room_participant_events e
      left join public.user_private_profiles p on p.user_id = e.user_id
      where e.event_type = 'joined'
        and e.occurred_at >= v_top_window_start
        and e.occurred_at < v_day_end
        and e.user_id <> v_admin_id
        and coalesce(p.is_admin, false) = false
      group by e.user_id
      order by visit_count desc, last_visit_at desc, e.user_id
      limit 3
    ) c
    left join public.users u on u.id = c.user_id
    order by c.visit_count desc, c.last_visit_at desc, c.user_id
  loop
    v_top_rank := v_top_rank + 1;
    v_top3 := v_top3
      || case when v_top3 = '' then '' else E'\n' end
      || format(
        '%s. %s · %s회 (최근 방문 %s)',
        v_top_rank,
        replace(replace(v_top.display_name, E'\n', ' '), E'\r', ' '),
        v_top.visit_count,
        to_char(timezone('Asia/Seoul', v_top.last_visit_at), 'YYYY-MM-DD')
      );
  end loop;

  if v_top3 = '' then
    v_top3 := '없음';
  end if;

  v_onboarding_rate := case
    when v_total_users = 0 then 0
    else v_onboarded_users * 100.0 / v_total_users
  end;
  v_previous_onboarding_rate := case
    when v_previous_total_users = 0 then 0
    else v_previous_onboarded_users * 100.0 / v_previous_total_users
  end;
  v_pwa_rate := case
    when v_total_users = 0 then 0
    else v_pwa_users * 100.0 / v_total_users
  end;
  v_previous_pwa_rate := case
    when v_previous_total_users = 0 then 0
    else v_previous_pwa_users * 100.0 / v_previous_total_users
  end;

  v_title := format(
    '📊 GATITA Daily Metrics · %s (KST)',
    to_char(v_report_date, 'YYYY-MM-DD')
  );

  v_fields := jsonb_build_array(
    jsonb_build_object(
      'name', '👥 유저 수',
      'value', format(
        E'**%s명**\n전일 대비 %s명',
        v_total_users,
        private.format_integer_delta(v_total_users - v_previous_total_users)
      ),
      'inline', true
    ),
    jsonb_build_object(
      'name', '👀 금일 방문 유저',
      'value', format(
        E'**%s명**\n전일 대비 %s명',
        v_today_visitors,
        private.format_integer_delta(v_today_visitors - v_previous_visitors)
      ),
      'inline', true
    ),
    jsonb_build_object(
      'name', '🏠 금일 생성된 방',
      'value', format(
        E'**%s개**\n전일 대비 %s개',
        v_today_rooms,
        private.format_integer_delta(v_today_rooms - v_previous_rooms)
      ),
      'inline', true
    ),
    jsonb_build_object(
      'name', '📈 MAU',
      'value', format(
        E'**%s명**\n전일 대비 %s명',
        v_mau,
        private.format_integer_delta(v_mau - v_previous_mau)
      ),
      'inline', true
    ),
    jsonb_build_object(
      'name', '📝 온보딩율',
      'value', format(
        E'**%s**\n전일 대비 %s',
        private.format_rate(v_onboarding_rate),
        private.format_rate_delta(v_onboarding_rate - v_previous_onboarding_rate)
      ),
      'inline', true
    ),
    jsonb_build_object(
      'name', '📱 PWA 설치율',
      'value', format(
        E'**%s**\n전일 대비 %s',
        private.format_rate(v_pwa_rate),
        private.format_rate_delta(v_pwa_rate - v_previous_pwa_rate)
      ),
      'inline', true
    ),
    jsonb_build_object(
      'name', '🔥 자주 방문한 유저 TOP3',
      'value', v_top3,
      'inline', false
    )
  );

  -- 사용자가 요청한 조건대로, 전일 생성 방이 0이면 세부 방 지표는
  -- 메시지에 넣지 않는다. 전일 값은 변화량 계산에만 사용한다.
  if v_today_rooms > 0 then
    v_fields := v_fields || jsonb_build_array(
      jsonb_build_object(
      'name', '🙋 금일 방장 수',
      'value', format(
          E'**%s명**\n전일 대비 %s명',
          v_today_room_creators,
          private.format_integer_delta(v_today_room_creators - v_previous_room_creators)
        ),
        'inline', true
      ),
      jsonb_build_object(
        'name', '💬 금일 활성 방',
        'value', format(
          E'**%s개**\n전일 대비 %s개',
          v_today_active_rooms,
          private.format_integer_delta(v_today_active_rooms - v_previous_active_rooms)
        ),
        'inline', true
      ),
      jsonb_build_object(
        'name', '🤝 금일 합승',
        'value', format(
          E'**%s건**\n전일 대비 %s건',
          v_today_ride_successes,
          private.format_integer_delta(v_today_ride_successes - v_previous_ride_successes)
        ),
        'inline', true
      )
    );
  end if;

  select decrypted_secret
  into v_token
  from vault.decrypted_secrets
  where name = 'discord_bot_token';

  if v_token is null then
    raise warning 'daily metrics Discord notify skipped: discord_bot_token is missing';
    return;
  end if;

  -- 같은 날짜에 수동 재실행되더라도 Discord 중복 메시지를 만들지 않는다.
  perform pg_advisory_xact_lock(hashtext('gatita.daily_metrics_discord'));

  if exists (
    select 1 from private.daily_metrics_delivery_log where report_date = v_report_date
  ) then
    return;
  end if;

  v_request_id := net.http_post(
    url := 'https://discord.com/api/v10/channels/1511605519322972320/messages',
    headers := jsonb_build_object(
      'Authorization', 'Bot ' || v_token,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'embeds', jsonb_build_array(
        jsonb_build_object(
          'title', v_title,
          'fields', v_fields
        )
      )
    )
  );

  insert into private.daily_metrics_delivery_log (report_date, queued_at, request_id)
  values (v_report_date, timezone('utc'::text, now()), v_request_id)
  on conflict (report_date) do nothing;
end;
$$;

revoke all on function private.send_daily_metrics() from public, anon, authenticated;

-- Supabase Cron은 UTC 기준으로 실행된다. 15:03 UTC = 다음날 00:03 KST.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'gatita-daily-metrics-discord') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'gatita-daily-metrics-discord';
  end if;

  perform cron.schedule(
    'gatita-daily-metrics-discord',
    '3 15 * * *',
    $job$select private.send_daily_metrics();$job$
  );
end;
$$;
