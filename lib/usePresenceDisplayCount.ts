'use client'

import { useEffect, useState } from 'react'
import {
  getMillisecondsUntilNextPresenceOffsetChange,
  getRandomPresenceOffset,
} from '@/lib/presenceDisplay'

type PresenceUser = {
  id: string
  nickname?: string
}

export function usePresenceDisplayCount(
  supabase: any,
  channelName: string | null,
  user: PresenceUser | null
) {
  const [peerCount, setPeerCount] = useState(0)
  const [displayOffset, setDisplayOffset] = useState(() => getRandomPresenceOffset())

  useEffect(() => {
    let timeoutId: number

    const refreshOffset = () => {
      setDisplayOffset(getRandomPresenceOffset())
      timeoutId = window.setTimeout(
        refreshOffset,
        getMillisecondsUntilNextPresenceOffsetChange(),
      )
    }

    timeoutId = window.setTimeout(
      refreshOffset,
      getMillisecondsUntilNextPresenceOffsetChange(),
    )

    return () => window.clearTimeout(timeoutId)
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

  // 본인은 항상 포함(+1)하고, 보정값은 KST 시간표 구간이 바뀐 때만 갱신한다.
  return peerCount + 1 + displayOffset
}
