-- Use authenticated page visits for the daily visitor metric.
-- Room participation remains available for room-specific metrics and TOP3.

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
  from public.user_visit_events e
  left join public.user_private_profiles p on p.user_id = e.user_id
  where e.visited_at >= v_day_start
    and e.visited_at < v_day_end
    and e.user_id <> v_admin_id
    and coalesce(p.is_admin, false) = false;

  select count(distinct e.user_id)
  into v_previous_visitors
  from public.user_visit_events e
  left join public.user_private_profiles p on p.user_id = e.user_id
  where e.visited_at >= v_previous_day_start
    and e.visited_at < v_previous_day_end
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

    -- 활성 방은 보고일 생성 방 중 비관리자 메시지가 실제로 오갔고,
    -- 보고일 종료 시점까지 비관리자 참여자가 2명 이상이었던 방이다.
    select count(distinct m.id)
    into v_today_active_rooms
    from public.chat_rooms m
    where m.id = any(v_today_room_ids)
      and exists (
        select 1
        from public.messages msg
        left join public.user_private_profiles mp on mp.user_id = msg.user_id
        where msg.room_id = m.id
          and msg.created_at >= v_day_start
          and msg.created_at < v_day_end
          and msg.user_id <> v_admin_id
          and coalesce(mp.is_admin, false) = false
      )
      and private.room_had_two_participants(m.id, v_day_end);

    select count(distinct m.id)
    into v_previous_active_rooms
    from public.chat_rooms m
    where m.id = any(v_previous_room_ids)
      and exists (
        select 1
        from public.messages msg
        left join public.user_private_profiles mp on mp.user_id = msg.user_id
        where msg.room_id = m.id
          and msg.created_at >= v_previous_day_start
          and msg.created_at < v_previous_day_end
          and msg.user_id <> v_admin_id
          and coalesce(mp.is_admin, false) = false
      )
      and private.room_had_two_participants(m.id, v_previous_day_end);

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

revoke all on function private.send_daily_metrics()
  from public, anon, authenticated;
