-- All chat-room writes now run through authenticated server routes or the atomic
-- creation RPC. Removing browser UPDATE/DELETE privileges also prevents a room
-- creator from rewriting creation_source after insertion.
revoke insert, update, delete on table public.chat_rooms from authenticated;
grant select on table public.chat_rooms to authenticated;
grant all on table public.chat_rooms to service_role;
