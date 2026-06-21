-- The map subscribes to live room changes (new rooms, status/participant updates)
-- instead of polling every 30s. Supabase Realtime only emits Postgres changes for
-- tables in the supabase_realtime publication, and chat_rooms was never added.
alter table public.chat_rooms replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_rooms'
  ) then
    alter publication supabase_realtime add table public.chat_rooms;
  end if;
end $$;
