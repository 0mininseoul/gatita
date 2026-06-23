// Single source of truth for SEO / GEO content.
// Used by JSON-LD, the /about and /faq pages, the sitemap, and llms.txt so the
// entity description stays identical everywhere (important for AI-engine citation).

export const SITE_URL = 'https://gatita.kro.kr'
export const SITE_NAME = '같이타'
export const SITE_ALTERNATE_NAMES = ['Gatita', 'gatita', '가천대 같이타', '가천대 택시앱']

// Definition-first one-liner (<80 chars body) — the pattern AI retrieval favors.
export const SITE_TAGLINE = '가천대 택시 동승 플랫폼'
export const SITE_DEFINITION =
  '같이타는 가천대학교 재학생이 가천대역·정문·기숙사 등 캠퍼스 고정 지점 사이를 함께 이동할 택시 동승자를 찾고, 실시간 채팅으로 출발 시간과 정산을 조율하는 학생 전용 택시 동승(합승) 매칭 플랫폼입니다.'

export const SITE_DESCRIPTION =
  '가천대학교 학생들을 위한 택시 동승자 찾기 서비스입니다. 가천대역에서 기숙사까지 안전하고 편리하게 함께 이동하세요. 가천대 이메일 인증으로 같은 학교 학생끼리만 매칭됩니다.'

// Fixed campus points the service connects.
export const SERVICE_LOCATIONS = [
  '가천대역 1번출구',
  '가천대학교 정문',
  '교육대학원',
  'AI공학관',
  '제2기숙사',
  '제3기숙사',
]

export const HOW_IT_WORKS = [
  '가천대 구글 계정(@gachon.ac.kr)으로 로그인해 재학생 인증을 합니다.',
  '지도에서 출발 지점을 고르고, 같은 방향으로 가는 동승 방을 만들거나 입장합니다.',
  '실시간 채팅으로 출발 시간을 맞추고 만날 장소를 정합니다.',
  '방장이 계좌를 공유하면 택시비를 인원수대로 나눠 정산합니다.',
]

export interface FaqItem {
  question: string
  answer: string
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: '같이타가 뭐예요?',
    answer:
      '같이타는 가천대학교 학생 전용 택시 동승(합승) 매칭 플랫폼입니다. 가천대역, 정문, 기숙사 같은 캠퍼스 고정 지점 사이를 함께 이동할 동승자를 찾고 채팅으로 조율할 수 있습니다.',
  },
  {
    question: '가천대 택시 앱인가요?',
    answer:
      '같이타는 가천대 학생들이 택시를 함께 타기 위한 가천대 택시앱(웹앱)입니다. 직접 택시를 호출하거나 결제하지는 않고, 같은 방향으로 가는 학생을 매칭해 택시비를 나눠 낼 수 있게 도와줍니다.',
  },
  {
    question: '누가 사용할 수 있나요?',
    answer:
      '가천대학교 구글 이메일(@gachon.ac.kr) 인증을 마친 재학생만 사용할 수 있습니다. 같은 학교 학생끼리만 매칭되어 더 안전합니다.',
  },
  {
    question: '택시비는 어떻게 정산하나요?',
    answer:
      '같이타는 직접 결제를 제공하지 않습니다. 방장이 채팅방에서 계좌를 공유하면 택시비를 참여 인원수대로 나눠 정산합니다. 혼자 탈 때보다 비용이 절반 수준으로 줄어듭니다.',
  },
  {
    question: '어디에서 어디까지 이용할 수 있나요?',
    answer:
      '가천대역 1번출구, 가천대학교 정문, 교육대학원, AI공학관, 제2기숙사, 제3기숙사 등 캠퍼스 고정 지점 사이를 연결합니다.',
  },
  {
    question: '안전한가요?',
    answer:
      '가천대 이메일 인증을 통과한 재학생만 참여할 수 있고, 신고 기능을 제공합니다. 연락처와 계좌 같은 정보는 같은 방에 들어온 참여자에게만 보입니다.',
  },
  {
    question: '어떻게 시작하나요?',
    answer:
      '가천대 구글 계정으로 로그인한 뒤 출발 지점을 선택하고, 동승 방을 만들거나 입장한 다음 채팅으로 출발 시간을 맞추면 됩니다.',
  },
  {
    question: '앱을 설치해야 하나요?',
    answer:
      '설치 없이 브라우저에서 바로 사용할 수 있는 웹앱(PWA)입니다. 홈 화면에 추가하면 앱처럼 사용할 수 있습니다.',
  },
  {
    question: '비용이 드나요?',
    answer:
      '동승자 매칭과 채팅 기능은 무료입니다. 택시비만 함께 탄 참여자끼리 나눠 부담합니다.',
  },
]
