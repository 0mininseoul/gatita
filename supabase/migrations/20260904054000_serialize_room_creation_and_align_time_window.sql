-- Keep the server boundary aligned with the client minute picker and serialize
-- standard room creation with dormitory empty-supply checks at each origin.
create or replace function public.create_room_with_participant(
  p_from_location public.location_type,
  p_to_location public.location_type,
  p_departure_date date,
  p_departure_time time,
  p_creation_source text default 'standard'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  private_profile public.user_private_profiles%rowtype;
  created_room public.chat_rooms%rowtype;
  departure_timestamp timestamp without time zone := p_departure_date + p_departure_time;
  v_now_kst timestamp without time zone := clock_timestamp() at time zone 'Asia/Seoul';
  v_earliest_departure timestamp without time zone;
  departure_cutoff timestamp without time zone;
  previous_request_at timestamp with time zone;
  has_joinable_supply boolean;
  from_label text;
  to_label text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select user_private_profiles.*
    into private_profile
    from public.user_private_profiles
    where user_private_profiles.user_id = v_user_id;

  if not found or private_profile.onboarded_at is null then
    raise exception using errcode = '42501', message = 'profile_required';
  end if;

  if private_profile.status <> 'active' then
    raise exception using errcode = '42501', message = 'account_suspended';
  end if;

  if p_creation_source is null or p_creation_source not in ('standard', 'dormitory_request') then
    raise exception using errcode = '22023', message = 'invalid_creation_source';
  end if;

  if p_from_location is null
    or p_to_location is null
    or p_departure_date is null
    or p_departure_time is null then
    raise exception using errcode = '22023', message = 'invalid_room_payload';
  end if;

  if p_from_location = p_to_location
    or (p_from_location = '가천대역_1번출구' and p_to_location = '가천대학교_정문')
    or (p_from_location = '가천대학교_정문' and p_to_location = '가천대역_1번출구')
    or (p_from_location = '제2기숙사' and p_to_location = 'AI공학관')
    or (p_from_location = 'AI공학관' and p_to_location = '제2기숙사')
    or (p_from_location = '교육대학원' and p_to_location = '중앙도서관')
    or (p_from_location = '중앙도서관' and p_to_location = '교육대학원')
    or (p_from_location = '중앙도서관' and p_to_location = '학생회관')
    or (p_from_location = '학생회관' and p_to_location = '중앙도서관') then
    raise exception using errcode = '22023', message = 'invalid_route';
  end if;

  -- Match getEarliestDepartureMinute(): the first whole minute at least one
  -- full minute ahead. Near 01:00 this rolls the window to the following 01:00.
  v_earliest_departure := date_trunc('minute', v_now_kst) + interval '1 minute';
  if v_earliest_departure - v_now_kst < interval '1 minute' then
    v_earliest_departure := v_earliest_departure + interval '1 minute';
  end if;

  departure_cutoff := date_trunc('day', v_earliest_departure) + interval '1 hour';
  if v_earliest_departure > departure_cutoff then
    departure_cutoff := departure_cutoff + interval '1 day';
  end if;

  if departure_timestamp < v_earliest_departure
    or departure_timestamp > departure_cutoff then
    raise exception using errcode = '22023', message = 'departure_time_out_of_window';
  end if;

  -- All RPC room creation uses the same origin lock. Therefore a standard room
  -- that started first becomes visible before a dormitory request checks supply.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('dormitory-request-origin:' || p_from_location::text, 0)
  );

  if p_creation_source = 'dormitory_request' then
    if not (
      (p_from_location in ('가천대역_1번출구', '가천대학교_정문') and p_to_location = '제2기숙사')
      or (
        p_from_location = '제2기숙사'
        and p_to_location in ('가천대역_1번출구', '가천대학교_정문', '교육대학원', '중앙도서관', '학생회관')
      )
    ) then
      raise exception using errcode = '22023', message = 'invalid_dormitory_request_route';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('dormitory-request-user:' || v_user_id::text, 0)
    );

    select dormitory_request_rate_limits.last_created_at
      into previous_request_at
      from public.dormitory_request_rate_limits
      where dormitory_request_rate_limits.user_id = v_user_id
      for update;

    if previous_request_at > clock_timestamp() - interval '5 minutes' then
      raise exception using errcode = 'P0001', message = 'dormitory_request_rate_limited';
    end if;

    select exists (
      select 1
      from public.chat_rooms
      where chat_rooms.status = 'active'
        and (chat_rooms.departure_date + chat_rooms.departure_time) >= v_now_kst
        and (
          (
            p_from_location in ('가천대역_1번출구', '가천대학교_정문')
            and chat_rooms.from_location = p_from_location
            and chat_rooms.to_location = '제2기숙사'
          )
          or (
            p_from_location = '제2기숙사'
            and chat_rooms.from_location = '제2기숙사'
          )
        )
        and (
          select count(room_participants.id)
          from public.room_participants
          where room_participants.room_id = chat_rooms.id
        ) < chat_rooms.max_participants
    ) into has_joinable_supply;

    if has_joinable_supply then
      raise exception using errcode = 'P0001', message = 'dormitory_request_supply_available';
    end if;
  end if;

  from_label := case p_from_location
    when '가천대역_1번출구' then '가천대역 1번출구'
    when '가천대학교_정문' then '가천대학교 정문'
    when '교육대학원' then '교육대학원'
    when '중앙도서관' then '중앙도서관'
    when '학생회관' then '학생회관'
    when 'AI공학관' then 'AI공학관'
    when '제2기숙사' then '제2기숙사'
    when '제3기숙사' then '제3기숙사'
  end;
  to_label := case p_to_location
    when '가천대역_1번출구' then '가천대역 1번출구'
    when '가천대학교_정문' then '가천대학교 정문'
    when '교육대학원' then '교육대학원'
    when '중앙도서관' then '중앙도서관'
    when '학생회관' then '학생회관'
    when 'AI공학관' then 'AI공학관'
    when '제2기숙사' then '제2기숙사'
    when '제3기숙사' then '제3기숙사'
  end;

  insert into public.chat_rooms (
    title,
    from_location,
    to_location,
    departure_date,
    departure_time,
    max_participants,
    created_by,
    creation_source
  ) values (
    pg_catalog.to_char(p_departure_time, 'HH24:MI') || ' ' || from_label || '→' || to_label,
    p_from_location,
    p_to_location,
    p_departure_date,
    p_departure_time,
    4,
    v_user_id,
    p_creation_source
  ) returning * into created_room;

  insert into public.room_participants (room_id, user_id, confirmed)
  values (created_room.id, v_user_id, true);

  if p_creation_source = 'dormitory_request' then
    insert into public.dormitory_request_rate_limits (user_id, last_created_at)
    values (v_user_id, clock_timestamp())
    on conflict (user_id) do update
      set last_created_at = excluded.last_created_at;
  end if;

  return pg_catalog.to_jsonb(created_room);
end;
$$;

revoke all on function public.create_room_with_participant(
  public.location_type,
  public.location_type,
  date,
  time,
  text
) from public, anon;
grant execute on function public.create_room_with_participant(
  public.location_type,
  public.location_type,
  date,
  time,
  text
) to authenticated;
