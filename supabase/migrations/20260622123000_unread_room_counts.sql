-- Per-room unread counts for the "my rooms" sheet.
create or replace function public.get_my_unread_room_counts()
returns table(room_id uuid, unread_count integer)
language sql
security definer
set search_path = public
as $$
  select
    m.room_id,
    count(*)::int as unread_count
  from public.messages m
  join public.room_participants rp on rp.room_id = m.room_id
  join public.chat_rooms r on r.id = m.room_id
  where rp.user_id = auth.uid()
    and r.status = 'active'
    and m.user_id <> auth.uid()
    and m.created_at > coalesce(rp.last_read_at, rp.joined_at)
  group by m.room_id;
$$;

revoke all on function public.get_my_unread_room_counts() from public, anon;
grant execute on function public.get_my_unread_room_counts() to authenticated;
