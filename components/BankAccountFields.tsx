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
import { ChevronDown, Pencil, Search, X } from 'lucide-react'

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
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-gray-950"
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
  presentation = 'dropdown',
  showErrorMessage = true,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  error?: string
  presentation?: 'dropdown' | 'sheet'
  showErrorMessage?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [isCustomBankMode, setIsCustomBankMode] = useState(false)
  const [customBankName, setCustomBankName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const containerRef = useRef<HTMLDivElement | null>(null)
  const selectedBank = getBankOption(value)
  const customValue = value && !selectedBank ? value : ''
  const isSheet = presentation === 'sheet'
  const filteredBankOptions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return BANK_OPTIONS

    return BANK_OPTIONS.filter((bank) => (
      bank.name.toLowerCase().includes(query) ||
      bank.id.toLowerCase().includes(query)
    ))
  }, [searchQuery])

  useEffect(() => {
    if (!isOpen) return

    setCustomBankName(customValue)
  }, [customValue, isOpen])

  useEffect(() => {
    if (!isOpen) return
    if (isSheet) return

    const timeoutId = window.setTimeout(() => {
      containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [isOpen, isSheet])

  useEffect(() => {
    if (isOpen) return

    setSearchQuery('')
    setIsCustomBankMode(false)
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

  const handleSelectBank = (bank: BankOption) => {
    onChange(bank.name)
    setIsCustomBankMode(false)
    setIsOpen(false)
  }

  const renderCustomBankControl = (compact = false) => (
    <div className={compact ? 'border-t border-gray-100 p-2' : 'border-t border-gray-100 px-5 py-3'}>
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
            className="shrink-0 rounded-lg bg-gray-950 px-3 py-2 text-xs font-bold text-white disabled:bg-gray-300"
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
  )

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

      {isOpen && !disabled && !isSheet && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div data-bank-dropdown-list className="max-h-64 overflow-y-auto overscroll-contain">
            {BANK_OPTIONS.map((bank) => (
              <button
                key={bank.id}
                type="button"
                onClick={() => handleSelectBank(bank)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-bold text-gray-900 transition hover:bg-gray-50"
              >
                <BankIcon bank={bank} />
                <span>{bank.name}</span>
              </button>
            ))}
          </div>
          {renderCustomBankControl(true)}
        </div>
      )}

      {isOpen && !disabled && isSheet && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="은행 선택 닫기"
            className="absolute inset-0 bg-black/25"
            onClick={() => setIsOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bank-picker-title"
            className="absolute inset-x-0 bottom-0 flex max-h-[78vh] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl"
          >
            <div className="shrink-0 px-5 pb-3 pt-4">
              <div className="mx-auto mb-4 h-1 w-11 rounded-full bg-gray-200" />
              <div className="flex items-center justify-between">
                <h2 id="bank-picker-title" className="text-xl font-extrabold text-gray-950">은행 선택</h2>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="grid h-10 w-10 place-items-center rounded-full bg-gray-100 text-gray-600"
                  aria-label="은행 선택 닫기"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <label className="mt-4 flex h-12 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 focus-within:border-primary-600 focus-within:ring-2 focus-within:ring-primary-100">
                <Search className="h-4 w-4 shrink-0 text-gray-400" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="은행명 검색"
                  className="min-w-0 flex-1 border-0 bg-transparent text-base font-medium text-gray-950 outline-none placeholder:text-gray-400 focus:shadow-none"
                />
              </label>
            </div>

            <div data-bank-sheet-list className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
              {filteredBankOptions.length > 0 ? (
                filteredBankOptions.map((bank) => (
                  <button
                    key={bank.id}
                    type="button"
                    onClick={() => handleSelectBank(bank)}
                    className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition hover:bg-gray-50"
                  >
                    <BankIcon bank={bank} />
                    <span className="text-base font-semibold text-gray-950">{bank.name}</span>
                  </button>
                ))
              ) : (
                <p className="px-5 py-8 text-center text-sm font-bold text-gray-500">
                  검색 결과가 없습니다.
                </p>
              )}
            </div>
            {renderCustomBankControl(false)}
          </div>
        </div>
      )}

      {error && showErrorMessage && (
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
              className={`h-12 min-w-0 w-full rounded-lg border bg-white px-2 text-center text-base font-semibold tracking-normal text-gray-950 outline-none transition focus:border-primary-600 focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-400 ${
                error ? 'border-red-500' : 'border-gray-200'
              }`}
              placeholder={'0'.repeat(length)}
            />
            {index < segments.length - 1 && (
              <span className="shrink-0 text-sm font-semibold text-gray-400">-</span>
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
