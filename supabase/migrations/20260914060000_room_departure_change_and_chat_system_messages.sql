-- 방장의 출발 시각 변경 + 채팅방 시스템 메시지(입장/이탈/방장 위임/출발시각 변경).
--
-- messages.kind 를 두는 이유: 시스템 기록을 접두사 문자열로 구분하면 푸시 발송,
-- 안읽음 집계, 화면 렌더 세 곳에서 같은 파싱을 반복해야 한다. 컬럼 하나면
-- 트리거의 when 절과 SQL 함수의 where 절에서 바로 걸러낼 수 있다.
--
-- 입장/이탈은 앱이 아니라 트리거가 남긴다 — room_participant_events 와 같은 이유로,
-- 앱을 우회하는 경로도 빠짐없이 기록되고 같은 이벤트가 두 벌 쌓이지 않는다.

alter table public.messages
  add column if not exists kind text not null default 'user';

alter table public.messages
  drop constraint if exists messages_kind_valid;
alter table public.messages
  add constraint messages_kind_valid check (
    kind in (
      'user',
      'host_appearance',
      'participant_joined',
      'participant_left',
      'host_changed',
      'departure_changed'
    )
  );

-- 출발 시각 변경 쿨다운(30초) 판정 기준점.
alter table public.chat_rooms
  add column if not exists departure_changed_at timestamp with time zone;

-- 브라우저가 직접 넣을 수 있는 kind 를 두 가지로 묶는다. 이 제한이 없으면 클라이언트가
-- kind = 'departure_changed' 로 위조해 참여자 전원에게 푸시를 쏠 수 있다. 시스템 kind 는
-- security definer 함수(아래 트리거들)와 service_role 만 쓴다.
drop policy if exists "Active room participants can send messages" on public.messages;
create policy "Active room participants can send messages" on public.messages
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and kind in ('user', 'host_appearance')
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

-- 시스템 메시지 한 줄. 기록 실패가 원래 작업(입장/이탈/방 삭제)을 막으면 안 되므로
-- 방이나 작성자가 이미 사라졌으면 조용히 건너뛰고, 그 밖의 오류도 경고로만 남긴다.
create or replace function public.insert_room_system_message(
  p_room_id uuid,
  p_user_id uuid,
  p_kind text,
  p_content text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_room_id is null or p_user_id is null then
    return;
  end if;

  -- chat_rooms 를 지우면 cascade 로 room_participants 가 지워지며 이탈 트리거가
  -- 발화한다. 그때는 부모 행이 이미 없어 FK 위반으로 방 삭제 자체가 실패한다.
  if not exists (select 1 from public.chat_rooms where id = p_room_id) then
    return;
  end if;

  if not exists (select 1 from public.users where id = p_user_id) then
    return;
  end if;

  insert into public.messages (room_id, user_id, content, kind)
  values (p_room_id, p_user_id, p_content, p_kind);
exception when others then
  raise warning 'room system message insert failed: %', sqlerrm;
end;
$$;

revoke all on function public.insert_room_system_message(uuid, uuid, text, text)
  from public, anon, authenticated;

create or replace function public.room_member_display_name(p_user_id uuid)
returns text
language sql
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(users.nickname), ''), '익명')
  from public.users
  where users.id = p_user_id;
$$;

revoke all on function public.room_member_display_name(uuid) from public, anon, authenticated;

-- 입장/이탈을 대화에 남긴다. 방장의 자동 참여는 방이 열리는 순간이라 남기지 않는다 —
-- 모든 방이 "○○님이 들어왔어요"로 시작하면 기록으로서 의미가 없다.
create or replace function public.log_room_membership_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created_by uuid;
begin
  if tg_op = 'INSERT' then
    select chat_rooms.created_by into v_created_by
      from public.chat_rooms
      where chat_rooms.id = new.room_id;

    if v_created_by is null or v_created_by = new.user_id then
      return new;
    end if;

    perform public.insert_room_system_message(
      new.room_id,
      new.user_id,
      'participant_joined',
      public.room_member_display_name(new.user_id) || '님이 들어왔어요'
    );
    return new;
  end if;

  perform public.insert_room_system_message(
    old.room_id,
    old.user_id,
    'participant_left',
    public.room_member_display_name(old.user_id) || '님이 나갔어요'
  );
  return old;
end;
$$;

drop trigger if exists log_room_membership_message_join on public.room_participants;
create trigger log_room_membership_message_join
  after insert on public.room_participants
  for each row execute function public.log_room_membership_message();

drop trigger if exists log_room_membership_message_leave on public.room_participants;
create trigger log_room_membership_message_leave
  after delete on public.room_participants
  for each row execute function public.log_room_membership_message();

create or replace function public.log_room_host_change_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.insert_room_system_message(
    new.id,
    new.created_by,
    'host_changed',
    '방장이 ' || public.room_member_display_name(new.created_by) || '님으로 바뀌었어요'
  );
  return new;
end;
$$;

drop trigger if exists log_room_host_change_message_trigger on public.chat_rooms;
create trigger log_room_host_change_message_trigger
  after update of created_by on public.chat_rooms
  for each row
  when (old.created_by is distinct from new.created_by)
  execute function public.log_room_host_change_message();

-- "19:45로"/"19:30으로" 처럼 뒤 조사가 숫자 읽기에 따라 달라지는 문제를 피하려고
-- 변경 전후를 화살표로만 붙인다.
create or replace function public.log_room_departure_change_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.insert_room_system_message(
    new.id,
    new.created_by,
    'departure_changed',
    '방장이 출발 시간을 바꿨어요 · '
      || pg_catalog.to_char(old.departure_time, 'HH24:MI')
      || ' → '
      || pg_catalog.to_char(new.departure_time, 'HH24:MI')
  );
  return new;
end;
$$;

drop trigger if exists log_room_departure_change_message_trigger on public.chat_rooms;
create trigger log_room_departure_change_message_trigger
  after update of departure_date, departure_time on public.chat_rooms
  for each row
  when (
    old.departure_time is distinct from new.departure_time
    or old.departure_date is distinct from new.departure_date
  )
  execute function public.log_room_departure_change_message();

-- 푸시는 messages insert 트리거가 보낸다. 입퇴장·방장 위임·인상착의까지 푸시가 나가면
-- 방이 시끄러워지므로, 사람이 보낸 메시지와 출발 시각 변경만 통과시킨다.
drop trigger if exists on_message_created_push on public.messages;
create trigger on_message_created_push
  after insert on public.messages
  for each row
  when (new.kind in ('user', 'departure_changed'))
  execute function public.notify_new_message();

-- 안읽음 집계도 푸시와 같은 기준을 쓴다. 그러지 않으면 입퇴장 기록만으로 지도 뱃지가
-- 올라간다. (인상착의 메시지가 뱃지를 올리던 기존 문제도 여기서 함께 정리된다.)
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
    and m.kind in ('user', 'departure_changed')
    and m.created_at > coalesce(rp.last_read_at, rp.joined_at);
$$;

revoke all on function public.get_my_unread_count() from public, anon;
grant execute on function public.get_my_unread_count() to authenticated;

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
    and m.kind in ('user', 'departure_changed')
    and m.created_at > coalesce(rp.last_read_at, rp.joined_at)
  group by m.room_id;
$$;

revoke all on function public.get_my_unread_room_counts() from public, anon;
grant execute on function public.get_my_unread_room_counts() to authenticated;

-- 출발 시각 변경. 창(now+1분 ~ 다가오는 01:00) 판정을 KST 로 해야 하는데 서버 런타임은
-- UTC 라, create_room_with_participant 와 같은 이유로 판정을 SQL 안에 둔다.
create or replace function public.change_room_departure_time(
  p_room_id uuid,
  p_departure_time time
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  target_room public.chat_rooms%rowtype;
  updated_room public.chat_rooms%rowtype;
  v_now_kst timestamp without time zone := clock_timestamp() at time zone 'Asia/Seoul';
  v_earliest_departure timestamp without time zone;
  departure_cutoff timestamp without time zone;
  departure_timestamp timestamp without time zone;
  v_departure_date date;
  v_shift_minutes integer;
  v_reset_confirmations boolean;
  from_label text;
  to_label text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if p_room_id is null or p_departure_time is null then
    raise exception using errcode = '22023', message = 'invalid_room_payload';
  end if;

  select chat_rooms.* into target_room
    from public.chat_rooms
    where chat_rooms.id = p_room_id
    for update;

  if not found or target_room.status <> 'active' then
    raise exception using errcode = 'P0002', message = 'room_not_found';
  end if;

  if target_room.created_by <> v_user_id then
    raise exception using errcode = '42501', message = 'host_only';
  end if;

  -- 이미 출발한 방을 미래로 되돌리면 지도 노출과 활성 방 유니크 인덱스가 꼬인다.
  if (target_room.departure_date + target_room.departure_time) < v_now_kst then
    raise exception using errcode = 'P0001', message = 'room_already_departed';
  end if;

  if target_room.departure_changed_at is not null
    and target_room.departure_changed_at > clock_timestamp() - interval '30 seconds' then
    raise exception using errcode = 'P0001', message = 'departure_change_rate_limited';
  end if;

  v_earliest_departure := pg_catalog.date_trunc('minute', v_now_kst) + interval '1 minute';
  if v_earliest_departure - v_now_kst < interval '1 minute' then
    v_earliest_departure := v_earliest_departure + interval '1 minute';
  end if;

  departure_cutoff := pg_catalog.date_trunc('day', v_earliest_departure) + interval '1 hour';
  if v_earliest_departure > departure_cutoff then
    departure_cutoff := departure_cutoff + interval '1 day';
  end if;

  -- 자정을 넘기는 시각(23:50 → 00:10)은 날짜도 함께 넘어간다. lib/supabase.ts 의
  -- getDepartureDateForTime 과 같은 규칙이다.
  v_departure_date := v_earliest_departure::date;
  departure_timestamp := v_departure_date + p_departure_time;
  if departure_timestamp < v_earliest_departure then
    v_departure_date := v_departure_date + 1;
    departure_timestamp := v_departure_date + p_departure_time;
  end if;

  if departure_timestamp < v_earliest_departure
    or departure_timestamp > departure_cutoff then
    raise exception using errcode = '22023', message = 'departure_time_out_of_window';
  end if;

  if v_departure_date = target_room.departure_date
    and p_departure_time = target_room.departure_time then
    return pg_catalog.jsonb_build_object(
      'room', pg_catalog.to_jsonb(target_room),
      'unchanged', true,
      'confirmations_reset', false,
      'shift_minutes', 0
    );
  end if;

  -- extract(field from ...) 는 스키마 한정이 안 되므로 search_path = '' 아래에서는
  -- 같은 일을 하는 일반 함수 date_part 를 쓴다.
  v_shift_minutes := (
    pg_catalog.date_part(
      'epoch',
      departure_timestamp - (target_room.departure_date + target_room.departure_time)
    ) / 60
  )::integer;

  -- 앞당기면 참여자가 못 맞출 수 있고, 크게 미루면 원래 계획이 깨진다. 두 경우에만
  -- 확정을 풀어 다시 받는다. 소폭 지연까지 풀면 5분 조정마다 방이 흔들린다.
  v_reset_confirmations := v_shift_minutes < 0 or v_shift_minutes > 10;

  from_label := case target_room.from_location
    when '가천대역_1번출구' then '가천대역 1번출구'
    when '가천대학교_정문' then '가천대학교 정문'
    when '교육대학원' then '교육대학원'
    when '중앙도서관' then '중앙도서관'
    when '학생회관' then '학생회관'
    when 'AI공학관' then 'AI공학관'
    when '제2기숙사' then '제2기숙사'
    when '제3기숙사' then '제3기숙사'
  end;
  to_label := case target_room.to_location
    when '가천대역_1번출구' then '가천대역 1번출구'
    when '가천대학교_정문' then '가천대학교 정문'
    when '교육대학원' then '교육대학원'
    when '중앙도서관' then '중앙도서관'
    when '학생회관' then '학생회관'
    when 'AI공학관' then 'AI공학관'
    when '제2기숙사' then '제2기숙사'
    when '제3기숙사' then '제3기숙사'
  end;

  -- title 에 시각이 박혀 있다(관리자 화면이 이 값을 읽는다). 같은 트랜잭션에서 갱신한다.
  update public.chat_rooms
    set departure_date = v_departure_date,
        departure_time = p_departure_time,
        title = pg_catalog.to_char(p_departure_time, 'HH24:MI') || ' ' || from_label || '→' || to_label,
        departure_changed_at = clock_timestamp()
    where chat_rooms.id = p_room_id
    returning * into updated_room;

  if v_reset_confirmations then
    -- 방장은 변경을 직접 한 당사자라 확정을 유지한다.
    update public.room_participants
      set confirmed = false
      where room_participants.room_id = p_room_id
        and room_participants.user_id <> v_user_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'room', pg_catalog.to_jsonb(updated_room),
    'unchanged', false,
    'confirmations_reset', v_reset_confirmations,
    'shift_minutes', v_shift_minutes
  );
end;
$$;

revoke all on function public.change_room_departure_time(uuid, time) from public, anon;
grant execute on function public.change_room_departure_time(uuid, time) to authenticated, service_role;
