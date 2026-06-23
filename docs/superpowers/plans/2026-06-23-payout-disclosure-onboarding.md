# 방장 계좌 공개 제어 · 온보딩 계좌 "나중에" · 붙여넣기 · 닉네임 추천 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 방장이 계좌 공개 시점을 직접 제어하고, 온보딩에서 계좌를 "나중에"로 건너뛰며, 계좌번호 붙여넣기와 닉네임 랜덤 추천을 지원한다.

**Architecture:** Next.js 14 App Router(클라이언트 컴포넌트 + 서버 라우트) + Supabase. 계좌 노출은 `chat_rooms.payout_revealed_at` 컬럼으로 상태를 갖고, 서버 라우트(`/private`, `/reveal-payout`)에서 게이팅한다. 전파는 기존 `room-sync` broadcast 채널을 재사용한다. 닉네임/붙여넣기는 순수 클라이언트 변경.

**Tech Stack:** Next.js 14, TypeScript, Tailwind, Supabase(JS + admin client), lucide-react, react-hot-toast. 테스트는 `node --test test/*.test.mjs`(소스 텍스트 정적 단언 스타일).

## Global Constraints

- 닉네임 규칙: **2–10자** (`validateField` / 서버 검증과 동일). 생성 닉네임도 이 범위 준수.
- 계좌번호 유효성은 `isAccountNumberCompleteForBank(bankName, value)`로만 판정.
- 온보딩 완료 판정은 `user_private_profiles.onboarded_at IS NOT NULL` 단일 기준(변경 금지).
- Supabase 프로젝트 id: `hggpwrtasyngpjcbwjzg` (GATITA-new). 마이그레이션은 이 프로젝트에 적용.
- 테스트 실행: `npm test` (= `node --test test/*.test.mjs`). 테스트는 소스 파일을 읽어 정규식으로 단언한다.
- 계좌 공개는 **수동 전용·단방향**(자동 공개/되돌리기 없음).
- 커밋 메시지 끝에 다음 줄 포함:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- 새 코드는 주변 코드 스타일을 따른다(세미콜론 없음, 작은따옴표, 2-space indent).

---

## File Structure

- `components/BankAccountFields.tsx` (수정): `AccountNumberSegmentField`에 `onPaste` 핸들러.
- `lib/nicknames.ts` (신규): `NICKNAME_SAMPLES`, `generateRandomNickname`.
- `components/auth/SignupForm.tsx` (수정): 닉네임 추천 버튼, payout "나중에" 스킵, 리뷰 카피.
- `app/api/profile/complete/route.ts` (수정): 계좌 3필드 선택값 완화.
- `supabase_schema.sql` (수정) + Supabase 마이그레이션: `chat_rooms.payout_revealed_at`.
- `app/api/rooms/[id]/private/route.ts` (수정): 게이팅 + 새 응답 필드.
- `app/api/rooms/[id]/reveal-payout/route.ts` (신규): 방장 공개 라우트.
- `app/rooms/[id]/page.tsx` (수정): 슬롯 3상태, 공개 버튼, 인라인 계좌 입력, 상태 확장.
- `test/account-paste-and-nickname.test.mjs` (신규): 붙여넣기 + 닉네임 단언.
- `test/payout-disclosure-and-skip.test.mjs` (신규): 공개 게이팅 + 스킵 단언.

각 태스크는 위 파일들에 대해 독립적으로 테스트/리뷰 가능한 단위로 끝난다.

---

## Task 1: 계좌번호 붙여넣기 (onPaste)

**Files:**
- Modify: `components/BankAccountFields.tsx` (`AccountNumberSegmentField`, 약 270–358행)
- Test: `test/account-paste-and-nickname.test.mjs` (신규)

**Interfaces:**
- Consumes: 기존 `splitAccountNumberForBank`, `joinAccountSegments` (`lib/banks.ts`).
- Produces: 없음(컴포넌트 내부 동작 변경).

**원인:** 각 세그먼트 input의 `maxLength={length}`가 붙여넣기 텍스트를 한 칸 길이로 잘라 `onChange`에 넘기므로, 라인 304의 "초과분 분배" 분기가 도달하지 못한다. `onPaste`에서 직접 클립보드를 읽어 전체 분배한다.

- [ ] **Step 1: 실패 테스트 작성**

`test/account-paste-and-nickname.test.mjs` 생성:

```js
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const root = process.cwd()
const readProjectFile = (...parts) => readFileSync(join(root, ...parts), 'utf8')

test('account number segments accept pasted full numbers', () => {
  const fields = readProjectFile('components', 'BankAccountFields.tsx')
  assert.match(fields, /onPaste=/, 'segment inputs should handle paste explicitly')
  assert.match(fields, /clipboardData/, 'paste handler should read clipboard text')
  assert.match(fields, /splitAccountNumberForBank\(bankName, pastedDigits\)/, 'paste should redistribute digits across all segments')
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test 2>&1 | grep -A3 "account number segments accept pasted"`
Expected: FAIL (onPaste 미존재).

- [ ] **Step 3: onPaste 핸들러 구현**

`AccountNumberSegmentField` 안, `handleSegmentKeyDown` 아래에 추가:

```tsx
  const handleSegmentPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pastedText = event.clipboardData.getData('text')
    const pastedDigits = pastedText.replace(/\D/g, '')
    if (!pastedDigits) return

    event.preventDefault()
    const pastedSegments = splitAccountNumberForBank(bankName, pastedDigits)
    onChange(joinAccountSegments(pastedSegments))

    const firstEmpty = pastedSegments.findIndex((segment) => !segment)
    const focusIndex = firstEmpty >= 0 ? firstEmpty : segments.length - 1
    inputRefs.current[focusIndex]?.focus()
  }
```

각 세그먼트 `<input>`에 핸들러 연결(`onChange` 라인 바로 아래):

```tsx
              onChange={(event) => updateSegment(index, event.target.value)}
              onPaste={handleSegmentPaste}
```

`ClipboardEvent`를 import에 추가(파일 상단 3행):

```tsx
import { ClipboardEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test 2>&1 | grep -A2 "account number segments accept pasted"`
Expected: PASS.

- [ ] **Step 5: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add components/BankAccountFields.tsx test/account-paste-and-nickname.test.mjs
git commit -m "fix: allow pasting full account number into segmented field

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 닉네임 랜덤 추천

**Files:**
- Create: `lib/nicknames.ts`
- Modify: `components/auth/SignupForm.tsx` (import + `renderField`의 nickname 분기)
- Test: `test/account-paste-and-nickname.test.mjs` (Task 1에서 생성한 파일에 추가)

**Interfaces:**
- Produces: `generateRandomNickname(exclude?: string): string`, `NICKNAME_SAMPLES: string[]`.
- Consumes(SignupForm): `generateRandomNickname` → `handleInputChange('nickname', value)`.

- [ ] **Step 1: 실패 테스트 작성**

`test/account-paste-and-nickname.test.mjs`에 추가:

```js
test('nickname generator picks a fixed sample and appends digits within length limit', () => {
  const lib = readProjectFile('lib', 'nicknames.ts')
  assert.match(lib, /export const NICKNAME_SAMPLES/, 'should expose a fixed sample list')
  assert.match(lib, /가천대 존잘남/, 'should include the user-provided samples')
  assert.match(lib, /가천대 존예여신/, 'should include 가천대 존예여신 sample')
  assert.match(lib, /길여키즈/, 'should include 길여키즈 sample')
  assert.match(lib, /export function generateRandomNickname/, 'should expose a generator')
  assert.match(lib, /10 - base\.length/, 'digit count should be capped so result stays within 10 chars')

  const signup = readProjectFile('components', 'auth', 'SignupForm.tsx')
  assert.match(signup, /generateRandomNickname/, 'signup should use the generator')
  assert.match(signup, /랜덤 추천/, 'signup should render the random suggestion button')
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test 2>&1 | grep -A2 "nickname generator picks"`
Expected: FAIL (`lib/nicknames.ts` 없음).

- [ ] **Step 3: `lib/nicknames.ts` 작성**

```ts
export const NICKNAME_SAMPLES = [
  '가천대 존잘남',
  '가천대 존예여신',
  '길여키즈',
  '가천대 화석고인물',
  '가천대 카리나',
  '가천대 윈터',
  '가천대 장원영',
]

// 미리 정해둔 샘플에서 하나를 뽑아 뒤에 랜덤 숫자만 붙인다(AI 미사용).
// 닉네임 규칙(2–10자)을 지키도록 숫자 자릿수를 동적으로 제한한다.
export function generateRandomNickname(exclude?: string): string {
  const pick = () => {
    const base = NICKNAME_SAMPLES[Math.floor(Math.random() * NICKNAME_SAMPLES.length)]
    const maxDigits = Math.min(4, Math.max(1, 10 - base.length))
    const digitCount = 1 + Math.floor(Math.random() * maxDigits)
    const max = 10 ** digitCount - 1
    const suffix = Math.floor(Math.random() * (max + 1))
    return `${base}${suffix}`
  }

  let candidate = pick()
  for (let attempt = 0; attempt < 8 && candidate === exclude; attempt += 1) {
    candidate = pick()
  }
  return candidate
}
```

- [ ] **Step 4: SignupForm에 추천 버튼 추가**

import 추가(8행 근처, 기존 BankAccountFields import 아래):

```tsx
import { generateRandomNickname } from '@/lib/nicknames'
```

`renderField`에서 generic 반환 위에 nickname 전용 분기 추가(phone 분기 아래, `if (fieldId === 'phone')` 블록 다음):

```tsx
    if (fieldId === 'nickname') {
      return (
        <FormField key={fieldId} field={field} error={errors[fieldId]}>
          <InputField
            id={`signup-${fieldId}`}
            type={field.type}
            value={value}
            onChange={(nextValue) => handleInputChange(fieldId, nextValue)}
            onKeyDown={handleKeyDown}
            placeholder={field.placeholder}
            error={errors[fieldId]}
            autoComplete="off"
            enterKeyHint="done"
            maxLength={10}
          />
          <button
            type="button"
            onClick={() => handleInputChange('nickname', generateRandomNickname(formData.nickname))}
            className="mt-2 inline-flex items-center gap-1 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-sm font-bold text-primary-700 transition hover:bg-primary-100"
          >
            🎲 랜덤 추천
          </button>
        </FormField>
      )
    }
```

- [ ] **Step 5: 테스트 통과 + 타입체크**

Run: `npm test 2>&1 | grep -A2 "nickname generator picks"` → PASS
Run: `npx tsc --noEmit` → 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add lib/nicknames.ts components/auth/SignupForm.tsx test/account-paste-and-nickname.test.mjs
git commit -m "feat: add random nickname suggestion button to onboarding

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 온보딩 계좌 "나중에" 스킵

**Files:**
- Modify: `app/api/profile/complete/route.ts` (`validatePayload`, upsert)
- Modify: `components/auth/SignupForm.tsx` (스킵 버튼, `payoutSkipped` 상태, `handleSignup`, 리뷰 카피)
- Test: `test/payout-disclosure-and-skip.test.mjs` (신규)

**Interfaces:**
- Consumes: 기존 `isAccountNumberCompleteForBank`.
- Produces: 없음(폼/라우트 동작 변경).

- [ ] **Step 1: 실패 테스트 작성**

`test/payout-disclosure-and-skip.test.mjs` 생성:

```js
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const root = process.cwd()
const readProjectFile = (...parts) => readFileSync(join(root, ...parts), 'utf8')

test('onboarding lets users skip the payout account step', () => {
  const signup = readProjectFile('components', 'auth', 'SignupForm.tsx')
  const completeRoute = readProjectFile('app', 'api', 'profile', 'complete', 'route.ts')

  assert.match(signup, /나중에 입력할게요/, 'payout step should offer a skip action')
  assert.match(signup, /payoutSkipped/, 'signup should track the skipped state')

  assert.match(completeRoute, /hasAnyAccountField/, 'complete route should allow all-empty account fields')
  assert.match(completeRoute, /bank_name: bankName \|\| null/, 'skipped account should be stored as null')
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test 2>&1 | grep -A2 "onboarding lets users skip"`
Expected: FAIL.

- [ ] **Step 3: 서버 `complete` 라우트 완화**

`app/api/profile/complete/route.ts`의 `validatePayload`를 교체:

```ts
function validatePayload(payload: CompleteProfilePayload | null) {
  const name = cleanText(payload?.name)
  const phone = cleanText(payload?.phone)
  const nickname = cleanText(payload?.nickname)
  const bankName = cleanText(payload?.bank_name)
  const accountNumber = cleanText(payload?.account_number)
  const accountHolder = cleanText(payload?.account_holder)

  if (name.length < 2 || name.length > 100) return { error: '실명을 확인해주세요' }
  if (!PHONE_REGEX.test(phone)) return { error: '전화번호 형식을 확인해주세요' }
  if (nickname.length < 2 || nickname.length > 10) return { error: '닉네임은 2-10자로 입력해주세요' }

  const hasAnyAccountField = Boolean(bankName || accountNumber || accountHolder)
  if (hasAnyAccountField) {
    if (!bankName) return { error: '계좌은행명을 선택해주세요' }
    if (!isAccountNumberCompleteForBank(bankName, accountNumber)) return { error: '계좌번호 형식을 확인해주세요' }
    if (accountHolder.length < 2 || accountHolder.length > 100) return { error: '계좌주 이름을 확인해주세요' }
  }

  return {
    data: {
      name,
      phone,
      nickname,
      bankName,
      accountNumber,
      accountHolder,
    },
  }
}
```

private 프로필 upsert에서 빈 값을 `null`로 저장하도록 수정:

```ts
  const { error: privateProfileError } = await admin
    .from('user_private_profiles')
    .upsert({
      user_id: authUser.id,
      email,
      name: validated.data.name,
      phone: validated.data.phone,
      bank_name: validated.data.bankName || null,
      account_number: validated.data.accountNumber || null,
      account_holder: validated.data.accountHolder || null,
      onboarded_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
```

- [ ] **Step 4: SignupForm 스킵 상태/버튼 추가**

상태 추가(`hasAcceptedUsageRules` useState 아래):

```tsx
  const [payoutSkipped, setPayoutSkipped] = useState(false)
```

`handleInputChange`에서 사용자가 계좌 필드를 채우면 스킵 해제(기존 함수 끝 `}` 직전에 추가):

```tsx
    if (['bank_name', 'account_number', 'account_holder'].includes(fieldId) && value.trim()) {
      setPayoutSkipped(false)
    }
```

스킵 핸들러 추가(`handleNext` 아래):

```tsx
  const handleSkipPayout = () => {
    setPayoutSkipped(true)
    setFormData(prev => ({ ...prev, bank_name: '', account_number: '', account_holder: '' }))
    setErrors({})
    trackEvent('profile_setup_payout_skipped', {
      step_index: currentStep,
    })
    setCurrentStep(prev => prev + 1)
    scrollContentToTop()
  }
```

payout 섹션 본문 아래에 스킵 버튼 렌더. `<div className="mt-6 space-y-5">{currentSection.fields.map(renderField)}</div>` 바로 다음에 추가:

```tsx
          {currentSection.id === 'payout' && (
            <button
              type="button"
              onClick={handleSkipPayout}
              className="mt-4 w-full text-center text-sm font-semibold text-gray-500 underline underline-offset-2"
            >
              나중에 입력할게요
            </button>
          )}
```

- [ ] **Step 5: handleSignup이 빈 계좌도 허용하도록**

`handleSignup`의 fetch body를 안전한 trim으로 교체:

```tsx
        body: JSON.stringify({
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          nickname: formData.nickname.trim(),
          bank_name: (formData.bank_name ?? '').trim(),
          account_number: (formData.account_number ?? '').trim(),
          account_holder: (formData.account_holder ?? '').trim(),
        }),
```

- [ ] **Step 6: 리뷰 카피 — 스킵 시 "나중에 입력" 표시**

`getSectionSummary`의 `case 'payout'`를 교체:

```tsx
      case 'payout':
        return {
          title: '정산 계좌',
          value: formData.bank_name || '나중에 입력',
          detail: formData.bank_name
            ? (formattedAccountNumber ? `${formattedAccountNumber} · ${formData.account_holder || '예금주 미입력'}` : '계좌번호 미입력')
            : '설정에서 추가할 수 있어요',
        }
```

`ReviewPanel`의 정산 계좌 행 교체:

```tsx
        <ReviewRow
          label="정산 계좌"
          value={formData.bank_name ? `${formData.bank_name} ${formattedAccountNumber} ${formData.account_holder}` : '나중에 입력 (설정에서 추가 가능)'}
        />
```

- [ ] **Step 7: 테스트 통과 + 타입체크 + 전체 테스트**

Run: `npm test 2>&1 | grep -A2 "onboarding lets users skip"` → PASS
Run: `npx tsc --noEmit` → 에러 없음
Run: `npm test` → 전체 PASS(기존 테스트 회귀 없음)

- [ ] **Step 8: 커밋**

```bash
git add app/api/profile/complete/route.ts components/auth/SignupForm.tsx test/payout-disclosure-and-skip.test.mjs
git commit -m "feat: allow skipping payout account during onboarding

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: DB 마이그레이션 — `chat_rooms.payout_revealed_at`

**Files:**
- Modify: `supabase_schema.sql` (chat_rooms 정의, 51–62행)
- Migration: Supabase 프로젝트 `hggpwrtasyngpjcbwjzg`
- Test: `test/payout-disclosure-and-skip.test.mjs`

**Interfaces:**
- Produces: `chat_rooms.payout_revealed_at timestamptz null` 컬럼(이후 Task 5/6이 사용).

- [ ] **Step 1: 실패 테스트 작성**

`test/payout-disclosure-and-skip.test.mjs`에 추가:

```js
test('chat_rooms schema tracks payout disclosure timing', () => {
  const schema = readProjectFile('supabase_schema.sql')
  assert.match(schema, /payout_revealed_at/, 'chat_rooms should track when the payout account is disclosed')
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test 2>&1 | grep -A2 "chat_rooms schema tracks payout"`
Expected: FAIL.

- [ ] **Step 3: `supabase_schema.sql` 수정**

`chat_rooms` 정의의 `status` 줄 다음에 컬럼 추가:

```sql
  status varchar(20) default 'active' check (status in ('active', 'closed')),
  payout_revealed_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
```

- [ ] **Step 4: 원격 마이그레이션 적용**

Supabase MCP `apply_migration` 사용(프로젝트 `hggpwrtasyngpjcbwjzg`, name `add_chat_rooms_payout_revealed_at`):

```sql
alter table public.chat_rooms
  add column if not exists payout_revealed_at timestamp with time zone;
```

적용 후 `list_tables` 또는 `execute_sql`로 컬럼 존재 확인:

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'chat_rooms' and column_name = 'payout_revealed_at';
```
Expected: 1행 반환.

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test 2>&1 | grep -A2 "chat_rooms schema tracks payout"`
Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add supabase_schema.sql test/payout-disclosure-and-skip.test.mjs
git commit -m "feat: add payout_revealed_at column to chat_rooms

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: 서버 게이팅 + 공개 라우트

**Files:**
- Modify: `app/api/rooms/[id]/private/route.ts`
- Create: `app/api/rooms/[id]/reveal-payout/route.ts`
- Test: `test/payout-disclosure-and-skip.test.mjs`

**Interfaces:**
- Consumes: `chat_rooms.payout_revealed_at` (Task 4).
- Produces:
  - `GET /api/rooms/[id]/private` 응답에 `creatorHasPayoutAccount: boolean`, `payoutRevealed: boolean` 추가. `creatorPayoutAccount`는 `(isCreator || payoutRevealed) && bank_name`일 때만 non-null.
  - `POST /api/rooms/[id]/reveal-payout` → `{ ok: true, creatorPayoutAccount }` (방장 전용).

- [ ] **Step 1: 실패 테스트 작성**

`test/payout-disclosure-and-skip.test.mjs`에 추가:

```js
test('private route gates payout account behind disclosure', () => {
  const route = readProjectFile('app', 'api', 'rooms', '[id]', 'private', 'route.ts')
  assert.match(route, /payout_revealed_at/, 'private route should read disclosure timestamp')
  assert.match(route, /isCreator \|\| payoutRevealed/, 'account should only be sent to creator or after disclosure')
  assert.match(route, /creatorHasPayoutAccount/, 'route should report whether the host registered an account')
  assert.match(route, /payoutRevealed/, 'route should report disclosure state')
})

test('reveal-payout route lets only the host disclose', () => {
  const route = readProjectFile('app', 'api', 'rooms', '[id]', 'reveal-payout', 'route.ts')
  assert.match(route, /created_by !== authUser\.id/, 'only the room creator may reveal')
  assert.match(route, /계좌를 먼저 등록해주세요/, 'reveal requires a registered account')
  assert.match(route, /payout_revealed_at: new Date\(\)\.toISOString\(\)/, 'reveal sets the disclosure timestamp')
  assert.match(route, /export const POST/, 'reveal should be a POST route')
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test 2>&1 | grep -A2 "private route gates\|reveal-payout route lets"`
Expected: FAIL.

- [ ] **Step 3: `private/route.ts` 게이팅**

room select에 `payout_revealed_at` 추가:

```ts
  const { data: room, error: roomError } = await admin
    .from('chat_rooms')
    .select('id, created_by, status, payout_revealed_at')
    .eq('id', roomId)
    .maybeSingle()
```

응답 직전 블록(`const creatorPayout = payoutResult.data` 이후)을 교체:

```ts
  const creatorPayout = payoutResult.data
  const isCreator = authUser.id === room.created_by
  const payoutRevealed = Boolean(room.payout_revealed_at)
  const creatorHasPayoutAccount = Boolean(creatorPayout?.bank_name)

  return NextResponse.json({
    phonesByUserId,
    creatorPayoutAccount: (isCreator || payoutRevealed) && creatorHasPayoutAccount ? creatorPayout : null,
    creatorHasPayoutAccount,
    payoutRevealed,
  })
```

- [ ] **Step 4: `reveal-payout/route.ts` 생성**

```ts
import { NextResponse } from 'next/server'
import { withAxiomRoute } from '@/lib/axiom/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function revealPayout(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const roomId = params.id
  const supabase = createClient()
  const { data, error: authError } = await supabase.auth.getUser()
  const authUser = data.user

  if (authError || !authUser) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const admin = createAdminSupabase()
  const { data: room, error: roomError } = await admin
    .from('chat_rooms')
    .select('id, created_by, payout_revealed_at')
    .eq('id', roomId)
    .maybeSingle()

  if (roomError) {
    return NextResponse.json({ error: '채팅방 정보를 확인하지 못했습니다' }, { status: 500 })
  }

  if (!room) {
    return NextResponse.json({ error: '채팅방을 찾을 수 없습니다' }, { status: 404 })
  }

  if (room.created_by !== authUser.id) {
    return NextResponse.json({ error: '방장만 계좌를 공개할 수 있습니다' }, { status: 403 })
  }

  const { data: payout, error: payoutError } = await admin
    .from('user_private_profiles')
    .select('user_id, bank_name, account_number, account_holder, created_at, updated_at')
    .eq('user_id', authUser.id)
    .maybeSingle()

  if (payoutError) {
    return NextResponse.json({ error: '계좌 정보를 확인하지 못했습니다' }, { status: 500 })
  }

  if (!payout?.bank_name) {
    return NextResponse.json({ error: '계좌를 먼저 등록해주세요' }, { status: 400 })
  }

  if (!room.payout_revealed_at) {
    const { error: updateError } = await admin
      .from('chat_rooms')
      .update({ payout_revealed_at: new Date().toISOString() })
      .eq('id', roomId)
      .eq('created_by', authUser.id)

    if (updateError) {
      return NextResponse.json({ error: '계좌 공개 중 오류가 발생했습니다' }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true, creatorPayoutAccount: payout })
}

export const POST = withAxiomRoute(revealPayout)
```

- [ ] **Step 5: 테스트 통과 + 타입체크**

Run: `npm test 2>&1 | grep -A2 "private route gates\|reveal-payout route lets"` → PASS
Run: `npx tsc --noEmit` → 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add "app/api/rooms/[id]/private/route.ts" "app/api/rooms/[id]/reveal-payout/route.ts" test/payout-disclosure-and-skip.test.mjs
git commit -m "feat: gate creator payout account behind manual disclosure

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: 채팅방 UI — 3상태 슬롯 · 공개 버튼 · 인라인 계좌 입력

**Files:**
- Modify: `app/rooms/[id]/page.tsx` (import, `RoomPrivateInfoPayload`, 상태, `loadParticipants`, 핸들러, 슬롯 JSX 1377–1406, 인라인 모달)
- Test: `test/payout-disclosure-and-skip.test.mjs`

**Interfaces:**
- Consumes: `GET /private`(새 필드), `POST /reveal-payout`(Task 5), `PATCH /api/profile/payout`(기존), `BankSelectField`/`AccountNumberSegmentField`(기존), `isAccountNumberCompleteForBank`(기존), `broadcastRoomSync`(기존).
- Produces: 없음(페이지 내부).

- [ ] **Step 1: 실패 테스트 작성**

`test/payout-disclosure-and-skip.test.mjs`에 추가:

```js
test('chat room renders payout disclosure states and inline registration', () => {
  const source = readProjectFile('app', 'rooms', '[id]', 'page.tsx')
  assert.match(source, /reveal-payout/, 'host should call the reveal route')
  assert.match(source, /전체 공개/, 'host should see a disclose button')
  assert.match(source, /방장이 계좌를 아직 공개하지 않았어요/, 'guests should see a not-yet-disclosed message')
  assert.match(source, /방장이 아직 계좌를 등록하지 않았어요/, 'guests should see a not-registered message')
  assert.match(source, /계좌 등록하기/, 'host without an account should get an inline register button')
  assert.match(source, /payoutRevealed/, 'page should track disclosure state')
  assert.match(source, /creatorHasPayoutAccount/, 'page should track whether the host has an account')
  assert.match(source, /handleInlineAccountSave/, 'inline account form should save through the payout route')
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test 2>&1 | grep -A2 "chat room renders payout disclosure"`
Expected: FAIL.

- [ ] **Step 3: import 추가**

17행 banks import에 `isAccountNumberCompleteForBank` 추가하고, BankAccountFields import 추가:

```tsx
import { formatAccountNumberForBank, isAccountNumberCompleteForBank } from '@/lib/banks'
import { AccountNumberSegmentField, BankSelectField } from '@/components/BankAccountFields'
```

- [ ] **Step 4: 타입 + 상태 확장**

`RoomPrivateInfoPayload` 타입(28–32행)에 필드 추가:

```tsx
type RoomPrivateInfoPayload = {
  phonesByUserId?: Record<string, string | null>
  creatorPayoutAccount?: PayoutAccount | null
  creatorHasPayoutAccount?: boolean
  payoutRevealed?: boolean
  error?: string
}
```

`creatorPayoutAccount` useState(47행) 아래에 상태 추가:

```tsx
  const [creatorHasPayoutAccount, setCreatorHasPayoutAccount] = useState(false)
  const [payoutRevealed, setPayoutRevealed] = useState(false)
  const [isRevealingPayout, setIsRevealingPayout] = useState(false)
  const [showInlineAccountForm, setShowInlineAccountForm] = useState(false)
  const [inlineAccountForm, setInlineAccountForm] = useState({ bank_name: '', account_number: '', account_holder: '' })
  const [inlineAccountError, setInlineAccountError] = useState('')
  const [isSavingInlineAccount, setIsSavingInlineAccount] = useState(false)
```

- [ ] **Step 5: `loadParticipants`가 새 필드를 저장하도록**

`loadParticipants`의 private 응답 처리(569–573행)를 교체:

```tsx
        if (privateResponse.ok) {
          setCreatorPayoutAccount(privateResult?.creatorPayoutAccount ?? null)
          setCreatorHasPayoutAccount(Boolean(privateResult?.creatorHasPayoutAccount))
          setPayoutRevealed(Boolean(privateResult?.payoutRevealed))
        } else {
          setCreatorPayoutAccount(null)
          setCreatorHasPayoutAccount(false)
          setPayoutRevealed(false)
        }
```

- [ ] **Step 6: 공개/인라인 저장 핸들러 추가**

`copyCreatorPayoutAccount` useCallback(1232행 끝) 아래에 추가:

```tsx
  const handleRevealPayout = useCallback(async () => {
    setIsRevealingPayout(true)
    try {
      const response = await fetch(`/api/rooms/${roomId}/reveal-payout`, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(result?.error ?? '계좌 공개 중 오류가 발생했습니다')
      }
      setCreatorPayoutAccount(result?.creatorPayoutAccount ?? null)
      setCreatorHasPayoutAccount(true)
      setPayoutRevealed(true)
      trackEvent('payout_revealed', { room_id: roomId })
      await broadcastRoomSync('participants')
      toast.success('계좌를 전체 공개했어요')
    } catch (error) {
      console.error('Reveal payout error:', error)
      toast.error(error instanceof Error ? error.message : '계좌 공개 중 오류가 발생했습니다')
    } finally {
      setIsRevealingPayout(false)
    }
  }, [broadcastRoomSync, roomId])

  const handleInlineAccountSave = useCallback(async () => {
    const next = {
      bank_name: inlineAccountForm.bank_name.trim(),
      account_number: inlineAccountForm.account_number.trim(),
      account_holder: inlineAccountForm.account_holder.trim(),
    }
    if (!next.bank_name || !next.account_number || !next.account_holder) {
      setInlineAccountError('은행명, 계좌번호, 계좌주 이름을 모두 입력해주세요')
      return
    }
    if (!isAccountNumberCompleteForBank(next.bank_name, next.account_number)) {
      setInlineAccountError('선택한 은행의 계좌번호 형식에 맞게 입력해주세요')
      return
    }
    setIsSavingInlineAccount(true)
    setInlineAccountError('')
    try {
      const response = await fetch('/api/profile/payout', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(result?.error ?? '계좌 정보 저장 중 오류가 발생했습니다')
      }
      setCreatorPayoutAccount(result?.payoutAccount ?? null)
      setCreatorHasPayoutAccount(true)
      setShowInlineAccountForm(false)
      setInlineAccountForm({ bank_name: '', account_number: '', account_holder: '' })
      trackEvent('payout_account_updated', { bank_name: next.bank_name, source: 'chat_room' })
      await broadcastRoomSync('participants')
      toast.success('계좌를 등록했어요. ‘전체 공개’를 누르면 참여자에게 보여져요')
    } catch (error) {
      console.error('Inline payout save error:', error)
      setInlineAccountError(error instanceof Error ? error.message : '계좌 정보 저장 중 오류가 발생했습니다')
    } finally {
      setIsSavingInlineAccount(false)
    }
  }, [broadcastRoomSync, inlineAccountForm])
```

- [ ] **Step 7: 슬롯 JSX(1377–1406행) 교체**

```tsx
        {/* 방장 계좌 */}
        {isParticipant && (
          <div className="mt-2 rounded-xl border border-primary-100 bg-primary-50/90 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-primary-700">
                <CreditCard className="h-3.5 w-3.5" />
                <span>방장 계좌</span>
                {payoutRevealed && (
                  <span className="rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-bold text-primary-700">공개됨</span>
                )}
              </div>
              {isRoomCreator && creatorHasPayoutAccount && !payoutRevealed ? (
                <button
                  type="button"
                  onClick={handleRevealPayout}
                  disabled={isRevealingPayout}
                  className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-primary-600 px-2 text-[11px] font-black text-white shadow-sm transition hover:bg-primary-700 disabled:bg-primary-300"
                >
                  {isRevealingPayout ? '공개 중...' : '전체 공개'}
                </button>
              ) : creatorPayoutAccount && payoutRevealed ? (
                <button
                  type="button"
                  onClick={copyCreatorPayoutAccount}
                  className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-white px-2 text-[11px] font-black text-primary-700 shadow-sm ring-1 ring-primary-100 transition hover:bg-primary-50"
                >
                  <Copy className="h-3.5 w-3.5" />
                  복사
                </button>
              ) : null}
            </div>

            {isRoomCreator ? (
              creatorHasPayoutAccount ? (
                <>
                  <p className="chat-payout-account mt-1 truncate text-xs font-semibold text-gray-900">
                    {creatorPayoutAccount?.bank_name} {formattedCreatorAccountNumber} {creatorPayoutAccount?.account_holder}
                  </p>
                  {!payoutRevealed && (
                    <p className="mt-1 text-[11px] text-gray-500">
                      아직 참여자에게 공개되지 않았어요. ‘전체 공개’를 누르면 보여집니다.
                    </p>
                  )}
                </>
              ) : (
                <div className="mt-1">
                  <p className="text-xs text-gray-500">정산 계좌가 등록되지 않았어요.</p>
                  <button
                    type="button"
                    onClick={() => setShowInlineAccountForm(true)}
                    className="mt-1.5 inline-flex h-7 items-center rounded-md bg-primary-600 px-2.5 text-[11px] font-bold text-white transition hover:bg-primary-700"
                  >
                    계좌 등록하기
                  </button>
                </div>
              )
            ) : payoutRevealed && creatorPayoutAccount ? (
              <p className="chat-payout-account mt-1 truncate text-xs font-semibold text-gray-900">
                {creatorPayoutAccount.bank_name} {formattedCreatorAccountNumber} {creatorPayoutAccount.account_holder}
              </p>
            ) : creatorHasPayoutAccount ? (
              <p className="mt-1 text-xs text-gray-500">방장이 계좌를 아직 공개하지 않았어요.</p>
            ) : (
              <p className="mt-1 text-xs text-gray-500">방장이 아직 계좌를 등록하지 않았어요.</p>
            )}
          </div>
        )}
```

- [ ] **Step 8: 인라인 계좌 등록 바텀시트 추가**

`{/* 참여 확정 버튼 */}` 블록을 닫는 `</header>`(1420행) **다음 줄**에 모달 추가:

```tsx
      {showInlineAccountForm && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="계좌 등록 닫기"
            className="absolute inset-0 bg-black/30"
            onClick={() => setShowInlineAccountForm(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-2xl bg-white p-5"
          >
            <div className="mx-auto mb-4 h-1 w-11 rounded-full bg-gray-200" />
            <h2 className="text-lg font-extrabold text-gray-950">정산 계좌 등록</h2>
            <p className="mt-1 text-sm text-gray-500">등록 후 ‘전체 공개’를 눌러야 참여자에게 보여져요.</p>
            <div className="mt-4 space-y-3">
              <div>
                <p className="mb-1 text-sm font-semibold text-gray-900">은행</p>
                <BankSelectField
                  value={inlineAccountForm.bank_name}
                  onChange={(value) => {
                    setInlineAccountForm(prev => ({ ...prev, bank_name: value }))
                    setInlineAccountError('')
                  }}
                  presentation="sheet"
                  disabled={isSavingInlineAccount}
                />
              </div>
              <div>
                <p className="mb-1 text-sm font-semibold text-gray-900">계좌번호</p>
                <AccountNumberSegmentField
                  bankName={inlineAccountForm.bank_name}
                  value={inlineAccountForm.account_number}
                  onChange={(value) => {
                    setInlineAccountForm(prev => ({ ...prev, account_number: value }))
                    setInlineAccountError('')
                  }}
                  disabled={isSavingInlineAccount}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-900" htmlFor="inline-account-holder">예금주</label>
                <input
                  id="inline-account-holder"
                  type="text"
                  value={inlineAccountForm.account_holder}
                  onChange={(event) => {
                    setInlineAccountForm(prev => ({ ...prev, account_holder: event.target.value }))
                    setInlineAccountError('')
                  }}
                  className="input-field"
                  placeholder="예금주 이름"
                  disabled={isSavingInlineAccount}
                />
              </div>
              {inlineAccountError && (
                <p className="text-sm text-red-500">{inlineAccountError}</p>
              )}
              <button
                type="button"
                onClick={handleInlineAccountSave}
                disabled={isSavingInlineAccount}
                className="btn-primary w-full"
              >
                {isSavingInlineAccount ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 9: 테스트 통과 + 타입체크 + 전체 테스트 + 빌드**

Run: `npm test 2>&1 | grep -A2 "chat room renders payout disclosure"` → PASS
Run: `npx tsc --noEmit` → 에러 없음
Run: `npm test` → 전체 PASS
Run: `npm run build` → 성공

- [ ] **Step 10: 커밋**

```bash
git add "app/rooms/[id]/page.tsx" test/payout-disclosure-and-skip.test.mjs
git commit -m "feat: host-controlled payout disclosure with inline account entry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: 수동 통합 검증 (실데이터)

**Files:** 없음(런타임 확인). 메모리 [[verify-fixes-against-real-data]] 준수.

- [ ] **Step 1:** `npm run dev` 실행, 프리뷰 테스트 계정으로 로그인.
- [ ] **Step 2:** 온보딩에서 "🎲 랜덤 추천" 반복 클릭 → 2–10자 유효 닉네임, 직전과 다른 값 확인.
- [ ] **Step 3:** 온보딩 계좌 단계 "나중에 입력할게요" → 가입 완료 → 설정에서 `payoutAccount` null 확인(`/api/profile/me`).
- [ ] **Step 4:** 계좌 미등록 상태로 방 개설 → 상단 "계좌 등록하기" → 바텀시트에서 뱅킹 앱 계좌번호 **붙여넣기** 동작 확인 → 저장 → "등록·미공개" 상태 확인.
- [ ] **Step 5:** 두 번째 계정으로 같은 방 입장 → 공개 전 다른 참여자 화면/네트워크 응답에 계좌 **미포함** 확인.
- [ ] **Step 6:** 방장이 "전체 공개" → 두 번째 계정 화면이 (room-sync) 자동 갱신되어 계좌 노출 확인.
- [ ] **Step 7:** Supabase `chat_rooms.payout_revealed_at` 값이 채워졌는지 `execute_sql`로 확인.

검증 결과(통과/실패)를 사용자에게 그대로 보고.

---

## Self-Review (작성자 점검 완료)

- **Spec coverage:** §1 공개제어→T4/T5/T6, §2 나중에→T3, 인라인 입력→T6, §3 붙여넣기→T1, §4 닉네임→T2. 전 항목 매핑됨.
- **Placeholder scan:** TBD/TODO/"적절히 처리" 없음. 모든 코드 단계에 실제 코드 포함.
- **Type consistency:** `creatorHasPayoutAccount`/`payoutRevealed`가 라우트 응답(T5)·타입(T6)·상태(T6)에서 동일 명명. `generateRandomNickname(exclude?)` 시그니처 T2 일관. `handleInlineAccountSave`/`handleRevealPayout` 명명 슬롯 JSX와 일치.
- **기존 테스트 회귀:** `chat-room-layout.test.mjs`의 `방장 계좌`·`account_number`·`formatAccountNumberForBank`·`chat-payout-account`·`계좌 정보를 복사했습니다` 단언은 본 변경에서 모두 보존됨. 온보딩 카피(`방을 개설하면…`, `정산 계좌는 방을 개설한 경우…`)는 변경하지 않아 `payout-account-and-phone-verification.test.mjs` 회귀 없음.
