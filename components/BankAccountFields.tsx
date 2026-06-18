'use client'

import { useMemo, useRef, useState } from 'react'
import {
  BANK_OPTIONS,
  BankOption,
  getBankOption,
  getBankOptionOrDefault,
  joinAccountSegments,
  splitAccountNumberForBank,
} from '@/lib/banks'
import { ChevronDown } from 'lucide-react'

function BankIcon({ bank }: { bank: BankOption }) {
  return (
    <span
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-gray-950"
      style={{ backgroundColor: bank.color }}
      aria-hidden="true"
    >
      {bank.icon}
    </span>
  )
}

export function BankSelectField({
  value,
  onChange,
  disabled = false,
  error,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  error?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const selectedBank = getBankOption(value)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((next) => !next)}
        disabled={disabled}
        className={`input-field flex items-center justify-between text-left ${error ? 'border-red-500' : ''}`}
      >
        <span className={`flex min-w-0 items-center gap-2 ${selectedBank ? 'text-gray-900' : 'text-gray-400'}`}>
          {selectedBank && <BankIcon bank={selectedBank} />}
          <span className="truncate">{selectedBank?.name ?? '은행 선택'}</span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && !disabled && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
          {BANK_OPTIONS.map((bank) => (
            <button
              key={bank.id}
              type="button"
              onClick={() => {
                onChange(bank.name)
                setIsOpen(false)
              }}
              className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-bold text-gray-900 transition hover:bg-gray-50"
            >
              <BankIcon bank={bank} />
              <span>{bank.name}</span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm text-red-500">{error}</p>
      )}
    </div>
  )
}

export function AccountNumberSegmentField({
  bankName,
  value,
  onChange,
  disabled = false,
  error,
}: {
  bankName: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  error?: string
}) {
  const bank = getBankOptionOrDefault(bankName)
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])
  const segmentValues = useMemo(
    () => splitAccountNumberForBank(bankName, value),
    [bankName, value]
  )

  const updateSegment = (index: number, nextValue: string) => {
    const maxLength = bank.segments[index]
    const digits = nextValue.replace(/\D/g, '')
    const nextSegments = [...segmentValues]

    if (digits.length > maxLength) {
      const pastedSegments = splitAccountNumberForBank(bankName, digits)
      onChange(joinAccountSegments(pastedSegments))
      return
    }

    nextSegments[index] = digits.slice(0, maxLength)
    onChange(joinAccountSegments(nextSegments))

    if (digits.length >= maxLength) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  return (
    <div>
      <div className="flex min-w-0 items-center gap-1.5">
        {bank.segments.map((length, index) => (
          <div key={`${bank.id}-${index}`} className="flex min-w-0 flex-1 items-center gap-1.5">
            <input
              ref={(element) => { inputRefs.current[index] = element }}
              type="text"
              inputMode="numeric"
              value={segmentValues[index] ?? ''}
              onChange={(event) => updateSegment(index, event.target.value)}
              maxLength={length}
              disabled={disabled}
              aria-label={`계좌번호 ${index + 1}번째 입력칸`}
              className={`h-12 min-w-0 w-full rounded-lg border bg-white px-2 text-center text-sm font-black tracking-normal text-gray-950 outline-none transition focus:border-primary-600 focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-400 ${
                error ? 'border-red-500' : 'border-gray-200'
              }`}
              placeholder={'0'.repeat(Math.min(length, 4))}
            />
            {index < bank.segments.length - 1 && (
              <span className="shrink-0 text-sm font-black text-gray-400">-</span>
            )}
          </div>
        ))}
      </div>
      <p className="mt-1 text-xs text-gray-500">{bank.name} 형식: {bank.placeholder}</p>
      {error && (
        <p className="mt-2 text-sm text-red-500">{error}</p>
      )}
    </div>
  )
}
