-- Track per-participant read position so the map can show an unread badge.
alter table public.room_participants
  add column if not exists last_read_at timestamp with time zone;

-- Total unread messages across the caller's active rooms (others' messages only,
-- newer than where they last read). SECURITY DEFINER + auth.uid() so a client
-- can only ever read its own count.
create or replace function public.get_my_unread_count()
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::int
  from public.messages m
  join public.room_participants rp on rp.room_id = m.room_id
  join public.chat_rooms r on r.id = m.room_id
  where rp.user_id = auth.uid()
    and r.status = 'active'
    and m.user_id <> auth.uid()
    and m.created_at > coalesce(rp.last_read_at, rp.joined_at);
$$;

revoke all on function public.get_my_unread_count() from public, anon;
grant execute on function public.get_my_unread_count() to authenticated;
