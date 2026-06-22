-- 1) 누락된 가천 유저의 public.users 생성
insert into public.users (id, nickname, department, avatar_url)
select
  au.id,
  null,
  nullif(trim(split_part(coalesce(au.raw_user_meta_data->>'name', au.raw_user_meta_data->>'full_name', ''), '/', 2)), ''),
  coalesce(au.raw_user_meta_data->>'avatar_url', au.raw_user_meta_data->>'picture')
from auth.users au
where lower(au.email) like '%@gachon.ac.kr'
  and not exists (select 1 from public.users u where u.id = au.id)
on conflict (id) do nothing;

-- 2) 누락된 가천 유저의 user_private_profiles 생성 (onboarded_at NULL)
insert into public.user_private_profiles (user_id, email, name, status, is_admin, onboarded_at)
select
  au.id,
  au.email,
  nullif(trim(split_part(coalesce(au.raw_user_meta_data->>'name', au.raw_user_meta_data->>'full_name', ''), '/', 1)), ''),
  'active',
  false,
  null
from auth.users au
where lower(au.email) like '%@gachon.ac.kr'
  and not exists (select 1 from public.user_private_profiles p where p.user_id = au.id)
on conflict (user_id) do nothing;

-- 3) avatar_url 백필 (NULL인 기존 유저)
update public.users u
set avatar_url = coalesce(au.raw_user_meta_data->>'avatar_url', au.raw_user_meta_data->>'picture')
from auth.users au
where au.id = u.id and u.avatar_url is null
  and coalesce(au.raw_user_meta_data->>'avatar_url', au.raw_user_meta_data->>'picture') is not null;

-- 4) 기존 온보딩 완료자(bank_name 보유) onboarded_at = 가입일
update public.user_private_profiles p
set onboarded_at = u.created_at
from public.users u
where u.id = p.user_id
  and p.onboarded_at is null
  and p.bank_name is not null;
