import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { withAxiomRoute } from '@/lib/axiom/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { LOCATIONS, type LocationType } from '@/lib/supabase'

// web-push 는 Node crypto 를 쓰므로 Edge 가 아닌 Node 런타임에서 실행.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:admin@gatita.kro.kr'
const DISPATCH_SECRET = process.env.PUSH_DISPATCH_SECRET

let vapidConfigured = false
function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  vapidConfigured = true
  return true
}

function routeLabel(from?: LocationType, to?: LocationType): string {
  if (!from || !to) return ''
  return `${LOCATIONS[from] ?? ''} → ${LOCATIONS[to] ?? ''}`.trim()
}

// DB 트리거(pg_net)가 새 메시지 발생 시 호출한다. 공유 시크릿으로만 접근 허용.
async function dispatchPush(request: Request) {
  if (!DISPATCH_SECRET || request.headers.get('x-push-secret') !== DISPATCH_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (!ensureVapidConfigured()) {
    return NextResponse.json({ error: 'push not configured' }, { status: 500 })
  }

  let messageId: string | undefined
  try {
    const body = await request.json()
    messageId = body?.message_id
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 })
  }

  if (!messageId) {
    return NextResponse.json({ error: 'message_id required' }, { status: 400 })
  }

  const admin = createAdminSupabase()

  const { data: message } = await admin
    .from('messages')
    .select('id, room_id, user_id, content')
    .eq('id', messageId)
    .maybeSingle()

  if (!message) {
    return NextResponse.json({ ok: true, skipped: 'message-not-found' })
  }

  const [{ data: sender }, { data: room }, { data: participants }] = await Promise.all([
    admin.from('users').select('nickname').eq('id', message.user_id).maybeSingle(),
    admin
      .from('chat_rooms')
      .select('from_location, to_location')
      .eq('id', message.room_id)
      .maybeSingle(),
    admin.from('room_participants').select('user_id').eq('room_id', message.room_id),
  ])

  // 발신자를 제외한 참여자에게만 발송
  const recipientIds = (participants ?? [])
    .map((participant) => participant.user_id)
    .filter((userId) => userId !== message.user_id)

  if (recipientIds.length === 0) {
    return NextResponse.json({ ok: true, recipients: 0 })
  }

  const { data: subscriptions } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('user_id', recipientIds)

  if (!subscriptions || subscriptions.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 })
  }

  const senderName = sender?.nickname?.trim() || '익명'
  const label = routeLabel(room?.from_location, room?.to_location)
  const preview = (message.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)

  const payload = JSON.stringify({
    title: label ? `${senderName} · ${label}` : senderName,
    body: preview || '새 메시지가 도착했어요',
    url: `/rooms/${message.room_id}`,
    roomId: message.room_id,
    tag: `room-${message.room_id}`,
  })

  const staleEndpoints: string[] = []

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        )
      } catch (error) {
        const statusCode = (error as { statusCode?: number })?.statusCode
        // 만료/삭제된 구독은 정리
        if (statusCode === 404 || statusCode === 410) {
          staleEndpoints.push(sub.endpoint)
        } else {
          console.error('web-push send failed:', statusCode, (error as { body?: string })?.body)
        }
      }
    }),
  )

  if (staleEndpoints.length > 0) {
    await admin.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
  }

  return NextResponse.json({ ok: true, sent: subscriptions.length - staleEndpoints.length })
}

export const POST = withAxiomRoute(dispatchPush)
