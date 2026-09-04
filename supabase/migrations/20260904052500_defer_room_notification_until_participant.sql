-- Queue a new-room push only after the creator participant has been inserted.
-- The room and participant are created by create_room_with_participant() in one
-- transaction; deferring this constraint trigger prevents notification fanout
-- from observing a half-created room.
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
