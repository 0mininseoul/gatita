# 유저 테이블 통합 + 가천 로그인 즉시 유저화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 가천(`@gachon.ac.kr`) 계정이 Google 로그인하면 온보딩 전이라도 즉시 유저 레코드를 갖게 하고, 유저 정보 테이블을 3개→2개로 통합한다.

**Architecture:** `auth.users` AFTER INSERT 트리거가 가천 계정에 한해 `public.users`(공개) + `user_private_profiles`(비공개) row를 자동 생성한다. 온보딩 완료는 `user_private_profiles.onboarded_at`으로 판별한다. `user_payout_accounts`는 `user_private_profiles`로 병합·제거하고, 계좌 수정은 서버 라우트로 옮긴다.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase(Postgres + Auth), `supabase/migrations/*.sql`, `node --test` (`test/*.test.mjs`), `npm run smoke:user`.

## Global Constraints

- 프라이버시 경계: 공개 = `nickname`/`department`/`avatar_url`; 비공개(본인+관리자) = `email`/`name`/`phone`/계좌/정지상태.
- 온보딩 미완료 가천 유저는 집계/관리자 가시성만. 실제 기능(방 참여·채팅)은 `onboarded_at IS NOT NULL` 게이트 유지.
- 마이그레이션 파일명: `supabase/migrations/YYYYMMDDHHMMSS_<설명>.sql`. 기존 패턴(`create ... if not exists`, `on conflict do update`) 따른다.
- 대상 프로젝트: Supabase `GATITA-new` (`hggpwrtasyngpjcbwjzg`).
- 마이그레이션 적용: 파일 저장(버전관리) + 동일 SQL을 원격 DB에 적용(`supabase db push` 또는 MCP `apply_migration`).
- 배포 순서: 스키마/트리거/백필(Task 1~4) 먼저 → 코드(Task 5~8) 나중. nullable 완화 덕에 기존 코드가 중간 상태에서도 깨지지 않는다.
- DB 변경 후 반드시 `npm run lint`와 `npm run build` 통과 확인.

---

## File Structure

- `supabase/migrations/20260622090000_consolidate_user_tables.sql` — 스키마 변경 + payout 병합 + payout 테이블/정책 제거 (Task 1)
- `supabase/migrations/20260622090500_handle_new_user_trigger.sql` — 자동생성 트리거 (Task 2)
- `supabase/migrations/20260622091000_backfill_users.sql` — onboarded_at/avatar 백필 + 미완료 가천 유저 row 생성 (Task 3)
- `app/api/profile/me/route.ts` — 온보딩 판별 + payout 조립 (Task 5)
- `app/api/profile/complete/route.ts` — INSERT→upsert + onboarded_at (Task 6)
- `app/api/profile/payout/route.ts` — 신규 계좌 수정 라우트 (Task 7)
- `app/settings/page.tsx` — 계좌 저장 경로를 새 라우트로 (Task 7)
- `app/auth/callback/route.ts` — 비-가천 auth 삭제 하드닝 (Task 8)
- `supabase_schema.sql`, `CLAUDE.md` — 문서 동기화 (Task 9)

---

## Task 1: 스키마 마이그레이션 — NOT NULL 완화, 컬럼 추가, payout 병합·제거

**Files:**
- Create: `supabase/migrations/20260622090000_consolidate_user_tables.sql`

**Interfaces:**
- Produces: `public.users.nickname`/`department` nullable; `user_private_profiles`에 `bank_name`/`account_number`/`account_holder`/`onboarded_at` 컬럼; `user_payout_accounts` 테이블 제거.

- [ ] **Step 1: 현재 상태 확인 (실패 조건 = 변경 전 상태)**

원격 DB에 실행:
```sql
select
  (select is_nullable from information_schema.columns
     where table_schema='public' and table_name='users' and column_name='nickname') as nickname_nullable,
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='user_private_profiles' and column_name='onboarded_at') as has_onboarded_at,
  (select count(*) from information_schema.tables
     where table_schema='public' and table_name='user_payout_accounts') as payout_table_exists;
```
Expected (변경 전): `nickname_nullable='NO'`, `has_onboarded_at=0`, `payout_table_exists=1`

- [ ] **Step 2: 마이그레이션 파일 작성**

`supabase/migrations/20260622090000_consolidate_user_tables.sql`:
```sql
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
```

- [ ] **Step 3: 마이그레이션 적용**

`supabase db push` (CLI 연결 시) 또는 MCP `apply_migration`로 위 SQL 적용.

- [ ] **Step 4: 검증 (통과 조건 = 변경 후)**

Step 1 쿼리 재실행. Expected: `nickname_nullable='YES'`, `has_onboarded_at=1`, `payout_table_exists=0`
추가로 병합 확인:
```sql
select user_id, bank_name, account_number is not null as has_acct
from public.user_private_profiles where bank_name is not null;
```
Expected: 기존 payout 보유 유저(1명) row가 bank_name 채워진 채로 나온다.

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/20260622090000_consolidate_user_tables.sql
git commit -m "feat(db): relax user profile NOT NULLs, merge payout into private profiles"
```

---

## Task 2: 자동생성 트리거 `handle_new_user`

**Files:**
- Create: `supabase/migrations/20260622090500_handle_new_user_trigger.sql`

**Interfaces:**
- Consumes: Task 1의 nullable 컬럼 + `onboarded_at`.
- Produces: `auth.users` AFTER INSERT 시 가천 계정에 한해 `public.users` + `user_private_profiles` row 자동 생성.

- [ ] **Step 1: 트리거 부재 확인 (실패 조건)**
```sql
select count(*) as trg from pg_trigger
where tgname = 'on_auth_user_created' and not tgisinternal;
```
Expected (변경 전): `trg=0`

- [ ] **Step 2: 마이그레이션 파일 작성**

`supabase/migrations/20260622090500_handle_new_user_trigger.sql`:
```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  display_name text;
  parsed_name text;
  parsed_department text;
  parsed_avatar text;
begin
  -- 가천 계정만 처리
  if new.email is null or lower(new.email) not like '%@gachon.ac.kr' then
    return new;
  end if;

  display_name := coalesce(
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'display_name'
  );

  -- 앱 extractGachonProfileFromMetadata 로직 재현: "이름/학과" 형태
  parsed_name := nullif(trim(split_part(coalesce(display_name, ''), '/', 1)), '');
  parsed_department := nullif(trim(split_part(coalesce(display_name, ''), '/', 2)), '');
  parsed_avatar := coalesce(
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'picture'
  );

  insert into public.users (id, nickname, department, avatar_url)
  values (new.id, null, parsed_department, parsed_avatar)
  on conflict (id) do nothing;

  insert into public.user_private_profiles (user_id, email, name, status, is_admin, onboarded_at)
  values (new.id, new.email, parsed_name, 'active', false, null)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 3: 마이그레이션 적용** (`supabase db push` 또는 MCP `apply_migration`)

- [ ] **Step 4: 검증 — 트리거 존재**
```sql
select count(*) as trg from pg_trigger
where tgname = 'on_auth_user_created' and not tgisinternal;
```
Expected: `trg=1`

- [ ] **Step 5: 기능 검증 (수동, 배포 후)**

실제 가천 테스트 Google 계정으로 로그인 → 다음으로 자동생성 확인:
```bash
npm run smoke:user -- inspect --email <테스트>@gachon.ac.kr
```
Expected: auth 유저와 함께 `users`, `user_private_profiles` row가 존재(닉네임 NULL, onboarded_at NULL, email/name/avatar 채워짐).

- [ ] **Step 6: Commit**
```bash
git add supabase/migrations/20260622090500_handle_new_user_trigger.sql
git commit -m "feat(db): auto-create profile rows for gachon users on signup"
```

---

## Task 3: 백필 — onboarded_at, avatar, 미완료 가천 유저 row

**Files:**
- Create: `supabase/migrations/20260622091000_backfill_users.sql`

**Interfaces:**
- Consumes: Task 1/2 결과.
- Produces: 모든 가천 `auth.users`가 `public.users` + `user_private_profiles` 보유; 완료 유저는 `onboarded_at` 세팅; avatar 백필.

- [ ] **Step 1: 불일치 확인 (실패 조건)**
```sql
select count(*) as gachon_without_public
from auth.users au
where lower(au.email) like '%@gachon.ac.kr'
  and not exists (select 1 from public.users u where u.id = au.id);
```
Expected (변경 전): `gachon_without_public >= 1` (lss040228 포함)

- [ ] **Step 2: 마이그레이션 파일 작성**

`supabase/migrations/20260622091000_backfill_users.sql`:
```sql
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
```

- [ ] **Step 3: 마이그레이션 적용**

- [ ] **Step 4: 검증 (통과 조건)**
```sql
select
  (select count(*) from auth.users au
     where lower(au.email) like '%@gachon.ac.kr'
       and not exists (select 1 from public.users u where u.id = au.id)) as gachon_without_public,
  (select count(*) from public.user_private_profiles where onboarded_at is not null) as onboarded,
  (select count(*) from public.users where avatar_url is not null) as with_avatar;
```
Expected: `gachon_without_public=0`, `onboarded=2` (ym5373, toma12345), `with_avatar>=3`
lss040228 미완료 확인:
```sql
select p.onboarded_at, u.nickname from public.user_private_profiles p
join public.users u on u.id = p.user_id
where p.email = 'lss040228@gachon.ac.kr';
```
Expected: `onboarded_at=NULL`, `nickname=NULL`

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/20260622091000_backfill_users.sql
git commit -m "feat(db): backfill profile rows, avatars, and onboarded_at"
```

---

## Task 4: 비-가천 orphan auth 유저 정리 (ascentumseoul)

**Files:**
- (DB 데이터 작업 — 마이그레이션 파일 없이 1회성 실행)

**Interfaces:**
- Consumes: 없음.
- Produces: 공개 프로필이 없는 비-가천 `auth.users` 삭제.

- [ ] **Step 1: 대상 확인 (실패 조건)**
```sql
select au.id, au.email from auth.users au
where lower(au.email) not like '%@gachon.ac.kr'
  and not exists (select 1 from public.users u where u.id = au.id);
```
Expected (변경 전): `ascentumseoul@gmail.com` 1건

- [ ] **Step 2: 삭제 실행**

원격 DB에 실행 (auth.identities/sessions는 FK cascade로 함께 삭제):
```sql
delete from auth.users au
where lower(au.email) not like '%@gachon.ac.kr'
  and not exists (select 1 from public.users u where u.id = au.id);
```

- [ ] **Step 3: 검증 (통과 조건)**

Step 1 쿼리 재실행. Expected: 0건. 그리고:
```sql
select (select count(*) from auth.users) as auth_users,
       (select count(*) from auth.identities) as identities;
```
Expected: `auth_users=3`, `identities=3`

- [ ] **Step 4: Commit** (코드 변경 없음 — 데이터 작업 기록만)
```bash
git commit --allow-empty -m "chore(db): remove non-gachon orphan auth user (ascentumseoul)"
```

---

## Task 5: `/api/profile/me` — onboarded_at 판별 + payout 조립

**Files:**
- Modify: `app/api/profile/me/route.ts`

**Interfaces:**
- Consumes: `user_private_profiles.onboarded_at`, `bank_name`, `account_number`, `account_holder`.
- Produces: 응답 shape 유지 — `{ profileCompleted: boolean, user: {...}|null, payoutAccount: {...}|null }`. `profileCompleted = !!private.onboarded_at`.

- [ ] **Step 1: 라우트 본문 교체**

`app/api/profile/me/route.ts`의 `getMyProfile` 본문(line 8~76)을 다음으로 교체:
```typescript
async function getMyProfile() {
  const supabase = createClient()
  const { data, error: authError } = await supabase.auth.getUser()
  const authUser = data.user

  if (authError || !authUser) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const admin = createAdminSupabase()

  const [publicProfileResult, privateProfileResult] = await Promise.all([
    admin
      .from('users')
      .select('id, nickname, nickname_updated_at, department, avatar_url, created_at, updated_at')
      .eq('id', authUser.id)
      .maybeSingle(),
    admin
      .from('user_private_profiles')
      .select('user_id, email, name, phone, phone_verified_at, phone_mfa_factor_id, bank_name, account_number, account_holder, status, suspended_until, suspension_reason, moderation_updated_at, is_admin, onboarded_at, created_at, updated_at')
      .eq('user_id', authUser.id)
      .maybeSingle(),
  ])

  const firstError = publicProfileResult.error || privateProfileResult.error

  if (firstError) {
    console.error('Profile me load error:', firstError)
    return NextResponse.json({ error: '프로필을 불러오지 못했습니다' }, { status: 500 })
  }

  const publicProfile = publicProfileResult.data
  const privateProfile = privateProfileResult.data

  if (!publicProfile || !privateProfile || !privateProfile.onboarded_at) {
    return NextResponse.json({
      profileCompleted: false,
      user: null,
      payoutAccount: null,
    })
  }

  const payoutAccount = privateProfile.bank_name
    ? {
        user_id: privateProfile.user_id,
        bank_name: privateProfile.bank_name,
        account_number: privateProfile.account_number,
        account_holder: privateProfile.account_holder,
        created_at: privateProfile.created_at,
        updated_at: privateProfile.updated_at,
      }
    : null

  return NextResponse.json({
    profileCompleted: true,
    user: {
      id: publicProfile.id,
      nickname: publicProfile.nickname,
      nickname_updated_at: publicProfile.nickname_updated_at,
      department: publicProfile.department,
      avatar_url: publicProfile.avatar_url,
      created_at: publicProfile.created_at,
      updated_at: publicProfile.updated_at,
      email: privateProfile.email,
      name: privateProfile.name,
      phone: privateProfile.phone,
      phone_verified_at: privateProfile.phone_verified_at,
      phone_mfa_factor_id: privateProfile.phone_mfa_factor_id,
      status: privateProfile.status,
      suspended_until: privateProfile.suspended_until,
      suspension_reason: privateProfile.suspension_reason,
      moderation_updated_at: privateProfile.moderation_updated_at,
      is_admin: privateProfile.is_admin,
      private_created_at: privateProfile.created_at,
      private_updated_at: privateProfile.updated_at,
    },
    payoutAccount,
  })
}
```

- [ ] **Step 2: 빌드/린트 검증**

Run: `npm run lint && npm run build`
Expected: 에러 없음 (특히 `user_payout_accounts` 참조가 이 파일에 더 이상 없어야 함)

- [ ] **Step 3: 기능 검증 (수동)**

온보딩 완료 계정으로 앱 진입 → 홈/지도 정상 진입(`profileCompleted=true`). 미완료 가천 계정으로 진입 → 온보딩 화면(`profileCompleted=false`).

- [ ] **Step 4: Commit**
```bash
git add app/api/profile/me/route.ts
git commit -m "feat(api): derive profileCompleted from onboarded_at; assemble payout from private profile"
```

---

## Task 6: `/api/profile/complete` — upsert + onboarded_at

**Files:**
- Modify: `app/api/profile/complete/route.ts`

**Interfaces:**
- Consumes: Task 1 컬럼.
- Produces: 온보딩 제출 시 `users.nickname`, private의 `name/phone/bank_*` 채우고 `onboarded_at=now()` 세팅.

- [ ] **Step 1: 완료 판별 + 쓰기 로직 교체**

`app/api/profile/complete/route.ts`에서 기존 "이미 완료" 체크(line 72~91)와 3개 테이블 쓰기(line 108~150)를 다음으로 교체.

기존 완료 체크 블록(Promise.all로 `existingPrivateResult`/`existingPayoutResult` 조회 후 둘 다 있으면 409)을 다음으로 대체:
```typescript
  const admin = createAdminSupabase()
  const { data: existingPrivate, error: existingPrivateError } = await admin
    .from('user_private_profiles')
    .select('onboarded_at')
    .eq('user_id', authUser.id)
    .maybeSingle()

  if (existingPrivateError) {
    return NextResponse.json({ error: '프로필 상태를 확인하지 못했습니다' }, { status: 500 })
  }

  if (existingPrivate?.onboarded_at) {
    return NextResponse.json({ error: '이미 프로필 세팅이 완료되었습니다' }, { status: 409 })
  }
```

닉네임 중복 체크(line 93~106)는 그대로 유지.

기존 3개 테이블 쓰기 블록(public users upsert + private upsert + payout upsert)을 다음으로 대체:
```typescript
  const googleProfile = extractGachonProfileFromMetadata(authUser.user_metadata)
  const department = googleProfile.department || '학과 미확인'

  const { error: publicProfileError } = await admin
    .from('users')
    .upsert({
      id: authUser.id,
      nickname: validated.data.nickname,
      department,
    }, { onConflict: 'id' })

  if (publicProfileError) {
    console.error('Public profile creation error:', publicProfileError)
    return NextResponse.json({ error: '공개 프로필을 생성하지 못했습니다' }, { status: 500 })
  }

  const { error: privateProfileError } = await admin
    .from('user_private_profiles')
    .upsert({
      user_id: authUser.id,
      email,
      name: validated.data.name,
      phone: validated.data.phone,
      bank_name: validated.data.bankName,
      account_number: validated.data.accountNumber,
      account_holder: validated.data.accountHolder,
      onboarded_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

  if (privateProfileError) {
    console.error('Private profile creation error:', privateProfileError)
    return NextResponse.json({ error: '비공개 프로필을 생성하지 못했습니다' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
```

> 주의: 기존 `user_payout_accounts` 쓰기 블록은 완전히 제거한다.

- [ ] **Step 2: 빌드/린트 검증**

Run: `npm run lint && npm run build`
Expected: 에러 없음, `user_payout_accounts` 참조 없음.

- [ ] **Step 3: 기능 검증 (수동)**

미완료 가천 계정으로 온보딩 폼 제출 → 성공 응답 → `/api/profile/me`가 `profileCompleted=true` 반환. 재제출 시 409.
```bash
npm run smoke:user -- inspect --email <테스트>@gachon.ac.kr
```
Expected: `onboarded_at` 세팅됨, nickname/phone/bank 채워짐.

- [ ] **Step 4: Commit**
```bash
git add app/api/profile/complete/route.ts
git commit -m "feat(api): complete onboarding via upsert + onboarded_at, write bank into private profile"
```

---

## Task 7: 신규 `PATCH /api/profile/payout` + settings 연결

**Files:**
- Create: `app/api/profile/payout/route.ts`
- Modify: `app/settings/page.tsx:418-448`

**Interfaces:**
- Consumes: `user_private_profiles` 의 `bank_name/account_number/account_holder`.
- Produces: `PATCH /api/profile/payout` — body `{ bank_name, account_number, account_holder }`, 성공 시 `{ payoutAccount: {...} }` 반환.

- [ ] **Step 1: 서버 라우트 작성**

`app/api/profile/payout/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { withAxiomRoute } from '@/lib/axiom/server'
import { isAccountNumberCompleteForBank } from '@/lib/banks'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type PayoutPayload = {
  bank_name?: string
  account_number?: string
  account_holder?: string
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

async function updatePayout(request: Request) {
  const supabase = createClient()
  const { data, error: authError } = await supabase.auth.getUser()
  const authUser = data.user

  if (authError || !authUser) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const payload = (await request.json().catch(() => null)) as PayoutPayload | null
  const bankName = cleanText(payload?.bank_name)
  const accountNumber = cleanText(payload?.account_number)
  const accountHolder = cleanText(payload?.account_holder)

  if (!bankName || !accountNumber || !accountHolder) {
    return NextResponse.json({ error: '은행명, 계좌번호, 계좌주 이름을 모두 입력해주세요' }, { status: 400 })
  }
  if (!isAccountNumberCompleteForBank(bankName, accountNumber)) {
    return NextResponse.json({ error: '선택한 은행의 계좌번호 형식에 맞게 입력해주세요' }, { status: 400 })
  }

  const admin = createAdminSupabase()
  const { data: updated, error } = await admin
    .from('user_private_profiles')
    .update({
      bank_name: bankName,
      account_number: accountNumber,
      account_holder: accountHolder,
    })
    .eq('user_id', authUser.id)
    .select('user_id, bank_name, account_number, account_holder, created_at, updated_at')
    .single()

  if (error) {
    console.error('Payout update error:', error)
    return NextResponse.json({ error: '계좌 정보 저장 중 오류가 발생했습니다' }, { status: 500 })
  }

  return NextResponse.json({ payoutAccount: updated })
}

export const PATCH = withAxiomRoute(updatePayout)
```

- [ ] **Step 2: settings 페이지 저장부 교체**

`app/settings/page.tsx`의 try 블록(line 421~448, `supabase.from('user_payout_accounts').upsert(...)`)을 다음으로 교체:
```typescript
    try {
      const response = await fetch('/api/profile/payout', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextAccount),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(result?.error ?? '계좌 정보 저장 중 오류가 발생했습니다')
      }

      const saved = result.payoutAccount
      setPayoutAccount(saved)
      setAccountForm({
        bank_name: saved.bank_name,
        account_number: saved.account_number,
        account_holder: saved.account_holder,
      })
      trackEvent('payout_account_updated', {
        bank_name: saved.bank_name,
      })
      toast.success('계좌 정보가 저장되었습니다')
    } catch (error) {
      console.error('Payout account save error:', error)
      toast.error(error instanceof Error ? error.message : '계좌 정보 저장 중 오류가 발생했습니다')
    } finally {
      setIsSavingAccount(false)
    }
```

- [ ] **Step 3: 빌드/린트 검증**

Run: `npm run lint && npm run build`
Expected: 에러 없음. settings 페이지에 `user_payout_accounts` 직접 참조가 남아있지 않은지 확인:
`grep -n "user_payout_accounts" app/settings/page.tsx` → 결과 없음.

- [ ] **Step 4: 기능 검증 (수동)**

완료 계정으로 설정 → 정산 계좌 수정 → 저장 성공 → 새로고침 후 값 유지. 잘못된 계좌번호 형식 입력 시 400 에러 메시지 표시.

- [ ] **Step 5: Commit**
```bash
git add app/api/profile/payout/route.ts app/settings/page.tsx
git commit -m "feat: move payout account edit to server route"
```

---

## Task 8: 콜백 하드닝 — 비-가천 auth 유저 삭제

**Files:**
- Modify: `app/auth/callback/route.ts:48-51`

**Interfaces:**
- Consumes: `createAdminSupabase`.
- Produces: 비-가천 로그인 시 `signOut` + `auth.users` 삭제로 orphan 누적 차단.

- [ ] **Step 1: import 추가**

`app/auth/callback/route.ts` 상단 import에 추가:
```typescript
import { createAdminSupabase } from '@/lib/supabase/admin'
```

- [ ] **Step 2: 비-가천 분기 교체**

기존(line 48~51):
```typescript
  if (!isGachonEmail(data.user?.email)) {
    await supabase.auth.signOut()
    return redirectToHome(origin, { auth_error: NON_GACHON_ACCOUNT_MESSAGE })
  }
```
교체:
```typescript
  if (!isGachonEmail(data.user?.email)) {
    const nonGachonUserId = data.user?.id
    await supabase.auth.signOut()
    if (nonGachonUserId) {
      try {
        await createAdminSupabase().auth.admin.deleteUser(nonGachonUserId)
      } catch (deleteError) {
        console.error('Failed to delete non-gachon auth user:', deleteError)
      }
    }
    return redirectToHome(origin, { auth_error: NON_GACHON_ACCOUNT_MESSAGE })
  }
```

- [ ] **Step 3: 빌드/린트 검증**

Run: `npm run lint && npm run build`
Expected: 에러 없음.

- [ ] **Step 4: 기능 검증 (수동)**

비-가천 Google 계정으로 로그인 시도 → 거부 메시지 + 이후 `select count(*) from auth.users where lower(email) not like '%@gachon.ac.kr'` 가 증가하지 않음(0 유지).

- [ ] **Step 5: Commit**
```bash
git add app/auth/callback/route.ts
git commit -m "feat(auth): delete non-gachon auth user on callback to prevent orphans"
```

---

## Task 9: 문서 동기화

**Files:**
- Modify: `supabase_schema.sql`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: 최종 스키마.
- Produces: 레포 canonical 스키마/문서가 실제 DB와 일치.

- [ ] **Step 1: `supabase_schema.sql` 갱신**

`user_payout_accounts` 정의/정책 제거, `user_private_profiles`에 `bank_name`/`account_number`/`account_holder`/`onboarded_at` 추가, `users.nickname`/`department` nullable 반영, `handle_new_user` 함수+트리거 추가. (Task 1~3 마이그레이션 내용과 일치시킨다.)

- [ ] **Step 2: `CLAUDE.md` "Signup Flow" 섹션 갱신**

다음 취지로 수정:
```markdown
### Signup Flow
Google OAuth 로그인 시 가천(@gachon.ac.kr) 계정은 DB 트리거(`handle_new_user`)가
`public.users`(공개: 학과·아바타) + `user_private_profiles`(비공개: 이메일·이름)를 자동 생성한다.
온보딩 폼 제출 시 닉네임·전화·계좌가 채워지고 `user_private_profiles.onboarded_at`이 세팅되며,
이 값으로 온보딩 완료를 판별한다. 계좌 정보는 `user_private_profiles`에 저장된다
(`user_payout_accounts` 테이블은 제거됨).
```
또한 Database Schema 목록에서 `user_payout_accounts` 제거.

- [ ] **Step 3: Commit**
```bash
git add supabase_schema.sql CLAUDE.md
git commit -m "docs: sync schema and signup flow with consolidated user tables"
```

---

## Self-Review 결과

**Spec coverage:** spec 섹션 4(데이터모델)=Task1, 5(트리거)=Task2, 6(판별전환)=Task5·6·7, 7(RLS)=Task1(정책삭제)/기존유지, 8(마이그레이션순서)=Global Constraints+Task순서, 9(백필)=Task3, 10(하드닝)=Task8, 9-3(gmail정리)=Task4, 12(문서)=Task9. 누락 없음.

**Placeholder scan:** "학과 미확인" 폴백, 모든 SQL/코드 블록 실제 내용 포함. TBD/TODO 없음.

**Type consistency:** `payoutAccount` 객체 형태(`user_id, bank_name, account_number, account_holder, created_at, updated_at`)가 me 라우트(Task5)·payout 라우트(Task7)·settings(Task7)에서 동일. `profileCompleted`/`onboarded_at` 명칭 일관.
