grant usage on schema public to authenticated;
grant usage on type public.location_type to authenticated;

grant select, insert, update on table public.users to authenticated;
grant select, insert, update, delete on table public.chat_rooms to authenticated;
grant select, insert, update, delete on table public.room_participants to authenticated;
grant select, insert on table public.messages to authenticated;
grant select, insert, update on table public.reports to authenticated;
grant select, insert, delete on table public.favorites to authenticated;

create index if not exists chat_rooms_route_date_status_time_idx
  on public.chat_rooms (from_location, to_location, departure_date, status, departure_time);

create index if not exists chat_rooms_created_by_idx
  on public.chat_rooms (created_by);

create index if not exists room_participants_room_id_idx
  on public.room_participants (room_id);

create index if not exists room_participants_user_id_idx
  on public.room_participants (user_id);

create index if not exists messages_room_id_created_at_idx
  on public.messages (room_id, created_at);

create index if not exists reports_reporter_id_idx
  on public.reports (reporter_id);

create index if not exists reports_reported_id_idx
  on public.reports (reported_id);

create index if not exists reports_status_idx
  on public.reports (status);

create index if not exists favorites_user_id_idx
  on public.favorites (user_id);

create or replace function public.enforce_room_capacity()
returns trigger as $$
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
$$ language plpgsql;

drop trigger if exists enforce_room_capacity_before_insert on public.room_participants;
create trigger enforce_room_capacity_before_insert
  before insert on public.room_participants
  for each row execute procedure public.enforce_room_capacity();

drop policy if exists "Room creators can delete their rooms" on public.chat_rooms;
create policy "Room creators can delete their rooms"
  on public.chat_rooms for delete
  using (auth.uid() = created_by);

drop policy if exists "Admins can update reports" on public.reports;
create policy "Admins can update reports"
  on public.reports for update
  using (
    exists (
      select 1 from public.users
      where users.id = auth.uid() and users.is_admin = true
    )
  );
