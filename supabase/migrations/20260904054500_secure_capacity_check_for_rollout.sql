-- Legacy clients insert the creator participant as the authenticated role.
-- The capacity trigger locks chat_rooms with SELECT ... FOR UPDATE; run that
-- narrow check as the function owner instead of restoring broad room UPDATE.
create or replace function public.enforce_room_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
  max_count integer;
  room_status text;
begin
  select chat_rooms.max_participants, chat_rooms.status
    into max_count, room_status
    from public.chat_rooms
    where chat_rooms.id = new.room_id
    for update;

  if max_count is null then
    raise exception 'chat room not found';
  end if;

  if room_status <> 'active' then
    raise exception 'chat room is not active';
  end if;

  select count(*)
    into current_count
    from public.room_participants
    where room_participants.room_id = new.room_id;

  if current_count >= max_count then
    raise exception 'chat room is full';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_room_capacity() from public, anon, authenticated;
