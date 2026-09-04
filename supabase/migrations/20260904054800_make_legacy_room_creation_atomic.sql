-- Keep old two-request clients working without weakening the new invariant.
-- The room insert creates its owner participant in the same transaction. The
-- old client's following duplicate participant insert is accepted as a no-op.
create or replace function public.ensure_room_creator_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.room_participants (room_id, user_id, confirmed)
  values (new.id, new.created_by, true)
  on conflict (room_id, user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.ensure_room_creator_participant() from public, anon, authenticated;

drop trigger if exists ensure_room_creator_participant_after_insert on public.chat_rooms;
create trigger ensure_room_creator_participant_after_insert
  after insert on public.chat_rooms
  for each row execute function public.ensure_room_creator_participant();

create or replace function public.ignore_existing_creator_participant()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.confirmed is true and exists (
    select 1
    from public.room_participants
    join public.chat_rooms on chat_rooms.id = room_participants.room_id
    where room_participants.room_id = new.room_id
      and room_participants.user_id = new.user_id
      and chat_rooms.created_by = new.user_id
  ) then
    return null;
  end if;

  return new;
end;
$$;

revoke all on function public.ignore_existing_creator_participant() from public, anon, authenticated;

drop trigger if exists ignore_existing_creator_participant_before_insert on public.room_participants;
create trigger ignore_existing_creator_participant_before_insert
  before insert on public.room_participants
  for each row execute function public.ignore_existing_creator_participant();

-- Both RPC and legacy creation now have the creator participant before commit,
-- so notification can use the participant-aware deferred trigger immediately.
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
