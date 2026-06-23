import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

function readProjectFile(path) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

test('PWA install sync API marks only the authenticated user as installed', () => {
  const routePath = 'app/api/profile/pwa-install/route.ts'

  assert.equal(existsSync(join(process.cwd(), routePath)), true)

  const source = readProjectFile(routePath)

  assert.match(source, /withAxiomRoute/)
  assert.match(source, /createClient/)
  assert.match(source, /auth\.getUser\(\)/)
  assert.match(source, /createAdminSupabase/)
  assert.match(source, /\.from\('user_private_profiles'\)[\s\S]*\.update\(\{\s*pwa_installed:\s*true\s*\}\)[\s\S]*\.eq\('user_id', authUser\.id\)/)
  assert.match(source, /return NextResponse\.json\(\{\s*ok:\s*true\s*\}\)/)
})

test('installed PWA openings sync to Supabase even when analytics localStorage already exists', () => {
  const source = readProjectFile('components/HomeClient.tsx')

  assert.match(source, /syncPwaInstalledToSupabase/)
  assert.match(source, /fetch\('\/api\/profile\/pwa-install'/)
  assert.match(source, /method:\s*'POST'/)
  assert.match(source, /if \(!isInstalled\(\)\) return[\s\S]*syncPwaInstalledToSupabase\(\)/)
  assert.match(source, /requireInstalledDisplayMode/)
  assert.match(source, /handleAppInstalled[\s\S]*syncPwaInstalledToSupabase\(\{\s*requireInstalledDisplayMode:\s*false\s*\}\)/)

  const standaloneEffectIndex = source.indexOf('if (!isInstalled()) return')
  const analyticsStorageIndex = source.indexOf('PWA_INSTALLED_DETECTED_STORAGE_KEY', standaloneEffectIndex)
  const syncIndex = source.indexOf('syncPwaInstalledToSupabase()', standaloneEffectIndex)

  assert.ok(syncIndex !== -1, 'standalone PWA effect should call the Supabase sync helper')
  assert.ok(
    syncIndex < analyticsStorageIndex,
    'Supabase sync should run before analytics localStorage gating so existing installed users are retried',
  )
})
