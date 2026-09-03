# 획득 및 PWA 설치 퍼널 설계

## 목적

Amplitude의 대표 제품 지표를 다음 두 흐름으로 단순화한다.

1. 비로그인 랜딩 방문자가 Google 로그인을 완료하는 획득 퍼널
2. 로그인 사용자가 기본 PWA 설치 안내를 보고 실제 설치까지 진행하는 PWA 설치 퍼널

핵심 활성화 퍼널은 이미 별도 차트로 운영하므로 이 작업에서는 변경하지 않는다.

## 검토한 접근

### A. 기존 `page_viewed(path="/")` 재사용

구현은 가장 작지만 `/`가 비로그인 랜딩, OAuth 콜백, 로그인 사용자의 진입점을 함께 담당한다. 인증 상태가 확정되기 전에 기록되므로 획득 퍼널의 분모로 사용할 수 없다.

### B. 모든 비로그인 렌더링에서 `landing_viewed` 기록

콜백과 재렌더링으로 이벤트가 반복될 수 있다. 고유 사용자 집계에서는 영향이 작지만 세션·경로 분석의 노이즈가 커진다.

### C. 인증 확인 후 전용 `landing_viewed`를 30분에 한 번 기록

선택한 방식이다. 인증 확인이 끝났고 실제 비로그인 랜딩을 보여주는 경우에만 기록한다. 브라우저 세션 저장소의 마지막 기록 시각으로 30분 동안 중복을 막고, 저장소 접근이 차단되면 현재 페이지 생명주기의 메모리 폴백으로 중복을 막는다.

## 랜딩 계측

`components/HomeClient.tsx`에서 인증 확인이 끝난 뒤 다음 조건을 모두 만족할 때 `landing_viewed`를 기록한다.

- 로딩이 끝났다.
- 인증 세션이 없다.
- 앱 지도 화면에 진입하지 않았다.
- 프로필 설정 화면이 아니다.
- 최근 30분 안에 같은 브라우저 탭에서 이미 기록하지 않았다.

이벤트 속성은 `auth_state: "anonymous"`를 명시한다. `environment`, `path`, `display_mode`, 뷰포트 크기는 기존 분석 클라이언트가 공통 속성으로 추가한다.

관리자·테스터로 확인된 기기는 기존 로컬 분석 제외 플래그에 따라 이후 이벤트가 기록되지 않는다. 새로운 기기의 최초 익명 방문은 로그인 전에는 계정 신원을 알 수 없으므로 완벽하게 사전 제외할 수 없다는 한계가 있다.

## 획득 퍼널

새 Amplitude 차트는 다음 정의를 사용한다.

- 단계: `landing_viewed(auth_state=anonymous)` → `login_succeeded(method=google)`
- 순서: 이 순서대로
- 집계: 고유 사용자
- 전환창: 30분
- 환경: production
- 시간대: Asia/Seoul
- 시작일: 계측 배포일
- 관리자·내부 테스터: 알려진 Supabase 사용자 UUID 네 개 제외

`landing_viewed`는 새 이벤트이므로 2026-06-22부터의 과거 데이터는 소급 생성하지 않는다.

## PWA 설치 퍼널

기존 `PWA 설치 전환 퍼널`은 안내 노출을 포함하지 않고 전환창이 1일이다. 다음 정의의 새 실사용자 차트로 대체한다.

- 단계: `login_succeeded` → `map_opened(profile_completed=true)` → `pwa_install_instruction_shown(source=map_onboarding)` → `pwa_installed_detected`
- 순서: 이 순서대로
- 집계: 고유 사용자
- 전환창: 7일
- 환경: production
- 시간대: Asia/Seoul
- 시작일: 2026-06-22 00:00 KST
- 관리자·내부 테스터: 알려진 Supabase 사용자 UUID 네 개 제외

`pwa_install_instruction_shown`은 이미 지도 온보딩 시트에서 기록된다. `source=route_subscribe` 노출은 사용자 결정에 따라 분석 범위에서 제외한다.

`pwa_install_prompt_available`은 브라우저와 OS 지원 여부에 좌우되어 iOS 사용자를 구조적으로 누락시키므로 대표 퍼널 단계에 넣지 않는다. `pwa_install_instruction_dismissed`는 설치 전 필수 단계가 아닌 분기 행동이므로 대표 퍼널에서 제외한다.

7일 전환창은 Android의 즉시 `appinstalled` 감지뿐 아니라 iOS에서 홈 화면에 추가한 뒤 다음 번 standalone 실행으로 감지되는 지연도 수용한다.

## 오류 처리와 중복 방지

- `sessionStorage` 읽기·쓰기는 `try/catch`로 감싸 저장소가 차단된 환경에서도 랜딩 렌더링을 막지 않는다.
- 저장소 오류 시 메모리 폴백으로 같은 페이지 생명주기의 중복 이벤트를 방지한다.
- 기존 `page_viewed` 이벤트는 다른 화면 분석을 위해 유지한다.
- PWA 설치 동기화 API와 Supabase 상태 저장 로직은 변경하지 않는다.

## 검증

1. 먼저 `landing_viewed` 계약 테스트를 추가하고 이벤트가 아직 없어 실패하는지 확인한다.
2. 최소 구현 후 해당 테스트와 전체 Node 테스트를 실행한다.
3. lint와 production build를 실행한다.
4. Amplitude에서 두 차트의 단계, 필터, 전환창, KST 시작일, 내부 UUID 제외 조건을 재조회한다.
5. Aside CLI로 저장된 차트 화면을 열어 정의가 UI에도 동일하게 표시되는지 확인한다.

## 범위 밖

- `route_subscribe` 기반 PWA 유입 분석
- PWA 설치 안내 UI 재설계
- 로그인 실패 원인 계측
- 과거 `landing_viewed` 데이터 백필
- 배포 및 운영 환경변수 변경
