export type BankOption = {
  id: string
  name: string
  icon: string
  color: string
  logoSrc?: string
  segments: number[]
  placeholder: string
}

export const CUSTOM_BANK_ACCOUNT_SEGMENTS = [4, 4, 4, 4]

export const BANK_OPTIONS: BankOption[] = [
  {
    id: 'kakaobank',
    name: '카카오뱅크',
    icon: 'K',
    color: '#ffe500',
    logoSrc: 'https://www.kakaobank.com/favicon.ico',
    segments: [4, 2, 7],
    placeholder: 'XXXX-XX-XXXXXXX',
  },
  {
    id: 'tossbank',
    name: '토스뱅크',
    icon: 'T',
    color: '#3182f6',
    logoSrc: 'https://static.toss.im/icons/png/4x/icon-toss-logo.png',
    segments: [4, 4, 4],
    placeholder: 'XXXX-XXXX-XXXX',
  },
  {
    id: 'kb',
    name: 'KB국민은행',
    icon: 'KB',
    color: '#f7c600',
    logoSrc: 'https://www.kbstar.com/favicon.ico',
    segments: [6, 2, 6],
    placeholder: 'XXXXXX-XX-XXXXXX',
  },
  {
    id: 'shinhan',
    name: '신한은행',
    icon: 'S',
    color: '#0046ff',
    logoSrc: 'https://www.shinhan.com/favicon.ico',
    segments: [3, 3, 6],
    placeholder: 'XXX-XXX-XXXXXX',
  },
  {
    id: 'woori',
    name: '우리은행',
    icon: 'W',
    color: '#1898d5',
    logoSrc: 'https://www.wooribank.com/favicon.ico',
    segments: [4, 3, 6],
    placeholder: 'XXXX-XXX-XXXXXX',
  },
  {
    id: 'hana',
    name: '하나은행',
    icon: 'H',
    color: '#00a78e',
    logoSrc: 'https://www.kebhana.com/favicon.ico',
    segments: [3, 6, 5],
    placeholder: 'XXX-XXXXXX-XXXXX',
  },
  {
    id: 'nh',
    name: 'NH농협은행',
    icon: 'NH',
    color: '#0a8f3c',
    logoSrc: 'https://banking.nonghyup.com/favicon.ico',
    segments: [3, 4, 4, 2],
    placeholder: 'XXX-XXXX-XXXX-XX',
  },
  {
    id: 'ibk',
    name: 'IBK기업은행',
    icon: 'IBK',
    color: '#0066b3',
    logoSrc: 'https://www.ibk.co.kr/favicon.ico',
    segments: [3, 6, 2, 3],
    placeholder: 'XXX-XXXXXX-XX-XXX',
  },
  {
    id: 'kbank',
    name: '케이뱅크',
    icon: 'K',
    color: '#111827',
    logoSrc: 'https://www.kbanknow.com/favicon.ico',
    segments: [3, 3, 6],
    placeholder: 'XXX-XXX-XXXXXX',
  },
  {
    id: 'sc',
    name: 'SC제일은행',
    icon: 'SC',
    color: '#0f8f55',
    logoSrc: 'https://www.standardchartered.co.kr/favicon.ico',
    segments: [3, 2, 6],
    placeholder: 'XXX-XX-XXXXXX',
  },
]

export const DEFAULT_BANK_OPTION = BANK_OPTIONS[0]

export function getBankOption(bankName?: string | null) {
  return BANK_OPTIONS.find((bank) => bank.name === bankName) ?? null
}

export function getBankOptionOrDefault(bankName?: string | null) {
  return getBankOption(bankName) ?? DEFAULT_BANK_OPTION
}

export function getAccountSegmentsForBank(bankName?: string | null) {
  return getBankOption(bankName)?.segments ?? CUSTOM_BANK_ACCOUNT_SEGMENTS
}

export function splitAccountNumberForBank(bankName: string | null | undefined, accountNumber: string) {
  const segments = getAccountSegmentsForBank(bankName)
  const digits = accountNumber.replace(/\D/g, '')
  let cursor = 0

  return segments.map((length) => {
    const value = digits.slice(cursor, cursor + length)
    cursor += length
    return value
  })
}

export function joinAccountSegments(segments: string[]) {
  return segments.map((segment) => segment.replace(/\D/g, '')).join('-')
}

export function formatAccountNumberForBank(bankName: string | null | undefined, accountNumber: string) {
  return splitAccountNumberForBank(bankName, accountNumber)
    .map((segment) => segment.replace(/\D/g, ''))
    .filter(Boolean)
    .join('-')
}

export function isAccountNumberCompleteForBank(bankName: string | null | undefined, accountNumber: string) {
  const bank = getBankOption(bankName)
  const digits = accountNumber.replace(/\D/g, '')

  if (!bank) {
    return digits.length >= 8 && digits.length <= 16
  }

  const expectedLength = bank.segments.reduce((sum, length) => sum + length, 0)

  return digits.length === expectedLength
}
