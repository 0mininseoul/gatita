import accounts from './previewTestAccounts.json'

export type PreviewTestAccount = {
  key: string
  email: string
  name: string
  nickname: string
  department: string
}

export const PREVIEW_TEST_ACCOUNTS = accounts as PreviewTestAccount[]

export function getPreviewTestAccount(key: string) {
  return PREVIEW_TEST_ACCOUNTS.find((account) => account.key === key) ?? null
}

export function isPreviewTestLoginEnabled() {
  return process.env.NEXT_PUBLIC_ENABLE_PREVIEW_TEST_LOGIN === 'true'
}
