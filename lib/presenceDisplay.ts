export type PresenceOffsetRange = {
  min: number
  max: number
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

export function getPresenceOffsetRange(now = new Date()): PresenceOffsetRange {
  const kst = new Date(now.getTime() + KST_OFFSET_MS)
  const day = kst.getUTCDay()
  const hour = kst.getUTCHours()

  if (hour < 8) return { min: 0, max: 0 }

  const isWeekday = day >= 1 && day <= 5
  if (isWeekday && hour >= 9 && hour < 18) {
    return { min: 1, max: 5 }
  }

  return { min: 0, max: 3 }
}

export function getRandomPresenceOffset(
  now = new Date(),
  random: () => number = Math.random,
) {
  const { min, max } = getPresenceOffsetRange(now)
  return min + Math.floor(random() * (max - min + 1))
}
