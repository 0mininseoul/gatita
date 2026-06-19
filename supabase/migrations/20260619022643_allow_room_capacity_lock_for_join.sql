-- The room capacity trigger locks chat_rooms with FOR UPDATE before inserting a participant.
-- Non-creators must be able to lock active room rows, but must not be able to mutate them.
drop policy if exists "Authenticated users can lock active rooms for capacity checks" on public.chat_rooms;

create policy "Authenticated users can lock active rooms for capacity checks"
  on public.chat_rooms
  for update
  to authenticated
  using (status = 'active')
  with check (false);
