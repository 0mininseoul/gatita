# 기숙사 동행 요청 배너 자격 수정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기숙사생으로 명시 설정된 사용자에게만 동행 요청 배너를 표시하고 제2기숙사 출발 문구를 `혹시 역으로 가시나요?`로 바꾼다.

**Architecture:** 기존 `/api/profile/me` 응답에 포함된 비공개 기숙사생 여부를 `HomeClient`에서 boolean으로 축약해 지도에 전달한다. 순수 헬퍼가 사용자 자격과 기존 방 재고 조건을 결합하고 출발지별 제목을 반환하므로, 렌더링과 분석 이벤트가 같은 판정을 공유한다. 데이터베이스와 API 스키마는 변경하지 않는다.

**Tech Stack:** Next.js 14, React, TypeScript, Supabase Auth/Profile API, Node test runner

---

### Task 1: 배너 자격과 출발지별 문구를 테스트로 고정

**Files:**
- Modify: `test/dormitory-ride-request.test.mjs`
- Modify: `lib/dormitoryRideRequest.ts`
- Modify: `components/CampusRouteMap.tsx`
- Modify: `components/HomeClient.tsx`

- [x] **Step 1: 실패하는 순수 동작 테스트 작성**

`test/dormitory-ride-request.test.mjs`에서 `loadDormitoryExports()`로 아래 헬퍼를 불러와 자격과 문구를 검증한다.

```js
test('dormitory request banner requires an explicitly resident user', () => {
  const { shouldShowDormitoryRequestBanner } = loadDormitoryExports()
  const available = { showBanner: true }

  assert.equal(shouldShowDormitoryRequestBanner(true, available), true)
  assert.equal(shouldShowDormitoryRequestBanner(false, available), false)
  assert.equal(shouldShowDormitoryRequestBanner(null, available), false)
  assert.equal(shouldShowDormitoryRequestBanner(undefined, available), false)
  assert.equal(shouldShowDormitoryRequestBanner(true, { showBanner: false }), false)
})

test('dormitory request banner copy follows the travel direction', () => {
  const { getDormitoryRequestBannerTitle } = loadDormitoryExports()

  assert.equal(getDormitoryRequestBannerTitle('가천대역_1번출구'), '혹시 기숙사 가시나요?')
  assert.equal(getDormitoryRequestBannerTitle('가천대학교_정문'), '혹시 기숙사 가시나요?')
  assert.equal(getDormitoryRequestBannerTitle('제2기숙사'), '혹시 역으로 가시나요?')
})
```

기존 지도 계약 테스트에는 프로필 값 전달과 단일 노출 판정을 확인하는 정적 검증을 추가한다.

```js
assert.match(home, /isDormitoryResident=\{user\?\.is_dormitory_resident === true\}/)
assert.match(map, /shouldShowDormitoryRequestBanner\(isDormitoryResident, dormitoryRequestAvailability\)/)
```

- [x] **Step 2: 테스트가 요구사항 누락으로 실패하는지 확인**

Run:

```bash
node --test test/dormitory-ride-request.test.mjs
```

Expected: `shouldShowDormitoryRequestBanner` 또는 `getDormitoryRequestBannerTitle`이 존재하지 않아 새 테스트가 실패한다.

- [x] **Step 3: 최소 순수 헬퍼 구현**

`lib/dormitoryRideRequest.ts`에 다음 함수를 추가한다.

```ts
export function shouldShowDormitoryRequestBanner(
  isDormitoryResident: boolean | null | undefined,
  availability: Pick<DormitoryRequestAvailability, 'showBanner'>,
) {
  return isDormitoryResident === true && availability.showBanner
}

export function getDormitoryRequestBannerTitle(fromLocation: LocationType) {
  return fromLocation === '제2기숙사'
    ? '혹시 역으로 가시나요?'
    : '혹시 기숙사 가시나요?'
}
```

- [x] **Step 4: 지도에 자격 값을 전달하고 하나의 판정을 공유**

`components/CampusRouteMap.tsx`의 props에 `isDormitoryResident?: boolean`을 추가하고 기본값을 `false`로 둔다. 기존 availability 계산 직후 다음 값을 만든다.

```ts
const showDormitoryRequestBanner = shouldShowDormitoryRequestBanner(
  isDormitoryResident,
  dormitoryRequestAvailability,
)
```

배너 노출 effect와 JSX 렌더 조건은 모두 `showDormitoryRequestBanner`를 사용한다. 제목은 다음처럼 렌더한다.

```tsx
<span className="block text-sm font-black text-gray-950">
  {getDormitoryRequestBannerTitle(selectedFrom)}
</span>
```

`components/HomeClient.tsx`는 비공개 값을 정확한 boolean으로 축약해 전달한다.

```tsx
isDormitoryResident={user?.is_dormitory_resident === true}
```

- [x] **Step 5: 집중 테스트를 다시 실행해 통과 확인**

Run:

```bash
node --test test/dormitory-ride-request.test.mjs
```

Expected: 모든 기숙사 동행 요청 테스트가 통과한다.

- [x] **Step 6: 변경 커밋**

```bash
git add lib/dormitoryRideRequest.ts components/CampusRouteMap.tsx components/HomeClient.tsx test/dormitory-ride-request.test.mjs
git commit -m "fix: restrict dormitory request banner to residents"
```

### Task 2: 전체 검증과 프로덕션 반영

**Files:**
- Modify: `docs/superpowers/plans/2026-09-04-dormitory-banner-eligibility.md`

- [ ] **Step 1: 전체 자동 검증 실행**

Run:

```bash
npm test
npm run lint
npx tsc --noEmit
set -a
source ../gatita/.env.local
set +a
npm run build
git diff --check
```

Expected: 테스트 실패 0건, ESLint와 TypeScript 오류 0건, Next.js 프로덕션 빌드 성공, 공백 오류 없음.

- [ ] **Step 2: 변경 범위와 보안 경계 검토**

`git diff origin/main...HEAD`로 기숙사생 여부가 분석 이벤트 payload나 공개 프로필에 새로 노출되지 않았는지 확인한다. 이번 변경은 기존 `/api/profile/me` 응답을 사용하므로 Supabase 마이그레이션이 없어야 한다. 2026-09-04 Supabase changelog에는 이 프로필 읽기 경로에 영향을 주는 관련 breaking change가 없음을 기록한다.

- [ ] **Step 3: 브랜치 푸시와 PR 리뷰**

```bash
git push -u origin 0mininseoul/dormitory-banner-residents-only
gh pr create --base main --head 0mininseoul/dormitory-banner-residents-only --title "fix: restrict dormitory request banner to residents"
gh pr checks --watch
```

Expected: 독립 리뷰의 actionable finding이 없고 모든 필수 체크가 성공한다. 발견된 문제는 집중 회귀 테스트를 먼저 추가한 뒤 수정한다.

- [ ] **Step 4: 머지 및 프로덕션 확인**

```bash
gh pr merge --squash
```

Expected: PR이 `MERGED` 상태이고 머지 커밋의 Vercel 상태가 `success`다. 프로덕션 `/sw.js`와 `/`가 HTTP 200을 반환하며, 인증된 모바일 QA에서 비기숙사생은 배너를 보지 않고 기숙사생은 제2기숙사에서 `혹시 역으로 가시나요?`를 본다.
