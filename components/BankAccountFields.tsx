'use client'

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  BANK_OPTIONS,
  BankOption,
  getAccountSegmentsForBank,
  getBankOption,
  joinAccountSegments,
  splitAccountNumberForBank,
} from '@/lib/banks'
import { ChevronDown, Pencil } from 'lucide-react'

function BankIcon({ bank, label }: { bank?: BankOption | null; label?: string }) {
  const [imageFailed, setImageFailed] = useState(false)
  const text = bank?.icon ?? label?.trim().slice(0, 2) ?? '직접'

  useEffect(() => {
    setImageFailed(false)
  }, [bank?.logoSrc])

  if (bank?.logoSrc && !imageFailed) {
    return (
      <span
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-100 bg-white"
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={bank.logoSrc}
          alt=""
          className="h-full w-full object-contain"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      </span>
    )
  }

  return (
    <span
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-gray-950"
      style={{ backgroundColor: bank?.color ?? '#eef2ff' }}
      aria-hidden="true"
    >
      {text}
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
  const [isCustomBankMode, setIsCustomBankMode] = useState(false)
  const [customBankName, setCustomBankName] = useState('')
  const containerRef = useRef<HTMLDivElement | null>(null)
  const selectedBank = getBankOption(value)
  const customValue = value && !selectedBank ? value : ''

  useEffect(() => {
    if (!isOpen) return

    setCustomBankName(customValue)
  }, [customValue, isOpen])

  useEffect(() => {
    if (!isOpen) return

    const timeoutId = window.setTimeout(() => {
      containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [isOpen])

  const onCustomBankChange = (nextValue: string) => {
    const trimmedValue = nextValue.trim()
    if (!trimmedValue) return

    onChange(trimmedValue)
    setIsCustomBankMode(false)
    setIsOpen(false)
  }

  const handleCustomSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onCustomBankChange(customBankName)
  }

  return (
    <div ref={containerRef} className="space-y-2">
      <button
        type="button"
        onClick={() => setIsOpen((next) => !next)}
        disabled={disabled}
        className={`input-field flex items-center justify-between text-left ${error ? 'border-red-500' : ''}`}
      >
        <span className={`flex min-w-0 items-center gap-2 ${selectedBank || customValue ? 'text-gray-900' : 'text-gray-400'}`}>
          {(selectedBank || customValue) && <BankIcon bank={selectedBank} label={customValue} />}
          <span className="truncate">{(selectedBank?.name ?? customValue) || '은행 선택'}</span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && !disabled && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div data-bank-dropdown-list className="max-h-64 overflow-y-auto overscroll-contain">
            {BANK_OPTIONS.map((bank) => (
              <button
                key={bank.id}
                type="button"
                onClick={() => {
                  onChange(bank.name)
                  setIsCustomBankMode(false)
                  setIsOpen(false)
                }}
                className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-bold text-gray-900 transition hover:bg-gray-50"
              >
                <BankIcon bank={bank} />
                <span>{bank.name}</span>
              </button>
            ))}
          </div>
          <div className="border-t border-gray-100 p-2">
            {isCustomBankMode ? (
              <form onSubmit={handleCustomSubmit} className="flex items-center gap-2">
                <input
                  type="text"
                  value={customBankName}
                  onChange={(event) => setCustomBankName(event.target.value)}
                  autoFocus
                  placeholder="은행명 직접 입력"
                  className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-base font-bold outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-100"
                />
                <button
                  type="submit"
                  disabled={!customBankName.trim()}
                  className="shrink-0 rounded-lg bg-gray-950 px-3 py-2 text-xs font-black text-white disabled:bg-gray-300"
                >
                  적용
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsCustomBankMode(true)
                  setCustomBankName(customValue)
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm font-bold text-gray-700 transition hover:bg-gray-50"
              >
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600">
                  <Pencil className="h-3.5 w-3.5" />
                </span>
                <span>직접 입력</span>
              </button>
            )}
          </div>
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
  const selectedBank = getBankOption(bankName)
  const segments = getAccountSegmentsForBank(bankName)
  const segmentKey = (selectedBank?.id ?? bankName) || 'custom-bank'
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])
  const segmentValues = useMemo(
    () => splitAccountNumberForBank(bankName, value),
    [bankName, value]
  )

  useEffect(() => {
    inputRefs.current = inputRefs.current.slice(0, segments.length)
  }, [segments.length])

  const updateSegment = (index: number, nextValue: string) => {
    const maxLength = segments[index]
    const digits = nextValue.replace(/\D/g, '')
    const nextSegments = Array.from(
      { length: segments.length },
      (_, segmentIndex) => segmentValues[segmentIndex] ?? '',
    )

    if (digits.length > maxLength) {
      const pastedSegments = splitAccountNumberForBank(bankName, digits)
      onChange(joinAccountSegments(pastedSegments))
      const nextFocusIndex = Math.min(pastedSegments.findIndex((segment) => !segment), segments.length - 1)
      inputRefs.current[nextFocusIndex >= 0 ? nextFocusIndex : segments.length - 1]?.focus()
      return
    }

    nextSegments[index] = digits.slice(0, maxLength)
    onChange(joinAccountSegments(nextSegments))

    if (digits.length >= maxLength) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleSegmentKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Backspace') return
    if (segmentValues[index]) return

    inputRefs.current[index - 1]?.focus()
  }

  return (
    <div>
      <div className="flex min-w-0 items-center gap-1.5">
        {segments.map((length, index) => (
          <div key={`${segmentKey}-${index}`} className="flex min-w-0 flex-1 items-center gap-1.5">
            <input
              ref={(element) => { inputRefs.current[index] = element }}
              type="text"
              inputMode="numeric"
              value={segmentValues[index] ?? ''}
              onChange={(event) => updateSegment(index, event.target.value)}
              onKeyDown={(event) => handleSegmentKeyDown(index, event)}
              maxLength={length}
              disabled={disabled}
              aria-label={`계좌번호 ${index + 1}번째 입력칸`}
              className={`h-12 min-w-0 w-full rounded-lg border bg-white px-2 text-center text-base font-black tracking-normal text-gray-950 outline-none transition focus:border-primary-600 focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-400 ${
                error ? 'border-red-500' : 'border-gray-200'
              }`}
              placeholder={'0'.repeat(length)}
            />
            {index < segments.length - 1 && (
              <span className="shrink-0 text-sm font-black text-gray-400">-</span>
            )}
          </div>
        ))}
      </div>
      {error && (
        <p className="mt-2 text-sm text-red-500">{error}</p>
      )}
    </div>
  )
}
