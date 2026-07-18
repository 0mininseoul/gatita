-- 새 채팅 메시지 insert 시, 참여자에게 Web Push 를 보내도록 /api/push/dispatch 를 호출한다.
--
-- 전제:
--   1) pg_net 확장 활성화 (아래 create extension 으로 보장).
--   2) Vault 에 'push_dispatch_secret' 시크릿이 등록되어 있어야 한다.
--      (앱의 PUSH_DISPATCH_SECRET 환경변수와 동일값. 시크릿이라 이 파일에는 넣지 않는다.)
--      예: select vault.create_secret('<SECRET>', 'push_dispatch_secret', '...');
--   3) 대상 URL(https://gatita.kro.kr/api/push/dispatch)은 비밀값이 아니라 하드코딩.
--
-- 동작:
--   - after insert on messages 트리거에서 net.http_post 로 비동기 POST.
--   - pg_net 은 비동기라 메시지 insert 트랜잭션을 블로킹하지 않는다.
--   - 발송 실패는 EXCEPTION 으로 삼켜서 채팅 전송 자체는 절대 막지 않는다.
--   - 발신자 제외/구독 조회/실제 발송은 dispatch 라우트에서 처리한다.

create extension if not exists pg_net;

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
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-push-secret', v_secret
        ),
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
