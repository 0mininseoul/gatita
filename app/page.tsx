import type { Metadata } from 'next'
import HomeClient from '@/components/HomeClient'
import HomeJsonLd from '@/components/seo/HomeJsonLd'
import HomeSeoContent from '@/components/seo/HomeSeoContent'

// Canonical lives here (home only). Keeping it in the root layout would make
// every metadata-less sub-page (/map, /rooms, /settings) inherit canonical "/",
// wrongly pointing their canonical at the homepage.
export const metadata: Metadata = {
  alternates: {
    canonical: '/',
  },
}

// Server component wrapper. Emits crawlable structured data + semantic content
// in the initial HTML, then hands the page to the interactive client app.
export default function Page() {
  return (
    <>
      <HomeJsonLd />
      <HomeClient />
      <HomeSeoContent />
    </>
  )
}
