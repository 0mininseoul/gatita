-- Apply only after legacy direct room creation is no longer observed. Until
-- then the standard-only compatibility path remains atomic and cannot set the
-- dormitory_request source. This migration removes that final bridge.
drop policy if exists "Temporary legacy standard room creation" on public.chat_rooms;
revoke insert, update, delete on table public.chat_rooms from authenticated;
grant select on table public.chat_rooms to authenticated;

drop policy if exists "Temporary legacy creator participant insert" on public.room_participants;
revoke insert on table public.room_participants from authenticated;
grant select on table public.room_participants to authenticated;

create or replace function public.notify_new_room()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  if not exists (
    select 1
    from public.room_participants
    where room_participants.room_id = new.id
      and room_participants.user_id = new.created_by
  ) then
    return new;
  end if;

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
create constraint trigger notify_new_room_trigger
  after insert on public.chat_rooms
  deferrable initially deferred
  for each row execute function public.notify_new_room();
