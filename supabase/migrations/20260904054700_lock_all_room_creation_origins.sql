-- Legacy direct inserts and RPC inserts must join the same serialization lane.
-- This closes the rollout-window race where an old bundle could create standard
-- supply while a dormitory request was checking the same origin.
create or replace function public.lock_room_creation_origin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('dormitory-request-origin:' || new.from_location::text, 0)
  );
  return new;
end;
$$;

revoke all on function public.lock_room_creation_origin() from public, anon, authenticated;

drop trigger if exists lock_room_creation_origin_before_insert on public.chat_rooms;
create trigger lock_room_creation_origin_before_insert
  before insert on public.chat_rooms
  for each row execute function public.lock_room_creation_origin();
