#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const VALID_COMMANDS = new Set(['upsert', 'list'])
const CATALOG_PATH = 'lib/previewTestAccounts.json'
const PRIVATE_PROFILE_BY_KEY = {
  'preview-1': {
    phone: '010-9101-0001',
    bank_name: '카카오뱅크',
    account_number: '3333010000001',
    account_holder: '김하나',
  },
  'preview-2': {
    phone: '010-9102-0002',
    bank_name: '토스뱅크',
    account_number: '100010002003',
    account_holder: '이도윤',
  },
  'preview-3': {
    phone: '010-9103-0003',
    bank_name: 'KB국민은행',
    account_number: '12345612000034',
    account_holder: '박서연',
  },
}

function usage() {
  return `Usage:
  npm run preview:test-accounts -- upsert
  npm run preview:test-accounts -- list

Environment:
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  PREVIEW_TEST_ACCOUNT_PASSWORD

The script reads .env.local, then lets shell environment variables override it.
`
}

function parseArgs(argv) {
  const command = argv.find((arg) => !arg.startsWith('--')) ?? 'upsert'
  return {
    command,
    help: argv.includes('--help') || argv.includes('-h'),
  }
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}

  const env = {}
  const content = fs.readFileSync(filePath, 'utf8')

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const separator = trimmed.indexOf('=')
    if (separator === -1) continue

    const key = trimmed.slice(0, separator).trim()
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
    env[key] = value
  }

  return env
}

function getEnv(envFile, key) {
  return process.env[key] || envFile[key] || ''
}

function loadAccounts() {
  const catalogPath = path.join(process.cwd(), CATALOG_PATH)
  const accounts = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))

  return accounts.map((account) => ({
    ...account,
    ...PRIVATE_PROFILE_BY_KEY[account.key],
  }))
}

function createSupabaseAdmin(envFile) {
  const supabaseUrl = getEnv(envFile, 'NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = getEnv(envFile, 'SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

async function listAllAuthUsers(supabase) {
  const users = []

  for (let page = 1; page < 100; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error

    users.push(...(data.users ?? []))
    if (!data.users || data.users.length < 1000) break
  }

  return users
}

async function findAuthUserByEmail(supabase, email) {
  const users = await listAllAuthUsers(supabase)
  return users.find((user) => user.email?.toLowerCase() === email.toLowerCase()) ?? null
}

async function upsertAuthUser(supabase, account, password) {
  const userMetadata = {
    name: `${account.name}/${account.department}`,
    full_name: `${account.name}/${account.department}`,
    display_name: `${account.name}/${account.department}`,
  }
  const existingUser = await findAuthUserByEmail(supabase, account.email)

  if (existingUser) {
    const { data, error } = await supabase.auth.admin.updateUserById(existingUser.id, {
      password,
      email_confirm: true,
      user_metadata: userMetadata,
    })
    if (error) throw error

    return { user: data.user, created: false }
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: account.email,
    password,
    email_confirm: true,
    user_metadata: userMetadata,
  })
  if (error) throw error

  return { user: data.user, created: true }
}

async function upsertAppProfiles(supabase, account, userId) {
  const now = new Date().toISOString()

  const { error: publicError } = await supabase
    .from('users')
    .upsert({
      id: userId,
      nickname: account.nickname,
      department: account.department,
      avatar_url: null,
    }, { onConflict: 'id' })
  if (publicError) throw publicError

  const { error: privateError } = await supabase
    .from('user_private_profiles')
    .upsert({
      user_id: userId,
      email: account.email,
      name: account.name,
      phone: account.phone,
      phone_verified_at: now,
      status: 'active',
      is_admin: false,
      bank_name: account.bank_name,
      account_number: account.account_number,
      account_holder: account.account_holder,
      onboarded_at: now,
    }, { onConflict: 'user_id' })
  if (privateError) throw privateError
}

async function upsertPreviewAccounts(supabase, envFile) {
  const password = getEnv(envFile, 'PREVIEW_TEST_ACCOUNT_PASSWORD')
  if (!password) {
    throw new Error('Missing PREVIEW_TEST_ACCOUNT_PASSWORD.')
  }

  const results = []
  for (const account of loadAccounts()) {
    const { user, created } = await upsertAuthUser(supabase, account, password)
    if (!user?.id) throw new Error(`Auth user was not returned for ${account.email}.`)

    await upsertAppProfiles(supabase, account, user.id)
    results.push({
      key: account.key,
      email: account.email,
      nickname: account.nickname,
      authUserId: user.id,
      created,
      profileCompleted: true,
    })
  }

  return results
}

async function listPreviewAccounts(supabase) {
  const results = []

  for (const account of loadAccounts()) {
    const authUser = await findAuthUserByEmail(supabase, account.email)
    const { data: privateProfile, error } = authUser
      ? await supabase
        .from('user_private_profiles')
        .select('user_id,status,onboarded_at')
        .eq('user_id', authUser.id)
        .maybeSingle()
      : { data: null, error: null }

    if (error) throw error

    results.push({
      key: account.key,
      email: account.email,
      nickname: account.nickname,
      found: Boolean(authUser),
      authUserId: authUser?.id ?? null,
      status: privateProfile?.status ?? null,
      profileCompleted: Boolean(privateProfile?.onboarded_at),
    })
  }

  return results
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }

  if (!VALID_COMMANDS.has(args.command)) {
    throw new Error(`Unknown command "${args.command}".\n${usage()}`)
  }

  const envFile = loadEnvFile(path.join(process.cwd(), '.env.local'))
  const supabase = createSupabaseAdmin(envFile)
  const result = args.command === 'list'
    ? await listPreviewAccounts(supabase)
    : await upsertPreviewAccounts(supabase, envFile)

  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
