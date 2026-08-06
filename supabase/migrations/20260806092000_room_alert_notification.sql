-- 새 방이 생기면 그 경로를 구독한 이용자에게 푸시를 보낸다.
-- notify_new_message 와 동일한 구조(vault 시크릿 + pg_net). 발송 실패가 방 생성을
-- 막지 않도록 예외를 삼킨다.
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
