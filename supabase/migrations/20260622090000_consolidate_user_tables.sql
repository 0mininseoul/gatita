-- 공개 프로필: 로그인 시점 자동생성을 위해 NOT NULL 완화
alter table public.users alter column nickname drop not null;
alter table public.users alter column department drop not null;

-- 비공개 프로필: 온보딩 전 자동생성을 위해 완화 + 컬럼 추가
alter table public.user_private_profiles alter column name drop not null;
alter table public.user_private_profiles alter column phone drop not null;
alter table public.user_private_profiles add column if not exists bank_name varchar(50);
alter table public.user_private_profiles add column if not exists account_number varchar(50);
alter table public.user_private_profiles add column if not exists account_holder varchar(100);
alter table public.user_private_profiles add column if not exists onboarded_at timestamp with time zone;

-- 기존 payout 데이터를 private로 병합
update public.user_private_profiles p
set bank_name = a.bank_name,
    account_number = a.account_number,
    account_holder = a.account_holder
from public.user_payout_accounts a
where a.user_id = p.user_id;

-- payout 정책 + 테이블 제거
drop policy if exists "Users can insert own payout account" on public.user_payout_accounts;
drop policy if exists "Users can read own payout account" on public.user_payout_accounts;
drop policy if exists "Users can update own payout account" on public.user_payout_accounts;
drop table if exists public.user_payout_accounts;
