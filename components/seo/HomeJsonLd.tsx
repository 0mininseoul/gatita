import {
  SITE_URL,
  SITE_NAME,
  SITE_ALTERNATE_NAMES,
  SITE_DESCRIPTION,
  FAQ_ITEMS,
} from '@/lib/seo'

// Server-rendered structured data (JSON-LD). Emitted in the initial HTML so
// Google and AI engines can read the entity without executing JavaScript.
export default function HomeJsonLd() {
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        alternateName: SITE_ALTERNATE_NAMES,
        description: SITE_DESCRIPTION,
        inLanguage: 'ko-KR',
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: SITE_NAME,
        alternateName: SITE_ALTERNATE_NAMES,
        url: SITE_URL,
        logo: `${SITE_URL}/icons/icon-512x512.png`,
        description: SITE_DESCRIPTION,
        areaServed: {
          '@type': 'CollegeOrUniversity',
          name: '가천대학교',
        },
      },
      {
        '@type': 'WebApplication',
        '@id': `${SITE_URL}/#webapp`,
        name: SITE_NAME,
        url: SITE_URL,
        applicationCategory: 'TravelApplication',
        operatingSystem: 'Web, iOS, Android',
        browserRequirements: 'Requires JavaScript.',
        inLanguage: 'ko-KR',
        description: SITE_DESCRIPTION,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'KRW',
        },
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
      {
        '@type': 'FAQPage',
        '@id': `${SITE_URL}/#faq`,
        mainEntity: FAQ_ITEMS.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.answer,
          },
        })),
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  )
}
