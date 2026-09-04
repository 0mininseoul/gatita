# 설정 화면 문구 간소화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기숙사생 선택과 푸시 알림 설정에서 불필요한 보조 문구를 제거하고 핵심 조작만 남긴다.

**Architecture:** 기존 `app/settings/page.tsx`의 저장·권한·분석 핸들러는 유지하고 JSX 문구 계층만 축소한다. 푸시 지원 여부와 관계없이 같은 한 줄 레이블과 토글을 렌더하고, 사용할 수 없는 경우에만 토글을 비활성화한다.

**Tech Stack:** Next.js 14, React, TypeScript, Node test runner

---

### Task 1: 설정 문구 계약을 테스트로 고정하고 JSX를 간소화

**Files:**
- Modify: `test/account-and-legal.test.mjs`
- Modify: `app/settings/page.tsx`

- [ ] **Step 1: 실패하는 문구·동작 계약 테스트 작성**

`test/account-and-legal.test.mjs`에 다음 테스트를 추가한다.

```js
test('settings keeps only the requested dormitory and push notification copy', () => {
  const source = readProjectFile('app/settings/page.tsx')

  assert.match(source, /기숙사생이신가요\?/)
  assert.match(source, /같이타에 가입한 다른 기숙사생들과 동행 요청을 주고 받을 수 있어요/)
  assert.doesNotMatch(source, /‘네’를 선택하면 기숙사 동행 요청 푸시 수신에도 동의/)
  assert.match(source, /푸시 알림 \(채팅, 경로 알림 등\)/)
  assert.doesNotMatch(source, /채팅 새 메시지 알림/)
  assert.doesNotMatch(source, /참여 중인 채팅방에 새 메시지가 오면/)
  assert.doesNotMatch(source, /기기 설정에서 이 사이트의 알림이 차단/)
  assert.doesNotMatch(source, /홈 화면에 추가하면 채팅 새 메시지 알림/)
  assert.match(source, /aria-label="푸시 알림 \(채팅, 경로 알림 등\)"/)
  assert.match(source, /onClick=\{handleTogglePush\}/)
  assert.match(source, /disabled=\{!pushSupported \|\| pushBusy \|\| pushPermission === 'denied'\}/)
})
```

- [ ] **Step 2: 집중 테스트가 현재 문구 차이로 실패하는지 확인**

Run:

```bash
node --test test/account-and-legal.test.mjs
```

Expected: 새 푸시 문구가 없고 제거 대상 문구가 남아 있어 신규 테스트가 실패한다.

- [ ] **Step 3: 기숙사 버튼 아래 안내 문구 제거**

`app/settings/page.tsx`에서 다음 블록을 제거한다.

```tsx
<p className="mt-2 text-[0.72rem] font-semibold leading-4 text-gray-500">
  ‘네’를 선택하면 기숙사 동행 요청 푸시 수신에도 동의하게 됩니다. 언제든 다시 변경할 수 있어요.
</p>
```

- [ ] **Step 4: 알림 행을 한 줄 문구와 토글로 통합**

`Bell`, `isInstalled`, `pushInstalled` 상태와 기존 `pushSupported` 분기를 제거하고 알림 섹션 본문을 다음으로 바꾼다.

```tsx
<div className="settings-row settings-row-standalone">
  <p className="settings-row-label">푸시 알림 (채팅, 경로 알림 등)</p>
  <button
    type="button"
    role="switch"
    aria-checked={pushSubscribed}
    aria-label="푸시 알림 (채팅, 경로 알림 등)"
    onClick={handleTogglePush}
    disabled={!pushSupported || pushBusy || pushPermission === 'denied'}
    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
      pushSubscribed ? 'bg-primary-600' : 'bg-gray-300'
    }`}
  >
    <span
      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
        pushSubscribed ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
</div>
```

- [ ] **Step 5: 집중 테스트와 정적 검사 통과 확인**

Run:

```bash
node --test test/account-and-legal.test.mjs
npm run lint
npx tsc --noEmit
```

Expected: 설정 테스트, ESLint, TypeScript 검사가 모두 통과한다.

- [ ] **Step 6: 설정 문구 변경 커밋**

```bash
git add app/settings/page.tsx test/account-and-legal.test.mjs
git commit -m "fix: simplify settings copy"
```
