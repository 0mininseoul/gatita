-- Temporary rollout bridge for already-open clients that still create a room
-- and its creator participant in two requests. Only ordinary rooms are allowed;
-- dormitory-wide notification remains available exclusively through the RPC.
grant insert, delete on table public.chat_rooms to authenticated;

drop policy if exists "Temporary legacy standard room creation" on public.chat_rooms;
create policy "Temporary legacy standard room creation"
  on public.chat_rooms
  for insert
  to authenticated
  with check (
    (select auth.uid()) = created_by
    and creation_source = 'standard'
    and exists (
      select 1
      from public.user_private_profiles
      where user_private_profiles.user_id = (select auth.uid())
        and user_private_profiles.status = 'active'
        and user_private_profiles.onboarded_at is not null
    )
  );

grant insert on table public.room_participants to authenticated;

drop policy if exists "Temporary legacy creator participant insert" on public.room_participants;
create policy "Temporary legacy creator participant insert"
  on public.room_participants
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and confirmed = true
    and exists (
      select 1
      from public.chat_rooms
      where chat_rooms.id = room_participants.room_id
        and chat_rooms.created_by = (select auth.uid())
        and chat_rooms.creation_source = 'standard'
        and chat_rooms.status = 'active'
    )
  );

-- Legacy clients add the participant in a second transaction, so keep the old
-- immediate standard-room notification until the RPC client has deployed.
create or replace function public.notify_new_room()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  begin
    select decrypted_secret into v_secret
    from vault.decrypted_secrets
    where name = 'push_dispatch_secret';

    if v_secret is not null then
      perform net.http_post(
        url := 'https://gatita.kro.kr/api/push/dispatch',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
        body := jsonb_build_object('room_id', new.id)
      );
    end if;
  exception when others then
    raise warning 'room push dispatch notify failed: %', sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists notify_new_room_trigger on public.chat_rooms;
create trigger notify_new_room_trigger
  after insert on public.chat_rooms
  for each row execute function public.notify_new_room();
