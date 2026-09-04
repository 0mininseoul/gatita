-- PostgreSQL runs same-event triggers alphabetically. The legacy duplicate
-- no-op must run before the capacity trigger so a room that became full between
-- the old client's two requests cannot turn the harmless duplicate into an
-- error and make that client delete the room.
drop trigger if exists ignore_existing_creator_participant_before_insert
  on public.room_participants;
drop trigger if exists a_ignore_existing_creator_participant_before_insert
  on public.room_participants;

create trigger a_ignore_existing_creator_participant_before_insert
  before insert on public.room_participants
  for each row execute function public.ignore_existing_creator_participant();
