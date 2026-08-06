-- favorites 를 "경로 구독"으로 재사용한다. 0건이므로 마이그레이션 비용이 없다.
-- notify_from > notify_to 이면 자정을 넘는 구간으로 해석한다 (예: 22:00~02:00).
-- 둘 다 null 이면 종일. 이 대소 관계를 의미로 쓰므로 from/to 순서에 제약을 걸지 않는다.
alter table public.favorites
  add column if not exists notify_enabled boolean not null default true,
  add column if not exists notify_from time,
  add column if not exists notify_to time,
  add column if not exists notify_weekdays smallint[] not null default '{0,1,2,3,4,5,6}';

-- 0=일요일 … 6=토요일. 빈 배열은 "알림 없음"과 같으므로 금지한다.
-- array_length(빈배열, 1)은 0이 아니라 NULL을 반환하므로 coalesce로 감싼다
-- (감싸지 않으면 NULL between ... => NULL이 되어 CHECK가 통과시켜버린다).
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'favorites_notify_weekdays_valid'
      and conrelid = 'public.favorites'::regclass
  ) then
    alter table public.favorites
      add constraint favorites_notify_weekdays_valid check (
        coalesce(array_length(notify_weekdays, 1), 0) between 1 and 7
        and notify_weekdays <@ '{0,1,2,3,4,5,6}'::smallint[]
      );
  end if;
end $$;

-- 한쪽만 설정된 반쪽 구간을 막는다.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'favorites_notify_window_paired'
      and conrelid = 'public.favorites'::regclass
  ) then
    alter table public.favorites
      add constraint favorites_notify_window_paired check (
        (notify_from is null and notify_to is null)
        or (notify_from is not null and notify_to is not null)
      );
  end if;
end $$;

create index if not exists favorites_route_idx
  on public.favorites(from_location, to_location) where notify_enabled;
