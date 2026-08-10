-- 매칭 이력 보존용 append-only 이벤트 로그.
--
-- 프로덕션에는 이 테이블이 이 마이그레이션 없이 별도 경로로 이미 적용되어 있고
-- 52건이 백필된 상태다(2026-08, route-subscription-alerts 브랜치 작업 중 컨트롤러가
-- 직접 적용). 이 파일은 신규 환경에서도 동일 스키마를 재현할 수 있도록 뒤늦게
-- 저장소에 반영한 것이며, 프로덕션에는 다시 적용하지 않는다(이미 존재하므로
-- if not exists 로 안전하게 스킵된다).
--
-- room_participants 는 나가기 시 행이 삭제되므로(app/api/rooms/[id]/leave/route.ts)
-- "누가 언제 참여했다 나갔는가"가 남지 않는다. 정원 체크와 메시지 RLS 가 모두
-- room_participants 를 참조하므로 그 테이블의 의미는 바꾸지 않고 이벤트 로그로
-- 별도 기록한다.
--
-- 멤버십 상태 1행이 아니라 이벤트 로그다: 참여할 때마다 'joined' 행을, 나갈 때마다
-- 'left' 행을 추가만 한다(기존 행을 갱신하지 않음). 재입장/재이탈도 전부 기록에 남는다.
create table if not exists public.room_participant_events (
  id          uuid primary key default extensions.uuid_generate_v4(),
  room_id     uuid not null references public.chat_rooms(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  event_type  varchar(10) not null
              check (event_type in ('joined', 'left')),
  occurred_at timestamptz not null default timezone('utc', now()),
  unique (room_id, user_id, event_type, occurred_at)
);

create index if not exists room_participant_events_room_id_occurred_at_idx
  on public.room_participant_events using btree (room_id, occurred_at);

alter table public.room_participant_events enable row level security;

-- RLS 정책 없음 → service_role 전용 접근.
grant all on table public.room_participant_events to service_role;
