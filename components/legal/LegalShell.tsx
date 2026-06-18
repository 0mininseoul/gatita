import Link from 'next/link'
import Image from 'next/image'
import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'

type LegalShellProps = {
  title: string
  description: string
  updatedAt: string
  children: ReactNode
}

export default function LegalShell({ title, description, updatedAt, children }: LegalShellProps) {
  return (
    <main className="legal-shell min-h-screen bg-gray-100 text-gray-800">
      <div className="mx-auto flex w-full max-w-2xl flex-col px-4 py-4 sm:px-5 sm:py-6">
        <nav className="mb-4 flex items-center gap-2 text-xs">
          <Link
            href="/"
            aria-label="랜딩페이지로 돌아가기"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-300 bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Link href="/" className="inline-flex min-w-0 items-center gap-1.5 text-gray-900">
            <Image
              src="/brand/gatita-logo.png"
              alt=""
              width={24}
              height={24}
              className="h-6 w-6 shrink-0"
            />
            <span className="font-bold">같이타</span>
          </Link>
        </nav>

        <article className="rounded-md border border-gray-300 bg-gray-50 p-4 shadow-sm sm:p-5">
          <header className="border-b border-gray-300 pb-3">
            <h1 className="text-lg font-bold tracking-normal text-gray-950">{title}</h1>
            <p className="mt-2 leading-5 text-gray-600">{description}</p>
            <p className="mt-3 text-[0.75rem] text-gray-500">시행일 및 최종 업데이트: {updatedAt}</p>
          </header>

          <div className="legal-content mt-5 space-y-5 text-gray-700">{children}</div>
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
    <section className="space-y-2">
      <h2 className="text-[0.875rem] font-bold text-gray-950">{title}</h2>
      <div className="space-y-2 text-[0.8125rem] leading-5">{children}</div>
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
    <div className="overflow-x-auto rounded-md border border-gray-300">
      <table className="min-w-full divide-y divide-gray-300 text-left text-[0.75rem]">
        <thead className="bg-gray-100 text-gray-700">
          <tr>
            {headers.map((header) => (
              <th key={header} className="whitespace-nowrap px-2.5 py-2 font-bold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-gray-50">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={`${rowIndex}-${cellIndex}`} className="min-w-36 px-2.5 py-2 align-top leading-5">
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
