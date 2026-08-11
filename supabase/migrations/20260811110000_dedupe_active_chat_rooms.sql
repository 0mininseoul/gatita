-- 같은 경로(from_location, to_location) + 같은 출발일시(departure_date, departure_time)에
-- 활성(active) 방이 이미 있으면 새 방을 못 만들게 막는다. 매칭이 핵심인 서비스에서
-- 같은 시각·같은 경로 방이 둘로 갈리면 성사 확률이 그대로 절반이 되기 때문이다
-- (46일 실측: 실유저가 만든 방 37개 중 참여자 2명 이상은 2개뿐 — 그 순간 지도를 보고 있던
-- 사람과 우연히 맞아떨어져야만 성사됐다).
--
-- status='active' 인 방에 대해서만 유일하면 된다. 방이 닫히면(status='closed') 같은
-- 조합으로 다시 열 수 있어야 하므로(예: 같은 시간대가 다음날 또 열리는 경우) 부분
-- 유니크 인덱스로 active 행만 대상으로 한다.
--
-- 주의: 이미 프로덕션에 같은 조합의 active 방이 중복으로 있으면 이 인덱스 생성이
-- "could not create unique index" 에러로 실패한다. 적용 전 아래 쿼리로 중복 여부를
-- 먼저 확인하고, 있다면 사람이 판단해서 오래된/참여자 적은 쪽을 closed로 정리한 뒤
-- 이 마이그레이션을 적용해야 한다(이 파일은 정리를 자동으로 하지 않는다):
--
--   select from_location, to_location, departure_date, departure_time, count(*)
--     from public.chat_rooms where status = 'active'
--    group by 1,2,3,4 having count(*) > 1;
--
create unique index if not exists chat_rooms_active_route_departure_unique_idx
  on public.chat_rooms (from_location, to_location, departure_date, departure_time)
  where status = 'active';
