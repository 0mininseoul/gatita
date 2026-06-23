-- 디스코드 가입 알림에서 개인정보 노출 최소화.
--   1) 이름: 가운데 글자(들)를 '*' 로 마스킹. (ex. 이지빈 -> 이*빈, 남궁민수 -> 남**수)
--   2) 이메일: embed 에서 완전히 제외(전송하지 않음).
--
-- 20260623120000_discord_signup_notification.sql 의 handle_new_user() 를 대체한다.
-- 나머지 동작(가천 계정 처리, 프로필 insert, 비동기 알림, 실패 무시)은 동일.

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
  masked_name text;
  v_token text;
begin
  -- 가천 계정만 처리
  if new.email is null or lower(new.email) not like '%@gachon.ac.kr' then
    return new;
  end if;

  display_name := coalesce(
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'display_name'
  );

  -- 앱 extractGachonProfileFromMetadata 로직 재현: "이름/학과" 형태
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

  -- 이름 가운데 글자 마스킹 (디스코드 알림 표시용)
  if parsed_name is null then
    masked_name := '(미입력)';
  elsif char_length(parsed_name) <= 1 then
    masked_name := parsed_name;
  elsif char_length(parsed_name) = 2 then
    -- 2글자: 둘째 글자만 마스킹 (예: 홍길 -> 홍*)
    masked_name := left(parsed_name, 1) || '*';
  else
    -- 3글자 이상: 첫/끝 글자만 남기고 가운데를 모두 마스킹 (예: 이지빈 -> 이*빈)
    masked_name := left(parsed_name, 1)
      || repeat('*', char_length(parsed_name) - 2)
      || right(parsed_name, 1);
  end if;

  -- 신규 가입 디스코드 알림 (실패해도 가입은 절대 막지 않는다)
  begin
    select decrypted_secret into v_token
    from vault.decrypted_secrets
    where name = 'discord_bot_token';

    if v_token is not null then
      perform net.http_post(
        url := 'https://discord.com/api/v10/channels/1518812043657084999/messages',
        headers := jsonb_build_object(
          'Authorization', 'Bot ' || v_token,
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
          'embeds', jsonb_build_array(
            jsonb_build_object(
              'title', '🎉 신규 가입자가 생겼어요!',
              'color', 5763719,
              'fields', jsonb_build_array(
                jsonb_build_object('name', '👤 이름', 'value', masked_name, 'inline', true),
                jsonb_build_object('name', '🎓 학과', 'value', coalesce(parsed_department, '(미확인)'), 'inline', true),
                jsonb_build_object('name', '📅 가입일시',
                  'value', to_char(coalesce(new.created_at, now()) at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') || ' (KST)',
                  'inline', false)
              ),
              'footer', jsonb_build_object('text', 'gatita')
            )
          )
        )
      );
    end if;
  exception when others then
    raise warning 'discord signup notify failed: %', sqlerrm;
  end;

  return new;
end;
$$;
