import type { Metadata } from 'next'

// Session-dependent app screens are not separate search landing pages.
// Keep crawling enabled so engines can read the noindex directive.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
}

export default function MapLayout({ children }: { children: React.ReactNode }) {
  return children
}
