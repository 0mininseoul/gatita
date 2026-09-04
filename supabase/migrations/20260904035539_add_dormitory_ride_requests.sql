-- 기숙사생 여부는 선택 입력이다. true는 기숙사 동행 요청 푸시의 앱 내 수신 동의도
-- 함께 뜻하며, 실제 발송은 기존 push_enabled와 활성 push_subscriptions를 추가로 확인한다.
alter table public.user_private_profiles
  add column if not exists is_dormitory_resident boolean;

create index if not exists user_private_profiles_dormitory_push_idx
  on public.user_private_profiles (user_id)
  where is_dormitory_resident is true and push_enabled is true;

-- 일반 방과 기숙사 동행 요청으로 만들어진 방을 구분해 광역 푸시가 일반 방에는
-- 발송되지 않도록 한다.
alter table public.chat_rooms
  add column if not exists creation_source text not null default 'standard';

alter table public.chat_rooms
  drop constraint if exists chat_rooms_creation_source_valid;

alter table public.chat_rooms
  add constraint chat_rooms_creation_source_valid
  check (creation_source in ('standard', 'dormitory_request'));

-- 기숙사 요청 경로는 화면 검증을 우회한 직접 Data API 요청도 거부한다.
-- 제2기숙사 출발은 기존 전역 목적지 규칙과 같은 전체 목적지를 허용한다.
alter table public.chat_rooms
  drop constraint if exists chat_rooms_dormitory_request_route_valid;

alter table public.chat_rooms
  add constraint chat_rooms_dormitory_request_route_valid
  check (
    creation_source = 'standard'
    or (
      from_location in ('가천대역_1번출구', '가천대학교_정문')
      and to_location = '제2기숙사'
    )
    or (
      from_location = '제2기숙사'
      and to_location in ('가천대역_1번출구', '가천대학교_정문', '교육대학원', '중앙도서관', '학생회관')
    )
  );
