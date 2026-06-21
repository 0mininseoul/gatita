#!/usr/bin/env node

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const VALID_COMMANDS = new Set(['inspect', 'prepare', 'restore-admin'])
const GACHON_DOMAIN = 'gachon.ac.kr'
const SNAPSHOT_DIR = '.secrets/smoke-users'

function usage() {
  return `Usage:
  npm run smoke:user -- inspect --email ym5373@gachon.ac.kr
  npm run smoke:user -- prepare --email ym5373@gachon.ac.kr --confirm
  npm run smoke:user -- restore-admin --email ym5373@gachon.ac.kr --confirm

Commands:
  inspect        Read the current Supabase app/auth state for one user.
  prepare        Reset app-side onboarding state without deleting the Auth user.
  restore-admin  Restore admin access after completing onboarding again.

Options:
  --email <email>  Target Gachon Google account. Can also use SMOKE_TEST_EMAIL.
  --confirm        Required for prepare and restore-admin.
`
}

function parseArgs(argv) {
  const args = [...argv]
  const command = args.find((arg) => !arg.startsWith('--')) ?? 'inspect'
  const parsed = {
    command,
    email: process.env.SMOKE_TEST_EMAIL ?? '',
    confirm: false,
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--email') {
      parsed.email = args[index + 1] ?? ''
      index += 1
    } else if (arg === '--confirm') {
      parsed.confirm = true
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true
    }
  }

  return parsed
}

function loadEnv(filePath) {
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

function requireEmail(value) {
  const email = value.trim().toLowerCase()
  if (!email) throw new Error('Missing --email or SMOKE_TEST_EMAIL.')
  if (!email.endsWith(`@${GACHON_DOMAIN}`)) {
    throw new Error(`Smoke user must be a ${GACHON_DOMAIN} Google account.`)
  }
  return email
}

function snapshotPathForEmail(email) {
  const digest = createHash('sha256').update(email).digest('hex').slice(0, 16)
  return path.join(SNAPSHOT_DIR, `${digest}.json`)
}

function createSupabaseAdmin() {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) {
    throw new Error('Missing .env.local with Supabase admin credentials.')
  }

  const env = loadEnv(envPath)
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.')
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

function authProviders(authUser) {
  return [
    ...(Array.isArray(authUser.app_metadata?.providers) ? authUser.app_metadata.providers : []),
    ...(Array.isArray(authUser.identities) ? authUser.identities.map((identity) => identity.provider) : []),
  ].filter(Boolean)
}

async function findAuthUserByEmail(supabase, email) {
  const users = await listAllAuthUsers(supabase)
  return users.find((user) => user.email?.toLowerCase() === email) ?? null
}

async function maybeSingle(supabase, table, select, column, value) {
  const { data, error } = await supabase
    .from(table)
    .select(select)
    .eq(column, value)
    .maybeSingle()

  if (error) throw error
  return data
}

async function exactCount(supabase, table, column, value) {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq(column, value)

  if (error) throw error
  return count ?? 0
}

async function getState(supabase, email) {
  const authUser = await findAuthUserByEmail(supabase, email)

  if (!authUser) {
    return {
      email,
      found: false,
    }
  }

  const publicProfile = await maybeSingle(
    supabase,
    'users',
    'id,nickname,department,avatar_url,created_at,updated_at',
    'id',
    authUser.id,
  )
  const privateProfile = await maybeSingle(
    supabase,
    'user_private_profiles',
    'user_id,email,status,is_admin,created_at,updated_at',
    'user_id',
    authUser.id,
  )
  const payoutAccount = await maybeSingle(
    supabase,
    'user_payout_accounts',
    'user_id,bank_name,created_at,updated_at',
    'user_id',
    authUser.id,
  )

  return {
    email,
    found: true,
    authUserId: authUser.id,
    providers: [...new Set(authProviders(authUser))],
    hasPublicProfile: Boolean(publicProfile),
    hasPrivateProfile: Boolean(privateProfile),
    hasPayoutAccount: Boolean(payoutAccount),
    profileCompleted: Boolean(publicProfile && privateProfile && payoutAccount),
    isAdmin: Boolean(privateProfile?.is_admin),
    status: privateProfile?.status ?? null,
    counts: {
      createdRooms: await exactCount(supabase, 'chat_rooms', 'created_by', authUser.id),
      roomMemberships: await exactCount(supabase, 'room_participants', 'user_id', authUser.id),
      messages: await exactCount(supabase, 'messages', 'user_id', authUser.id),
      reportsByUser: await exactCount(supabase, 'reports', 'reporter_id', authUser.id),
      reportsAboutUser: await exactCount(supabase, 'reports', 'reported_id', authUser.id),
      moderationActionsForUser: await exactCount(supabase, 'user_moderation_actions', 'user_id', authUser.id),
      favorites: await exactCount(supabase, 'favorites', 'user_id', authUser.id),
    },
  }
}

async function deleteByColumn(supabase, table, column, value) {
  const { data, error } = await supabase
    .from(table)
    .delete()
    .eq(column, value)
    .select(column)

  if (error) throw error
  return data?.length ?? 0
}

async function removeProfilePhotos(supabase, userId) {
  const { data, error } = await supabase.storage.from('profile-photos').list(userId, { limit: 100 })
  if (error && error.message !== 'The resource was not found') throw error

  const paths = (data ?? []).map((object) => `${userId}/${object.name}`)
  if (paths.length === 0) return 0

  const { error: removeError } = await supabase.storage.from('profile-photos').remove(paths)
  if (removeError) throw removeError
  return paths.length
}

async function prepare(supabase, email) {
  const before = await getState(supabase, email)
  if (!before.found) throw new Error(`Auth user not found: ${email}`)
  if (!before.providers.includes('google')) {
    throw new Error('Smoke user must authenticate through Google.')
  }

  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true })
  fs.writeFileSync(snapshotPathForEmail(email), `${JSON.stringify({
    email,
    authUserId: before.authUserId,
    wasAdmin: before.isAdmin,
    status: before.status,
    preparedAt: new Date().toISOString(),
  }, null, 2)}\n`)

  const deleted = {
    favorites: await deleteByColumn(supabase, 'favorites', 'user_id', before.authUserId),
    reportsByUser: await deleteByColumn(supabase, 'reports', 'reporter_id', before.authUserId),
    reportsAboutUser: await deleteByColumn(supabase, 'reports', 'reported_id', before.authUserId),
    moderationActionsForUser: await deleteByColumn(supabase, 'user_moderation_actions', 'user_id', before.authUserId),
    messages: await deleteByColumn(supabase, 'messages', 'user_id', before.authUserId),
    roomMemberships: await deleteByColumn(supabase, 'room_participants', 'user_id', before.authUserId),
    createdRooms: await deleteByColumn(supabase, 'chat_rooms', 'created_by', before.authUserId),
    payoutAccount: await deleteByColumn(supabase, 'user_payout_accounts', 'user_id', before.authUserId),
    privateProfile: await deleteByColumn(supabase, 'user_private_profiles', 'user_id', before.authUserId),
    profilePhotos: await removeProfilePhotos(supabase, before.authUserId),
  }

  if (before.hasPublicProfile) {
    const { error } = await supabase
      .from('users')
      .update({ avatar_url: null })
      .eq('id', before.authUserId)
    if (error) throw error
  }

  const after = await getState(supabase, email)
  return { before, deleted, after, snapshot: snapshotPathForEmail(email) }
}

async function restoreAdmin(supabase, email) {
  const snapshotPath = snapshotPathForEmail(email)
  if (!fs.existsSync(snapshotPath)) {
    throw new Error(`Missing admin snapshot: ${snapshotPath}`)
  }

  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
  if (!snapshot.wasAdmin) {
    return { restored: false, reason: 'Snapshot says this user was not admin before prepare.' }
  }

  const state = await getState(supabase, email)
  if (!state.found) throw new Error(`Auth user not found: ${email}`)
  if (!state.hasPrivateProfile) {
    throw new Error('Complete onboarding first, then run restore-admin.')
  }

  const { error } = await supabase
    .from('user_private_profiles')
    .update({ is_admin: true, status: snapshot.status ?? 'active' })
    .eq('user_id', state.authUserId)

  if (error) throw error

  return { restored: true, after: await getState(supabase, email) }
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

  const email = requireEmail(args.email)
  const supabase = createSupabaseAdmin()

  if ((args.command === 'prepare' || args.command === 'restore-admin') && !args.confirm) {
    throw new Error(`Refusing to run ${args.command} without --confirm.`)
  }

  if (args.command === 'inspect') {
    console.log(JSON.stringify(await getState(supabase, email), null, 2))
    return
  }

  if (args.command === 'prepare') {
    console.log(JSON.stringify(await prepare(supabase, email), null, 2))
    return
  }

  console.log(JSON.stringify(await restoreAdmin(supabase, email), null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
