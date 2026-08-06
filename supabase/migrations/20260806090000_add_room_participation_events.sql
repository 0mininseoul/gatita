-- 매칭 이력 보존용 append-only 테이블.
-- room_participants 는 나가기 시 행이 삭제되므로(app/api/rooms/[id]/leave/route.ts)
-- "누가 언제 참여했다 나갔는가"가 남지 않는다. 정원 체크와 메시지 RLS 가 모두
-- room_participants 를 참조하므로 그 테이블의 의미는 바꾸지 않고 별도로 기록한다.
create table if not exists public.room_participation_events (
  id uuid default uuid_generate_v4() primary key,
  room_id uuid references public.chat_rooms(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  joined_at timestamp with time zone not null default timezone('utc'::text, now()),
  left_at timestamp with time zone,
  unique(room_id, user_id)
);

create index if not exists room_participation_events_room_idx
  on public.room_participation_events(room_id);
create index if not exists room_participation_events_user_idx
  on public.room_participation_events(user_id);

alter table public.room_participation_events enable row level security;

-- 관리자만 조회. 쓰기는 service_role 전용(정책 없음 = 일반 클라이언트 차단).
create policy "Admins can read participation events"
  on public.room_participation_events for select using (
    exists (
      select 1 from public.user_private_profiles p
      where p.user_id = auth.uid() and p.is_admin = true
    )
  );

-- 현재 활성 방의 참여자 백필. 닫힌 방은 이미 삭제되어 복구 불가.
insert into public.room_participation_events (room_id, user_id, joined_at)
select room_id, user_id, joined_at from public.room_participants
on conflict (room_id, user_id) do nothing;
