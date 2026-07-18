-- 출발시각 이후 채팅방을 나갈 때 "택시 탑승을 완료하셨나요?" 응답(예/아니오)을 기록.
--
-- room_participants row 는 나가기 시 삭제되므로, 탑승 완료 여부는 별도 테이블에 남긴다.
-- 방(chat_rooms)은 닫혀도(status='closed') row 는 유지되므로 room_id FK 는 살아있지만,
-- 혹시 방이 삭제되어도 응답 통계는 남기도록 on delete set null 을 쓴다.
create table if not exists public.ride_completions (
  id uuid default uuid_generate_v4() primary key,
  room_id uuid references public.chat_rooms(id) on delete set null,
  user_id uuid references public.users(id) on delete cascade not null,
  boarded boolean not null,
  answered_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (room_id, user_id)
);

create index if not exists ride_completions_room_id_idx on public.ride_completions (room_id);
create index if not exists ride_completions_user_id_idx on public.ride_completions (user_id);

alter table public.ride_completions enable row level security;

-- 기록은 서버(service_role, /api/rooms/[id]/leave)에서만 수행하므로 별도 insert 정책은 두지 않는다
-- (service_role 은 RLS 를 우회). 본인 응답 조회만 허용.
drop policy if exists "ride_completions_select_own" on public.ride_completions;
create policy "ride_completions_select_own" on public.ride_completions
  for select using (auth.uid() = user_id);
