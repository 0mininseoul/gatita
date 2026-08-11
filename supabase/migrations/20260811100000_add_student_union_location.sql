-- add value if not exists 는 이미 있는 값이면 조용히 넘어가므로 사람이 손으로
-- 재실행해도 안전하다(20260618081000_add_central_library_location.sql 과 동일 패턴).
alter type public.location_type add value if not exists '학생회관';
