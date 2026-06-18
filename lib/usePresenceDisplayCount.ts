'use client'

import { useEffect, useState } from 'react'

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
  const [displayOffset, setDisplayOffset] = useState(1)

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setDisplayOffset((current) => (current === 1 ? 2 : 1))
    }, 20000)

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

  return peerCount + displayOffset
}
