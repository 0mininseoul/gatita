import Link from 'next/link'
import {
  SITE_NAME,
  SITE_TAGLINE,
  SITE_DEFINITION,
  SERVICE_LOCATIONS,
  HOW_IT_WORKS,
  FAQ_ITEMS,
} from '@/lib/seo'

// Server-rendered semantic content for crawlers and no-JS visitors.
// The interactive landing (HomeClient) renders the SplitText hero with ssr:false,
// so without this block the initial HTML has no <h1> and no descriptive copy.
// Content here is an honest description of the same service the landing presents.
// Visually hidden (sr-only) so it does not disturb the fullscreen app UI.
export default function HomeSeoContent() {
  return (
    <section className="sr-only" aria-label="같이타 서비스 소개">
      <h1>
        {SITE_NAME} — {SITE_TAGLINE}
      </h1>
      <p>{SITE_DEFINITION}</p>

      <h2>같이타 이용 방법</h2>
      <ol>
        {HOW_IT_WORKS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <h2>운행 지점</h2>
      <ul>
        {SERVICE_LOCATIONS.map((loc) => (
          <li key={loc}>{loc}</li>
        ))}
      </ul>

      <h2>자주 묻는 질문</h2>
      <dl>
        {FAQ_ITEMS.map((item) => (
          <div key={item.question}>
            <dt>{item.question}</dt>
            <dd>{item.answer}</dd>
          </div>
        ))}
      </dl>

      <nav aria-label="같이타 안내 페이지">
        <Link href="/about">같이타 소개</Link>
        <Link href="/faq">자주 묻는 질문</Link>
      </nav>
    </section>
  )
}
