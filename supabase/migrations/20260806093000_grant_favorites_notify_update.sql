-- Task 9(경로 구독 API)의 PATCH /api/routes/[id] 가 notify_* 값을 수정한다.
-- favorites 는 원래 "즐겨찾기 추가/삭제"만 지원해 select, insert, delete grant만 있고
-- update grant가 없었다. RLS 정책("Users can manage own favorites" for all)은 update를
-- 이미 허용하지만, PostgREST/Data API는 명시적 컬럼 grant가 없으면 RLS 평가 이전에
-- permission denied로 막는다. from_location/to_location/user_id 는 이 API의 수정
-- 대상이 아니므로 notify_* 컬럼에만 update를 부여한다.
grant update (notify_enabled, notify_from, notify_to, notify_weekdays)
  on table public.favorites to authenticated;
