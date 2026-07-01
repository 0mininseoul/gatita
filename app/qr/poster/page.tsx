import type { Metadata } from 'next'
import { buildOfflinePosterQrUrl } from '@/lib/marketing/qr'
import OfflinePosterQrRedirectClient from './OfflinePosterQrRedirectClient'

export const metadata: Metadata = {
  title: '같이타 QR',
  alternates: {
    canonical: buildOfflinePosterQrUrl(),
  },
  robots: { index: false, follow: false },
}

export default function OfflinePosterQrPage() {
  return <OfflinePosterQrRedirectClient />
}
