-- 방 삭제가 불가능하던 버그 수정 + 저장소에 없던 트리거를 뒤늦게 반영.
--
-- 배경: room_participants 의 참여/이탈을 room_participant_events 에 기록하는 트리거가
-- 프로덕션에는 있으나 이 저장소에는 없었다(2026-08-07 에 다른 경로로 적용됨). 신규
-- 환경에서도 같은 스키마가 재현되도록 함수와 트리거를 여기에 함께 둔다.
--
-- 버그: log_room_participant_leave 는 DELETE 시 'left' 를 insert 하는데, chat_rooms 행을
-- 지우면 cascade 로 room_participants 가 지워지면서 이 트리거가 발화한다. 그 시점엔 부모
-- chat_rooms 행이 이미 사라진 뒤라 FK 위반이 난다:
--
--   ERROR: 23503 insert or update on table "room_participant_events" violates
--          foreign key constraint "room_participant_events_room_id_fkey"
--   DETAIL: Key (room_id)=(...) is not present in table "chat_rooms".
--
-- 결과적으로 참여자가 있는 방은 아무도 삭제할 수 없었다. RLS 정책
-- "Room creators can delete their rooms" 가 있는데도 실제로는 동작하지 않았다.
--
-- 고치는 방법: DELETE 분기에서 부모 방이 아직 살아 있을 때만 이벤트를 남긴다. 방이
-- 사라지는 중이라면 남길 의미도 없다 — chat_rooms 삭제 cascade 가 그 방의
-- room_participant_events 를 어차피 함께 지운다.

create or replace function public.log_room_participant_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.room_participant_events (room_id, user_id, event_type, occurred_at)
    values (new.room_id, new.user_id, 'joined', coalesce(new.joined_at, timezone('utc'::text, now())))
    on conflict do nothing;
    return new;
  end if;

  -- 방이 삭제되는 중(cascade)이면 이벤트를 남기지 않는다. 남기려 하면 FK 위반으로
  -- 방 삭제 자체가 실패한다.
  if not exists (select 1 from public.chat_rooms where id = old.room_id) then
    return old;
  end if;

  insert into public.room_participant_events (room_id, user_id, event_type, occurred_at)
  values (old.room_id, old.user_id, 'left', timezone('utc'::text, now()))
  on conflict do nothing;
  return old;
end;
$$;

-- 프로덕션에는 이미 같은 이름의 트리거가 있다. drop if exists 로 재실행 안전하게 둔다.
drop trigger if exists log_room_participant_join on public.room_participants;
create trigger log_room_participant_join
  after insert on public.room_participants
  for each row execute function public.log_room_participant_event();

drop trigger if exists log_room_participant_leave on public.room_participants;
create trigger log_room_participant_leave
  after delete on public.room_participants
  for each row execute function public.log_room_participant_event();
