# 접속 인원 보정 시간표 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지도 접속 인원의 무작위 보정값을 KST 기준 심야·평일 일과·기타 구간으로 나눈다.

**Architecture:** React 훅에서 시간 판정과 무작위 범위 생성을 분리한 `lib/presenceDisplay.ts`를 추가한다. `usePresenceDisplayCount`는 마운트 시 보정값을 생성하고 다음 KST 범위 변경 경계에서만 갱신하며, 기존 Supabase Presence 실제 인원 수집은 그대로 유지한다.

**Tech Stack:** React, TypeScript, Supabase Presence, Node test runner

---

### Task 1: KST 보정 범위 헬퍼 구현

**Files:**
- Create: `lib/presenceDisplay.ts`
- Modify: `test/location-points.test.mjs`

- [x] **Step 1: TypeScript 헬퍼 로더와 실패하는 경계 테스트 작성**

`test/location-points.test.mjs`에 다음 로더와 테스트를 추가한다.

```js
function loadPresenceDisplayExports() {
  const source = readProjectFile('lib/presenceDisplay.ts')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  })
  const module = { exports: {} }
  new Function('module', 'exports', outputText)(module, module.exports)
  return module.exports
}

test('presence offset ranges follow KST weekday and weekend boundaries', () => {
  const { getPresenceOffsetRange } = loadPresenceDisplayExports()

  assert.deepEqual(getPresenceOffsetRange(new Date('2026-09-07T07:59:00+09:00')), { min: 0, max: 0 })
  assert.deepEqual(getPresenceOffsetRange(new Date('2026-09-07T08:00:00+09:00')), { min: 0, max: 3 })
  assert.deepEqual(getPresenceOffsetRange(new Date('2026-09-07T09:00:00+09:00')), { min: 1, max: 5 })
  assert.deepEqual(getPresenceOffsetRange(new Date('2026-09-07T17:59:00+09:00')), { min: 1, max: 5 })
  assert.deepEqual(getPresenceOffsetRange(new Date('2026-09-07T18:00:00+09:00')), { min: 0, max: 3 })
  assert.deepEqual(getPresenceOffsetRange(new Date('2026-09-05T07:59:00+09:00')), { min: 0, max: 0 })
  assert.deepEqual(getPresenceOffsetRange(new Date('2026-09-05T08:00:00+09:00')), { min: 0, max: 3 })
  assert.deepEqual(getPresenceOffsetRange(new Date('2026-09-05T12:00:00+09:00')), { min: 0, max: 3 })
})

test('presence offset generation includes each scheduled minimum and maximum', () => {
  const { getRandomPresenceOffset } = loadPresenceDisplayExports()
  const weekday = new Date('2026-09-07T12:00:00+09:00')
  const weekend = new Date('2026-09-05T12:00:00+09:00')
  const overnight = new Date('2026-09-07T00:00:00+09:00')

  assert.equal(getRandomPresenceOffset(weekday, () => 0), 1)
  assert.equal(getRandomPresenceOffset(weekday, () => 0.999999), 5)
  assert.equal(getRandomPresenceOffset(weekend, () => 0), 0)
  assert.equal(getRandomPresenceOffset(weekend, () => 0.999999), 3)
  assert.equal(getRandomPresenceOffset(overnight, () => 0.999999), 0)
})

test('presence offset reschedules only at the next KST range boundary', () => {
  const { getMillisecondsUntilNextPresenceOffsetChange } = loadPresenceDisplayExports()

  assert.equal(getMillisecondsUntilNextPresenceOffsetChange(
    new Date('2026-09-07T07:59:00+09:00'),
  ), 60 * 1000)
  assert.equal(getMillisecondsUntilNextPresenceOffsetChange(
    new Date('2026-09-07T08:00:00+09:00'),
  ), 60 * 60 * 1000)
  assert.equal(getMillisecondsUntilNextPresenceOffsetChange(
    new Date('2026-09-07T09:00:00+09:00'),
  ), 9 * 60 * 60 * 1000)
  assert.equal(getMillisecondsUntilNextPresenceOffsetChange(
    new Date('2026-09-07T18:00:00+09:00'),
  ), 6 * 60 * 60 * 1000)
  assert.equal(getMillisecondsUntilNextPresenceOffsetChange(
    new Date('2026-09-05T08:00:00+09:00'),
  ), 16 * 60 * 60 * 1000)
})
```

- [x] **Step 2: 새 헬퍼가 없어 테스트가 실패하는지 확인**

Run:

```bash
node --test test/location-points.test.mjs
```

Expected: `lib/presenceDisplay.ts`가 없어 신규 테스트가 실패한다.

- [x] **Step 3: KST 범위와 무작위 정수 헬퍼 구현**

`lib/presenceDisplay.ts`를 다음과 같이 생성한다.

```ts
export type PresenceOffsetRange = {
  min: number
  max: number
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

export function getPresenceOffsetRange(now = new Date()): PresenceOffsetRange {
  const kst = new Date(now.getTime() + KST_OFFSET_MS)
  const day = kst.getUTCDay()
  const hour = kst.getUTCHours()

  if (hour < 8) return { min: 0, max: 0 }

  const isWeekday = day >= 1 && day <= 5
  if (isWeekday && hour >= 9 && hour < 18) {
    return { min: 1, max: 5 }
  }

  return { min: 0, max: 3 }
}

export function getRandomPresenceOffset(
  now = new Date(),
  random: () => number = Math.random,
) {
  const { min, max } = getPresenceOffsetRange(now)
  return min + Math.floor(random() * (max - min + 1))
}

export function getMillisecondsUntilNextPresenceOffsetChange(now = new Date()) {
  const kst = new Date(now.getTime() + KST_OFFSET_MS)
  const nextBoundary = new Date(kst.getTime())
  const day = kst.getUTCDay()
  const hour = kst.getUTCHours()
  const isWeekday = day >= 1 && day <= 5

  if (hour < 8) {
    nextBoundary.setUTCHours(8, 0, 0, 0)
  } else if (isWeekday && hour < 9) {
    nextBoundary.setUTCHours(9, 0, 0, 0)
  } else if (isWeekday && hour < 18) {
    nextBoundary.setUTCHours(18, 0, 0, 0)
  } else {
    nextBoundary.setUTCDate(nextBoundary.getUTCDate() + 1)
    nextBoundary.setUTCHours(0, 0, 0, 0)
  }

  return nextBoundary.getTime() - kst.getTime()
}
```

- [x] **Step 4: 순수 헬퍼 테스트 통과 확인**

Run:

```bash
node --test test/location-points.test.mjs
```

Expected: 추가한 시간대·무작위 범위 테스트가 통과한다.

### Task 2: Presence 훅을 새 시간표에 연결

**Files:**
- Modify: `lib/usePresenceDisplayCount.ts`
- Modify: `test/location-points.test.mjs`

- [x] **Step 1: 훅 연결 계약을 테스트에 추가**

기존 접속 인원 테스트를 다음으로 교체한다.

```js
test('map presence display keeps one offset within each scheduled KST window', () => {
  const source = readProjectFile('lib/usePresenceDisplayCount.ts')

  assert.match(source, /getMillisecondsUntilNextPresenceOffsetChange/)
  assert.match(source, /getRandomPresenceOffset/)
  assert.match(source, /useState\(\(\) => getRandomPresenceOffset\(\)\)/)
  assert.doesNotMatch(source, /Math\.random/)
  assert.match(source, /window\.setTimeout\(/)
  assert.doesNotMatch(source, /window\.setInterval/)
  assert.match(source, /return peerCount \+ 1 \+ displayOffset/)
})
```

- [x] **Step 2: 기존 훅이 새 계약을 만족하지 못해 실패하는지 확인**

Run:

```bash
node --test test/location-points.test.mjs
```

Expected: 훅이 여전히 로컬 함수와 20초 주기 재생성을 사용해 테스트가 실패한다.

- [x] **Step 3: 훅에서 새 헬퍼로 보정값을 구간별로 생성**

`lib/usePresenceDisplayCount.ts`에 `getRandomPresenceOffset`과 `getMillisecondsUntilNextPresenceOffsetChange`를 import하고 로컬 헬퍼, `isRealCountWindow`, 20초 주기 갱신을 제거한다. 상태를 마운트 시 초기화한 뒤 `window.setTimeout`으로 다음 범위 변경 경계에서만 새 값을 생성한다.

```ts
const [displayOffset, setDisplayOffset] = useState(() => getRandomPresenceOffset())
```

- [x] **Step 4: 집중 테스트와 정적 검사 통과 확인**

Run:

```bash
node --test test/location-points.test.mjs
npm run lint
npx tsc --noEmit
```

Expected: 접속 인원 테스트, ESLint, TypeScript 검사가 모두 통과한다.

- [x] **Step 5: 접속 인원 변경 커밋**

```bash
git add lib/presenceDisplay.ts lib/usePresenceDisplayCount.ts test/location-points.test.mjs
git commit -m "fix: schedule map presence padding by KST"
```

### Task 3: 전체 검증과 프로덕션 반영

**Files:**
- Modify: `docs/superpowers/plans/2026-09-04-settings-copy-simplification.md`
- Modify: `docs/superpowers/plans/2026-09-04-presence-padding-schedule.md`

- [x] **Step 1: 전체 자동 검증 실행**

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

Expected: 전체 테스트 실패 0건, ESLint·TypeScript 오류 0건, Next.js 프로덕션 빌드 성공, 공백 오류 0건.

- [x] **Step 2: 변경 범위 리뷰**

Run:

```bash
git diff origin/main...HEAD -- app/settings/page.tsx lib/presenceDisplay.ts lib/usePresenceDisplayCount.ts test/account-and-legal.test.mjs test/location-points.test.mjs
git diff --name-only origin/main...HEAD -- supabase supabase_schema.sql
```

Expected: 설정 JSX·Presence 헬퍼·관련 테스트만 기능적으로 변경되고 Supabase 스키마/마이그레이션 변경은 없다.

- [ ] **Step 3: 브랜치 푸시와 PR 검증**

```bash
git push -u origin 0mininseoul/settings-copy-presence-schedule
gh pr create --base main --head 0mininseoul/settings-copy-presence-schedule --title "fix: simplify settings and schedule presence padding"
gh pr checks --watch
```

Expected: Vercel 프리뷰가 성공하고 PR이 충돌 없이 머지 가능하며 actionable review finding이 없다.

- [ ] **Step 4: PR 머지와 프로덕션 스모크 검증**

```bash
gh pr merge --squash
curl -fsS -o /dev/null https://gatita.kro.kr/
curl -fsS -o /dev/null https://gatita.kro.kr/sw.js
```

Expected: PR이 `MERGED`, 머지 커밋의 Vercel 상태가 `success`, 운영 홈과 서비스워커가 HTTP 200을 반환한다.
