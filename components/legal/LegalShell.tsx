import Link from 'next/link'
import type { ReactNode } from 'react'

type LegalShellProps = {
  title: string
  description: string
  updatedAt: string
  children: ReactNode
}

export default function LegalShell({ title, description, updatedAt, children }: LegalShellProps) {
  return (
    <main className="min-h-screen app-bg">
      <div className="mx-auto flex w-full max-w-3xl flex-col px-5 py-6 sm:px-6 sm:py-10">
        <nav className="mb-6 flex items-center justify-between text-sm">
          <Link href="/" className="font-extrabold text-gray-900">
            같이타
          </Link>
          <div className="flex items-center gap-4 text-gray-500">
            <Link href="/privacy" className="hover:text-gray-900">
              개인정보처리방침
            </Link>
            <Link href="/terms" className="hover:text-gray-900">
              서비스약관
            </Link>
          </div>
        </nav>

        <article className="card p-5 sm:p-8">
          <header className="border-b border-gray-100 pb-6">
            <p className="mb-2 text-sm font-bold text-gray-900">같이타</p>
            <h1 className="text-3xl font-bold tracking-normal text-gray-950">{title}</h1>
            <p className="mt-3 text-base leading-7 text-gray-600">{description}</p>
            <p className="mt-4 text-sm text-gray-500">시행일 및 최종 업데이트: {updatedAt}</p>
          </header>

          <div className="legal-content mt-8 space-y-8 text-gray-700">{children}</div>
        </article>
      </div>
    </main>
  )
}

export function LegalSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-gray-950">{title}</h2>
      <div className="space-y-3 text-sm leading-7 sm:text-base">{children}</div>
    </section>
  )
}

export function LegalTable({
  headers,
  rows,
}: {
  headers: string[]
  rows: string[][]
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
        <thead className="bg-gray-50 text-gray-700">
          <tr>
            {headers.map((header) => (
              <th key={header} className="whitespace-nowrap px-4 py-3 font-semibold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={`${rowIndex}-${cellIndex}`} className="min-w-40 px-4 py-3 align-top leading-6">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
