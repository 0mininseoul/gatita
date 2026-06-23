import type { Metadata } from 'next'
import Link from 'next/link'
import LegalShell, { LegalSection } from '@/components/legal/LegalShell'
import {
  SITE_DEFINITION,
  SERVICE_LOCATIONS,
  HOW_IT_WORKS,
} from '@/lib/seo'

export const metadata: Metadata = {
  title: '같이타 소개 — 가천대 택시 동승 플랫폼',
  description:
    '같이타는 가천대학교 학생 전용 택시 동승(합승) 매칭 플랫폼입니다. 가천대역, 정문, 기숙사 사이를 함께 이동할 동승자를 찾고 채팅으로 정산까지 조율하는 방법을 알아보세요.',
  keywords: '가천대 같이타, 가천대 택시, 가천대 택시 동승, 가천대 합승, 가천대역 택시, 가천대 기숙사 택시, 같이타',
  alternates: {
    canonical: '/about',
  },
  openGraph: {
    type: 'article',
    title: '같이타 소개 — 가천대 택시 동승 플랫폼',
    description:
      '가천대학교 학생들이 택시를 함께 타고 비용을 나누는 가장 쉬운 방법, 같이타를 소개합니다.',
    url: 'https://gatita.kro.kr/about',
  },
}

const updatedAt = '2026년 6월'

export default function AboutPage() {
  return (
    <LegalShell
      title="같이타 소개"
      description={SITE_DEFINITION}
      updatedAt={updatedAt}
    >
      <LegalSection title="같이타란?">
        <p>
          <strong>같이타</strong>는 가천대학교 재학생이 캠퍼스 주변 고정 지점 사이를 함께 이동할
          택시 동승자를 찾도록 돕는 학생 전용 매칭 플랫폼입니다. 가천대역에서 기숙사까지처럼 자주 다니는
          경로를 혼자가 아니라 같은 방향 학생과 함께 이동해, 택시비를 나누고 더 안전하게 통학할 수 있습니다.
        </p>
        <p>
          같이타는 직접 결제나 운송을 제공하지 않습니다. 학생 인증, 고정 지점 기반 방 탐색, 실시간 채팅,
          참여자 연락, 방장 계좌 공유 같은 <strong>조율 기능</strong>에 집중합니다.
        </p>
      </LegalSection>

      <LegalSection title="이렇게 이용해요">
        <ol className="list-decimal space-y-1 pl-5">
          {HOW_IT_WORKS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </LegalSection>

      <LegalSection title="운행 지점">
        <p>같이타는 다음 가천대학교 캠퍼스 고정 지점 사이를 연결합니다.</p>
        <ul className="list-disc space-y-1 pl-5">
          {SERVICE_LOCATIONS.map((loc) => (
            <li key={loc}>{loc}</li>
          ))}
        </ul>
      </LegalSection>

      <LegalSection title="왜 같이타인가요?">
        <ul className="list-disc space-y-1 pl-5">
          <li>가천대 이메일 인증으로 같은 학교 학생끼리만 매칭되어 더 안전합니다.</li>
          <li>택시비를 인원수대로 나눠 혼자 탈 때보다 비용이 절반 수준으로 줄어듭니다.</li>
          <li>설치 없이 브라우저에서 바로 쓰는 웹앱(PWA)으로, 출발 직전에 빠르게 동승자를 찾습니다.</li>
          <li>실시간 채팅으로 출발 시간과 만날 장소를 바로 조율합니다.</li>
        </ul>
      </LegalSection>

      <LegalSection title="더 알아보기">
        <p>
          궁금한 점은 <Link href="/faq" className="font-bold text-blue-600 underline">자주 묻는 질문</Link>에서
          확인하거나, <Link href="/" className="font-bold text-blue-600 underline">같이타 시작하기</Link>에서
          바로 동승자를 찾아보세요.
        </p>
      </LegalSection>
    </LegalShell>
  )
}
