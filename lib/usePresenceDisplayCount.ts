'use client'

import { useEffect, useState } from 'react'

type PresenceUser = {
  id: string
  nickname?: string
}

// 낮 시간대에만 붙이는 랜덤 패딩(0~5). 0이면 실제 인원 그대로 노출.
function getRandomPresenceOffset() {
  return Math.floor(Math.random() * 6)
}

// KST(UTC+9) 기준 00:00~08:30 심야 구간에는 패딩 없이 실제 인원만 보여준다.
function isRealCountWindow(now: Date = new Date()) {
  const kstMinutes = (now.getUTCHours() * 60 + now.getUTCMinutes() + 9 * 60) % (24 * 60)
  return kstMinutes < 8 * 60 + 30
}

export function usePresenceDisplayCount(
  supabase: any,
  channelName: string | null,
  user: PresenceUser | null
) {
  const [peerCount, setPeerCount] = useState(0)
  const [displayOffset, setDisplayOffset] = useState(() =>
    isRealCountWindow() ? 0 : getRandomPresenceOffset()
  )

  useEffect(() => {
    const applyOffset = () => {
      setDisplayOffset(isRealCountWindow() ? 0 : getRandomPresenceOffset())
    }
    applyOffset()
    const intervalId = window.setInterval(applyOffset, 20000)

    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    if (!supabase || !channelName || !user?.id) {
      setPeerCount(0)
      return
    }

    let isActive = true
    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: user.id,
        },
      },
    })

    const updatePeerCount = () => {
      const state = channel.presenceState()
      const userIds = new Set<string>()

      Object.values(state).forEach((presences: any) => {
        presences.forEach((presence: any) => {
          if (presence?.user_id) {
            userIds.add(presence.user_id)
          }
        })
      })

      userIds.delete(user.id)

      if (isActive) {
        setPeerCount(userIds.size)
      }
    }

    channel
      .on('presence', { event: 'sync' }, updatePeerCount)
      .on('presence', { event: 'join' }, updatePeerCount)
      .on('presence', { event: 'leave' }, updatePeerCount)
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: user.id,
            nickname: user.nickname ?? '',
            online_at: new Date().toISOString(),
          })
          updatePeerCount()
        }
      })

    return () => {
      isActive = false
      channel.untrack()
      supabase.removeChannel(channel)
      setPeerCount(0)
    }
  }, [channelName, supabase, user?.id, user?.nickname])

  // 본인은 항상 포함(+1). 심야 구간이면 displayOffset이 0이라 실제 인원만,
  // 혼자여도 최소 1명으로 보인다.
  return peerCount + 1 + displayOffset
}
