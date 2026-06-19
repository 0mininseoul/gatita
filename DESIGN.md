---
name: 같이타
description: 가천대학교 학생을 위한 모바일 우선 통학 동행 제품 UI
colors:
  primary-blue: "#2782ff"
  primary-blue-strong: "#1f6ef0"
  primary-blue-deep: "#195fd1"
  brand-mauve: "#be97cf"
  ink: "#111827"
  ink-muted: "#4b5563"
  border-soft: "#e5e7eb"
  surface: "#f9fafb"
  surface-raised: "#ffffff"
  map-surface: "#e7edf4"
typography:
  display:
    fontFamily: "var(--font-paperlogy), -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontWeight: 900
    lineHeight: 0.95
    letterSpacing: "0"
  title:
    fontFamily: "var(--font-paperlogy), -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 900
    lineHeight: 1.2
  body:
    fontFamily: "var(--font-paperlogy), -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.45
  label:
    fontFamily: "var(--font-paperlogy), -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 800
    lineHeight: 1.2
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary-blue}"
    textColor: "{colors.surface-raised}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-dark:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface-raised}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  input-field:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
  map-chip:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
---

# Design System: 같이타

## 1. Overview

**Creative North Star: "캠퍼스 이동 관제판"**

같이타의 제품 UI는 지도와 채팅을 중심으로 작동하는 모바일 관제판이다. 사용자는 오래 읽기보다 지금 출발할 방이 있는지, 어디로 가는지, 누구와 조율해야 하는지를 빠르게 확인한다. 그래서 앱 내부는 설명보다 상태, 버튼, 목록, 시트의 밀도를 우선한다.

랜딩은 친근한 브랜드 인상을 만들 수 있지만, 로그인 후 화면은 조용하고 작업 중심이어야 한다. 지도 위 컴포넌트는 흰색 반투명 표면과 굵은 Paperlogy 글자로 떠 있지만, 실제 지점과 Kakao 지도 레이블을 가리지 않도록 제한된 높이와 안정적인 safe-area 배치를 따른다.

**Key Characteristics:**
- 모바일 우선 지도와 하단 시트 구조
- Paperlogy 기반의 굵고 짧은 한국어 UI
- `#2782ff`를 행동과 선택 상태에만 사용하는 절제된 액센트
- 헤더, 채팅 입력창, 시트처럼 작업을 고정하는 안정적인 크롬

## 2. Colors

팔레트는 지도와 채팅을 방해하지 않는 차가운 흰색 표면, 짙은 잉크 텍스트, 선명한 파란색 액션으로 구성된다.

### Primary
- **Campus Action Blue** (#2782ff): 로그인, 방 생성, 선택 상태, 지도 지점의 활성 상태에 사용한다.
- **Action Blue Strong** (#1f6ef0): hover, 강조 텍스트, 활성 칩에 사용한다.
- **Action Blue Deep** (#195fd1): 작은 상태 텍스트와 강한 대비가 필요한 곳에 제한적으로 사용한다.

### Secondary
- **Soft Brand Mauve** (#be97cf): 랜딩 배경과 브랜드 분위기에만 주로 사용한다. 앱 내부에서는 장식으로 남용하지 않는다.

### Neutral
- **Ink** (#111827): 주요 텍스트, 검은 CTA, 지도 오버레이 카운트에 사용한다.
- **Muted Ink** (#4b5563): 보조 설명, 시간, 상태 설명에 사용한다.
- **Soft Border** (#e5e7eb): 입력창, 카드, 시트 경계에 사용한다.
- **Raised Surface** (#ffffff): 헤더, 칩, 시트, 방 카드의 표면이다.
- **App Surface** (#f9fafb): 설정, 채팅 배경의 기본 표면이다.
- **Map Surface** (#e7edf4): 지도 로딩과 지도 주변 배경에 사용한다.

### Named Rules
**The One Accent Rule.** 제품 화면에서 파란색은 현재 선택, 주요 행동, 정보 상태에만 쓴다. 장식용 파란 배경을 반복하지 않는다.

## 3. Typography

**Display Font:** Paperlogy with system fallbacks  
**Body Font:** Paperlogy with system fallbacks  
**Label/Mono Font:** System fallback only where legal text intentionally uses default document typography

**Character:** Paperlogy는 작은 모바일 화면에서 한국어를 두껍고 친근하게 보이게 한다. 제품 내부에서는 과한 크기보다 굵기와 간결한 문장으로 위계를 만든다.

### Hierarchy
- **Display** (900, landing clamp scale, 0.95): 랜딩의 주 카피에만 사용한다.
- **Headline** (900, 1.125rem to 1.25rem, 1.2): 모달과 주요 시트 제목에 사용한다.
- **Title** (900, 1rem, 1.2): 지도 헤더 워드마크, 방 제목, 설정 섹션 제목에 사용한다.
- **Body** (600, 0.875rem, 1.45): 설명, 리스트 내용, 버튼 보조 텍스트에 사용한다.
- **Label** (800, 0.75rem, 1.2): 칩, 폼 라벨, 상태 라벨에 사용한다.

### Named Rules
**The Compact Korean Rule.** 작은 화면에서 긴 설명을 피하고, 정보는 명사형 라벨과 짧은 상태 문장으로 압축한다.

## 4. Elevation

같이타는 지도와 채팅 위에 떠 있는 표면을 구분하기 위해 부드러운 shadow를 쓴다. 그림자는 장식이 아니라 레이어 구분용이다. 제품 화면에서는 blur와 shadow가 함께 쓰이더라도 글래스모피즘처럼 표면을 흐릿하게 만들지 않는다.

### Shadow Vocabulary
- **Map Header Float** (`0 12px 34px rgba(17,24,39,0.14)`): 지도 상단 헤더에만 사용한다.
- **Map Chip Float** (`0 10px 28px rgba(17,24,39,0.12)`): 지도 상태 칩에 사용한다.
- **Bottom Sheet Lift** (`0 18px 48px rgba(17,24,39,0.22)`): 하단 시트와 작은 패널에 사용한다.
- **Chat Chrome** (`0 8px 24px rgba(31,78,200,0.06)`): 채팅방 헤더와 입력창의 얕은 구분에 사용한다.

### Named Rules
**The Map Must Breathe Rule.** 헤더, 칩, 지점 라벨, 줌 컨트롤은 서로 겹치지 않아야 하고, 실제 지도 레이블을 읽을 공간을 남겨야 한다.

## 5. Components

### Buttons
- **Shape:** 기본 8px, 채팅 입력 전송 버튼은 pill 형태를 사용한다.
- **Primary:** `#2782ff` 또는 브랜드 그라디언트. 주요 생성, 설치, 확인 행동에만 사용한다.
- **Dark:** `#111827` 배경의 작은 CTA. 방 입장, 만들기처럼 좁은 카드 안에서 강한 대비가 필요할 때 사용한다.
- **Hover / Focus:** 150-200ms 전환, focus ring은 `rgba(39,130,255,0.15)`를 사용한다.

### Chips
- **Style:** 흰색 반투명 표면, 8px radius, 굵은 12px 라벨.
- **State:** 지도 상단 상태 칩은 pointer event를 막아 지도 조작을 방해하지 않는다. 선택 가능한 지점 라벨은 버튼으로 렌더링한다.

### Cards / Containers
- **Corner Style:** 제품 기본은 8px, 큰 모달과 채팅 시트는 16px까지 허용한다.
- **Background:** 반복 카드와 시트는 흰색 또는 `#f9fafb`를 사용한다.
- **Shadow Strategy:** 지도 위 레이어에만 강한 그림자를 쓰고, 일반 설정 카드는 경계선 중심으로 둔다.
- **Border:** `#e5e7eb` 또는 흰색 반투명 경계를 사용한다.
- **Internal Padding:** 모바일 카드 12px, 모달 16px가 기본이다.

### Inputs / Fields
- **Style:** 흰색 배경, 1px soft border, 12px radius.
- **Focus:** 파란 border와 옅은 focus ring을 함께 쓴다.
- **Error / Disabled:** 비활성은 gray-300 배경과 낮은 대비 텍스트로 명확하게 표시한다.

### Navigation
- **Map Header:** safe-area 안에 떠 있는 흰색 헤더, 좌측 로고와 워드마크, 우측 아이콘 액션.
- **Chat Header:** 화면 상단 고정. 키보드가 올라와도 움직이지 않는다.
- **Bottom Sheet:** 지도 위에 뜨며 시트 내부만 스크롤한다. 바깥 지도 영역 조작은 가능한 상태를 우선한다.

### Signature Component
**Campus Route Map:** Kakao 지도 위에 고정지점 라벨, 방 개수 배지, 상태 칩, 하단 시트를 올린다. 지점 라벨은 출발지 선택만 수행하고, 방 생성 시트에서 도착지와 출발예정시간을 고른다.

## 6. Do's and Don'ts

### Do:
- **Do** 지도 헤더와 상태 칩을 실제 safe-area와 헤더 높이 기준으로 배치한다.
- **Do** 채팅방에서는 헤더와 입력창을 고정하고 메시지 영역만 스크롤한다.
- **Do** 방 리스트에서는 출발지가 이미 고정된 맥락이면 도착지만 반복 표시한다.
- **Do** 위험 행동은 체크박스, 드롭다운, 확인 버튼으로 의도를 분명히 받는다.
- **Do** Paperlogy를 기본 UI 폰트로 유지하되, 법적 문서는 시스템 폰트로 낮은 가독성의 문서 톤을 유지한다.

### Don't:
- **Don't** 지도 위 상단 헤더, 상태 칩, 줌 컨트롤, 지점 라벨이 서로 겹치게 두지 않는다.
- **Don't** 앱 내부를 랜딩처럼 큰 그래픽, 긴 설명, 장식 카드로 채우지 않는다.
- **Don't** 보라색 그라디언트를 제품 내부의 기본 표면으로 반복하지 않는다.
- **Don't** 채팅방 전체 문서를 스크롤시키거나 키보드 때문에 헤더가 밀리게 만들지 않는다.
- **Don't** 참여자, 전화번호, 계좌번호를 맥락 없이 공개적으로 노출하지 않는다.
