drop policy if exists "Room creators can update their rooms" on public.chat_rooms;
drop policy if exists "Room creators can transfer active rooms to participants" on public.chat_rooms;

create policy "Room creators can transfer active rooms to participants"
  on public.chat_rooms for update
  using ((select auth.uid()) = created_by)
  with check (
    (select auth.uid()) = created_by
    or exists (
      select 1
      from public.room_participants
      where room_participants.room_id = chat_rooms.id
        and room_participants.user_id = chat_rooms.created_by
    )
  );
