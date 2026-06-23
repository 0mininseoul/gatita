# 방장 계좌 공개 제어 · 온보딩 계좌 "나중에" · 붙여넣기 · 닉네임 추천 — 설계

작성일: 2026-06-23

## 배경 / 문제

같이타(가천대 통학 동행)에서 방장이 방을 개설하면 채팅방 상단 "방장 계좌" 박스에
계좌번호가 **즉시** 모든 참여자에게 노출된다. 방장 입장에서 다음 우려가 있다.

1. 택시가 안 잡혀 아무도 안 탔는데 계좌가 노출됨.
2. 현장에 오지 않은 멤버가 계좌만 탈취해 갈 수 있음.

또한 온보딩(프로필 세팅)에서 계좌번호 입력이 병목이다. 계좌번호를 외우지 못해
앱을 나가 뱅킹 앱에서 복사해 와야 하는데, (a) 중간에 건너뛸 수단이 없고,
(b) 계좌번호 입력 칸에 **붙여넣기가 안 된다**. 추가로 닉네임도 즉석에서 떠올리기
어렵다는 피드백이 있다.

## 목표

1. **방장 계좌 공개 시점을 방장이 직접 제어**한다. 방 개설 즉시 노출하지 않고,
   방장이 "전체 공개"를 누른 시점부터만 다른 참여자에게 노출된다. (수동 공개 전용,
   자동 공개 없음.)
2. 온보딩 계좌 단계에서 **"나중에"** 로 건너뛸 수 있다. 건너뛴 방장이 방을 열면
   상단 슬롯에서 **방 안에서 바로** 계좌를 입력할 수 있다. 설정에서도 입력 가능(기존 지원).
3. 계좌번호 입력 칸에 **붙여넣기**가 동작한다(온보딩·설정 공통).
4. 온보딩 닉네임 단계에 **랜덤 추천 버튼**(AI 미사용)을 추가한다.

비목표: 공개 되돌리기(un-reveal), 정산 금액/송금 기능, 계좌 검증 외부 연동.

---

## 1. 방장 계좌 공개 시점 제어

### 데이터 모델
- `chat_rooms`에 컬럼 추가: `payout_revealed_at timestamptz`(기본 `null`).
  - `null` = 미공개, 값 존재 = 그 시각에 공개됨.
- Supabase 마이그레이션으로 적용(프로젝트 `hggpwrtasyngpjcbwjzg`) + `supabase_schema.sql` 동기화.
- 기존 방들은 `payout_revealed_at = null`이 되어 **새 모델을 따른다**(방장이 다시
  "전체 공개"를 눌러야 노출). 진행 중인 단기 방에 한해 일시적 동작 변화이며 의도된 결과.

### 서버 게이팅 — `GET /api/rooms/[id]/private`
계좌가 미공개 상태에서 다른 참여자의 클라이언트로 새어나가지 않도록 **서버에서 차단**한다.
- `isCreator = authUser.id === room.created_by` 계산.
- `room.payout_revealed_at` 조회 → `payoutRevealed = payout_revealed_at != null`.
- `creatorPayoutAccount`는 **(`isCreator`) 또는 (`payoutRevealed`)** 이고 방장이 계좌를
  보유(`bank_name` 존재)할 때만 내려보낸다. 그 외에는 `null`.
- `creatorHasPayoutAccount: boolean` 추가 — 다른 참여자가 "미등록"과 "등록·미공개"를
  구분하되 계좌 값 자체는 받지 않게 한다(방장 `bank_name` 존재 여부에서 파생).
- 응답에 `payoutRevealed: boolean` 추가.

### 공개 라우트 — `POST /api/rooms/[id]/reveal-payout` (신규)
- 방장(`created_by`)만 호출 가능. 그 외 403.
- 방장이 계좌를 보유(`bank_name` 존재)할 때만 공개 가능. 미보유 시 400("계좌를 먼저 등록해주세요").
- `payout_revealed_at`이 이미 있으면 그대로 ok(멱등).
- admin 클라이언트로 `payout_revealed_at = now()` 설정(기존 room 라우트 패턴과 동일).
- 응답: `{ ok: true, creatorPayoutAccount }`.

### 전파
`chat_rooms`는 realtime publication에 없다(현재 `messages`, `room_participants`만).
별도 추가 없이 **기존 `room-sync` broadcast 채널 재사용**:
- private fetch(`GET /api/rooms/[id]/private`)는 이미 `loadParticipants` 안에 있고,
  `handleParticipantsRefresh`가 `loadParticipants`를 호출한다. 즉 `room-sync` 수신 시
  private 정보가 이미 다시 로드된다. (별도 `loadPrivateInfo` 추출 불필요.)
- `loadParticipants`가 응답의 새 필드(`payoutRevealed`, `creatorHasPayoutAccount`)도
  상태로 저장하도록 확장한다.
- 방장이 공개(또는 인라인 계좌 등록)하면 `broadcastRoomSync('participants')` 송신 →
  다른 클라이언트가 `loadParticipants`를 재실행해 공개된 계좌/상태를 받는다.

### 상단 "방장 계좌" 박스 상태 (`app/rooms/[id]/page.tsx`)
`isParticipant`일 때 렌더(현행과 동일). 상태 분기:

| 상태 | 방장 본인(`isRoomCreator`) | 다른 참여자 |
|---|---|---|
| 계좌 미등록 (`!creatorHasPayoutAccount`) | "계좌 등록하기" 버튼 → 인라인 입력 바텀시트(§2) | "방장이 아직 계좌를 등록하지 않았어요" |
| 등록·미공개 (`creatorHasPayoutAccount && !payoutRevealed`) | 본인 계좌 표시 + "전체 공개" 버튼 | "방장이 계좌를 아직 공개하지 않았어요" |
| 공개됨 (`payoutRevealed`) | 계좌 + 복사 + "공개됨" 표시(공개 버튼 없음) | 계좌 + 복사 (현행 동작) |

- "전체 공개" 클릭 → `POST /reveal-payout` → 성공 시 로컬 상태 갱신 + `broadcastRoomSync()` + 토스트.
- 공개는 단방향(되돌리기 버튼 없음).
- analytics 이벤트: `payout_revealed`(방장), 기존 `payout_account_copied` 유지.

---

## 2. 온보딩 "나중에" + 방 안 인라인 입력

### 온보딩 — `components/auth/SignupForm.tsx`
- `payout` 섹션(은행/계좌번호/예금주)에 보조 액션 **"나중에 입력할게요"** 추가
  (필드 아래 텍스트 버튼).
- 누르면: `bank_name` / `account_number` / `account_holder`를 비우고 `payoutSkipped=true`로
  표시한 뒤 다음 단계로 진행(`validateCurrentSection` 우회). 사용자가 되돌아가 채우면 해제.
- `canContinue`: payout 단계에서 스킵 버튼은 항상 활성. "다음"(전체 입력)과 별개 경로.
- 리뷰 화면: 스킵 시 "정산 계좌: 나중에 입력 (설정에서 추가 가능)"로 표시
  (`getSectionSummary('payout')`, `ReviewPanel`/`ReviewRow`).
- analytics: `profile_setup_payout_skipped`.

### 서버 — `POST /api/profile/complete`
- 계좌 3필드를 **선택값**으로 완화.
  - 셋 다 비어 있으면 통과(스킵) → `bank_name/account_number/account_holder`는 `null` 저장.
  - 하나라도 채워져 있으면 **전부** 유효성 검사(반쪽 계좌 저장 방지):
    `bank_name` 필수, `isAccountNumberCompleteForBank`, `account_holder` 2–100자.
- `onboarded_at`은 항상 설정 → 온보딩 완료 판정(`onboarded_at IS NOT NULL`)에 영향 없음.

### 방 안 인라인 계좌 입력 (계좌 미등록 방장)
- 상단 슬롯 "계좌 등록하기" → 바텀시트(또는 모달) 폼:
  `BankSelectField`(presentation="sheet") + `AccountNumberSegmentField` + 예금주 input.
- 저장 → 기존 `PATCH /api/profile/payout` 호출(유효성/저장 재사용).
- 저장 성공 → `loadPrivateInfo()` 재호출(방장은 `isCreator`라 본인 계좌를 돌려받음) →
  상태가 "등록·미공개"(H2)가 되어 방장이 이어서 "전체 공개"를 누른다.
  (저장과 공개를 한 번에 합치는 변형은 추후 옵션. 기본은 분리.)
- 설정 페이지의 계좌 입력은 이미 지원되므로 추가 작업 없음.

---

## 3. 계좌번호 붙여넣기 — `components/BankAccountFields.tsx`

### 원인
`AccountNumberSegmentField`의 각 세그먼트 input에 `maxLength={length}`가 걸려 있어,
브라우저가 붙여넣기 텍스트를 **한 세그먼트 길이로 잘라낸** 뒤 `onChange`를 호출한다.
그래서 라인 304의 "초과분 분배" 로직(`digits.length > maxLength`)이 사실상 도달하지 못한다.

### 수정
- 각 세그먼트 input에 `onPaste` 핸들러 추가:
  - `event.preventDefault()`.
  - `event.clipboardData.getData('text')`에서 숫자만 추출.
  - `splitAccountNumberForBank(bankName, digits)`로 전체 세그먼트에 분배.
  - `onChange(joinAccountSegments(...))`.
  - 다음 빈 칸(또는 마지막 칸)으로 포커스 이동.
- 타이핑용 `maxLength`는 유지(붙여넣기만 우회). 멀티 자릿수 붙여넣기는 항상 첫 세그먼트부터
  전체 재분배(사용자가 "전체 계좌번호"를 복사해온 의도와 일치).
- 온보딩·설정이 같은 컴포넌트를 쓰므로 한 번에 해결.

---

## 4. 닉네임 랜덤 추천 — 온보딩 `profile` 단계

- `lib/nicknames.ts` 신규: `generateRandomNickname(exclude?: string): string`.
  - **AI 미사용**, 조합 생성 안 함. **미리 정해둔 샘플 목록에서 하나를 뽑아 뒤에 랜덤 숫자만 붙인다.**
  - `NICKNAME_SAMPLES` 고정 배열(사용자 지정): `가천대 존잘남`, `가천대 존예여신`, `길여키즈`,
    `가천대 화석고인물`, `가천대 카리나`, `가천대 윈터`, `가천대 장원영`
    (+ 같은 결의 항목 몇 개 추가 가능, 손쉽게 확장).
  - 동작: 무작위 샘플 선택 → 뒤에 랜덤 정수 문자열을 그대로 이어 붙임(구분자 없음, 예: `가천대 카리나7`,
    `길여키즈42`).
  - **길이 제한 처리(닉네임 2–10자):** 붙이는 숫자 자릿수를 `min(4, 10 - base.length)`로 동적 제한해
    결과가 항상 10자 이하가 되게 한다. 예) `가천대 화석고인물`(9자)에는 1자리 숫자만 붙음.
  - `exclude`(직전 값)와 같은 결과는 회피(재시도).
- 닉네임 입력 칸 옆/아래에 **"🎲 랜덤 추천"** 버튼. 클릭 시 `handleInputChange('nickname', …)`로
  채움. 누를 때마다 교체.
- 중복은 기존 "다음" 단계의 닉네임 중복 검사로 처리(겹치면 기존 에러 노출 → 다시 추천).
- analytics: `nickname_suggested`(선택).

---

## 영향 받는 파일

- `supabase_schema.sql` (+ Supabase 마이그레이션): `chat_rooms.payout_revealed_at`.
- `app/api/rooms/[id]/private/route.ts`: 게이팅, 신규 응답 필드.
- `app/api/rooms/[id]/reveal-payout/route.ts`: 신규.
- `app/api/profile/complete/route.ts`: 계좌 선택값 완화.
- `app/rooms/[id]/page.tsx`: 슬롯 3상태, 공개 버튼, 인라인 계좌 입력, `loadParticipants` 확장(새 필드 저장)·`broadcastRoomSync` 전파.
- `components/auth/SignupForm.tsx`: "나중에" 스킵, 닉네임 추천 버튼.
- `components/BankAccountFields.tsx`: `onPaste` 핸들러.
- `lib/nicknames.ts`: 신규.

## 테스트 / 검증

- 붙여넣기: 각 은행 세그먼트 포맷으로 전체 계좌번호 붙여넣기 → 칸 분배 정확.
- 온보딩 스킵: "나중에" → 가입 완료 → `payoutAccount: null` → 설정/방 안에서 입력 가능.
- 공개 흐름: 방장 공개 전 다른 참여자에게 계좌 미노출(네트워크 응답에도 미포함) →
  공개 후 노출 + 다른 클라이언트 실시간 갱신.
- 닉네임 추천: 반복 클릭 시 2–10자 유효 닉네임, 직전과 다른 값.
- 실데이터/로그로 확인(정적 분석만으로 끝내지 않음).
