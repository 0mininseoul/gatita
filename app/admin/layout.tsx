import type { Metadata } from 'next'

// Covers the dashboard and nested administration screens.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children
}
