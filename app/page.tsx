import HomeClient from '@/components/HomeClient'
import HomeJsonLd from '@/components/seo/HomeJsonLd'
import HomeSeoContent from '@/components/seo/HomeSeoContent'

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
