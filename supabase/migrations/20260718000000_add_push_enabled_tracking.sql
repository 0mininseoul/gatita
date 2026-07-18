-- 푸시 알림 허용(구독) 여부를 pwa_installed 처럼 유저 단위로 트래킹.
-- true  = 최소 1개 이상의 활성 푸시 구독 보유 (알림 켬)
-- false = 구독 없음 (알림 끔/미허용)
-- /api/push/subscribe 에서 true, /api/push/unsubscribe 에서 남은 구독 유무로 재계산.
alter table public.user_private_profiles
  add column if not exists push_enabled boolean not null default false;

-- 기존 구독자 백필: push_subscriptions 에 구독이 있는 유저는 true 로.
update public.user_private_profiles p
set push_enabled = true
where exists (
  select 1 from public.push_subscriptions s where s.user_id = p.user_id
)
and p.push_enabled = false;
