-- Amplitude fixed_point_selected was already collecting these events before the
-- Supabase event table was introduced. The daily chart exposes counts, so this
-- backfill preserves user/origin/day/count semantics with noon KST timestamps.
-- It is intentionally a one-time data migration; future events are written by
-- /api/analytics/location-sheet.
insert into public.location_sheet_view_events (user_id, from_location, viewed_at)
select seed.user_id::uuid,
  seed.from_location,
  (seed.event_date::timestamp at time zone 'Asia/Seoul')
    + interval '12 hours'
    + (series_index - 1) * interval '1 minute'
from (values
  ('db9d4f88-b009-407d-ad7e-f29606282b36', '가천대역_1번출구', '2026-07-08'::date, 1),
  ('7a203eda-439c-4b55-8107-494fd9e08946', '가천대학교_정문', '2026-07-11'::date, 14),
  ('31aa2668-c490-4814-86df-2fe12a473eda', '가천대역_1번출구', '2026-07-14'::date, 2),
  ('05050afb-ebcc-4135-bf8f-3f5cb97beaf4', '제2기숙사', '2026-07-15'::date, 3),
  ('05050afb-ebcc-4135-bf8f-3f5cb97beaf4', '중앙도서관', '2026-07-15'::date, 1),
  ('db9d4f88-b009-407d-ad7e-f29606282b36', 'AI공학관', '2026-07-15'::date, 3),
  ('283d56ff-4b7e-419c-8083-5617c4db8384', '가천대역_1번출구', '2026-07-16'::date, 3),
  ('0b292645-62d5-451f-a608-d9a0371b0568', '교육대학원', '2026-07-18'::date, 1),
  ('f03cd79c-a880-458c-a23d-d5488ab0eee7', 'AI공학관', '2026-07-20'::date, 2),
  ('db9d4f88-b009-407d-ad7e-f29606282b36', '가천대역_1번출구', '2026-07-21'::date, 6),
  ('0e5ce058-b26e-4666-a7ac-6d7c9ffe91f3', 'AI공학관', '2026-07-22'::date, 1),
  ('0e5ce058-b26e-4666-a7ac-6d7c9ffe91f3', '제2기숙사', '2026-07-22'::date, 1),
  ('41fb9978-2c12-4795-ae36-7282473fa3fe', '가천대역_1번출구', '2026-07-22'::date, 1),
  ('9213cf63-cb0a-4b6c-9fec-e0c3e2a5b789', 'AI공학관', '2026-07-22'::date, 4),
  ('41fb9978-2c12-4795-ae36-7282473fa3fe', 'AI공학관', '2026-07-23'::date, 1),
  ('88829c2e-4f14-4f55-996c-786f91447bb3', '가천대학교_정문', '2026-07-23'::date, 1),
  ('9213cf63-cb0a-4b6c-9fec-e0c3e2a5b789', 'AI공학관', '2026-07-23'::date, 2),
  ('88829c2e-4f14-4f55-996c-786f91447bb3', 'AI공학관', '2026-07-24'::date, 1),
  ('88829c2e-4f14-4f55-996c-786f91447bb3', '가천대역_1번출구', '2026-07-24'::date, 1),
  ('88829c2e-4f14-4f55-996c-786f91447bb3', '가천대학교_정문', '2026-07-24'::date, 1),
  ('88829c2e-4f14-4f55-996c-786f91447bb3', '중앙도서관', '2026-07-24'::date, 2),
  ('283d56ff-4b7e-419c-8083-5617c4db8384', '가천대역_1번출구', '2026-07-27'::date, 5),
  ('283d56ff-4b7e-419c-8083-5617c4db8384', '가천대역_1번출구', '2026-07-28'::date, 3),
  ('334938d2-76b1-483b-92f6-caf7591d946b', 'AI공학관', '2026-07-30'::date, 1),
  ('bc0d9e96-d0a4-4795-9111-f9ca123755e0', '가천대역_1번출구', '2026-07-30'::date, 10),
  ('283d56ff-4b7e-419c-8083-5617c4db8384', '가천대역_1번출구', '2026-08-03'::date, 1),
  ('729bb2db-2462-4700-a758-744c9f017a77', '중앙도서관', '2026-08-03'::date, 1),
  ('7a203eda-439c-4b55-8107-494fd9e08946', '가천대역_1번출구', '2026-08-03'::date, 1),
  ('7a203eda-439c-4b55-8107-494fd9e08946', '가천대학교_정문', '2026-08-03'::date, 2),
  ('8ec1d534-47cc-4d11-a233-905e3d5a5abd', '가천대역_1번출구', '2026-08-03'::date, 2),
  ('41fb9978-2c12-4795-ae36-7282473fa3fe', 'AI공학관', '2026-08-04'::date, 1),
  ('41fb9978-2c12-4795-ae36-7282473fa3fe', '가천대역_1번출구', '2026-08-04'::date, 1),
  ('4e00755e-586a-44b3-b605-04fc45fd3a22', '가천대역_1번출구', '2026-08-04'::date, 10),
  ('4e00755e-586a-44b3-b605-04fc45fd3a22', '가천대학교_정문', '2026-08-04'::date, 1),
  ('4e00755e-586a-44b3-b605-04fc45fd3a22', '교육대학원', '2026-08-04'::date, 1),
  ('4e00755e-586a-44b3-b605-04fc45fd3a22', '중앙도서관', '2026-08-04'::date, 1),
  ('18acb4cf-dba1-4a31-8c0a-fc935c13616b', 'AI공학관', '2026-08-06'::date, 1),
  ('4e00755e-586a-44b3-b605-04fc45fd3a22', 'AI공학관', '2026-08-06'::date, 3),
  ('4e00755e-586a-44b3-b605-04fc45fd3a22', '가천대역_1번출구', '2026-08-06'::date, 6),
  ('9be02c92-6488-41e3-a4fe-36a5abeb34f4', '가천대역_1번출구', '2026-08-06'::date, 2)
) as seed(user_id, from_location, event_date, event_count)
cross join lateral generate_series(1, seed.event_count) as generated(series_index)
where seed.user_id::uuid <> '5a018580-6558-44fc-a621-1fa2506e9d5e'::uuid
  and exists (
    select 1
    from public.users u
    where u.id = seed.user_id::uuid
  );
