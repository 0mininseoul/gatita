import type { Metadata } from 'next'

// Applies to the room list and every individual chat room.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
}

export default function RoomsLayout({ children }: { children: React.ReactNode }) {
  return children
}
