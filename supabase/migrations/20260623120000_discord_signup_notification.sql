-- 신규 가입(가천 계정 auth.users insert) 시 디스코드 봇으로 알림 임베드 전송.
--
-- 전제:
--   1) pg_net 확장이 활성화되어 있어야 한다 (아래 create extension 으로 보장).
--   2) Vault 에 'discord_bot_token' 시크릿이 등록되어 있어야 한다.
--      (봇 토큰은 보안상 이 마이그레이션/레포에 포함하지 않는다. Supabase Vault 에 별도 저장.)
--      예: select vault.create_secret('<BOT_TOKEN>', 'discord_bot_token', 'Discord bot token');
--   3) 대상 디스코드 채널/쓰레드 ID 는 아래 URL 에 하드코딩 (비밀값 아님).
--      현재: #04-gatita > "[GATITA] 가입 알림" 쓰레드 (1518812043657084999)
--
-- 동작:
--   - handle_new_user() 트리거(after insert on auth.users) 안에서 가천 계정에 한해
--     net.http_post 로 Discord REST API 에 비동기 POST.
--   - pg_net 은 비동기라 가입 트랜잭션을 블로킹하지 않으며, 가입이 롤백되면 요청도 롤백된다.
--   - 알림 전송 실패는 EXCEPTION 으로 삼켜서 회원가입 자체는 절대 막지 않는다.

create extension if not exists pg_net;

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
                jsonb_build_object('name', '👤 이름', 'value', coalesce(parsed_name, '(미입력)'), 'inline', true),
                jsonb_build_object('name', '🎓 학과', 'value', coalesce(parsed_department, '(미확인)'), 'inline', true),
                jsonb_build_object('name', '📧 이메일', 'value', new.email, 'inline', false),
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
