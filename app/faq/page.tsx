import type { Metadata } from 'next'
import Link from 'next/link'
import LegalShell, { LegalSection } from '@/components/legal/LegalShell'
import { OG_IMAGE, SITE_URL, FAQ_ITEMS } from '@/lib/seo'

export const metadata: Metadata = {
  title: '자주 묻는 질문 — 같이타 (가천대 택시 동승)',
  description:
    '같이타 자주 묻는 질문. 가천대 택시 동승 매칭, 이용 자격, 택시비 정산, 운행 지점, 안전, 시작 방법을 한눈에 확인하세요.',
  keywords: '같이타, 같이타 사용법, 가천대 택시앱, 가천대 택시 어플, 가천대 택시비 정산, 가천대 합승, 같이타 FAQ',
  alternates: {
    canonical: '/faq',
  },
  openGraph: {
    type: 'article',
    title: '자주 묻는 질문 — 같이타',
    description: '가천대 택시 동승 서비스 같이타에 대해 자주 묻는 질문을 모았습니다.',
    url: 'https://gatita.kro.kr/faq',
    images: [OG_IMAGE],
  },
}

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  '@id': `${SITE_URL}/faq#faq`,
  mainEntity: FAQ_ITEMS.map((item) => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: { '@type': 'Answer', text: item.answer },
  })),
}

const updatedAt = '2026년 6월'

export default function FaqPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <LegalShell
        title="자주 묻는 질문"
        description="가천대 택시 동승 서비스 같이타에 대해 학생들이 자주 묻는 질문을 모았습니다."
        updatedAt={updatedAt}
      >
        {FAQ_ITEMS.map((item) => (
          <LegalSection key={item.question} title={item.question}>
            <p>{item.answer}</p>
          </LegalSection>
        ))}

        <LegalSection title="더 알아보기">
          <p>
            서비스가 궁금하다면{' '}
            <Link href="/about" className="font-bold text-blue-600 underline">같이타 소개</Link>를
            확인하거나,{' '}
            <Link href="/" className="font-bold text-blue-600 underline">같이타 시작하기</Link>에서
            바로 동승자를 찾아보세요.
          </p>
        </LegalSection>
      </LegalShell>
    </>
  )
}
