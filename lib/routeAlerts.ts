// 경로 구독 알림의 발송 조건 판정. 순수 함수만 두어 서버(dispatch 라우트)와
// 클라이언트(/routes 미리보기) 양쪽에서 공유한다. DB·네트워크 의존 없음.

export type RoomForAlert = {
  departure_date: string   // 'YYYY-MM-DD'
  departure_time: string   // 'HH:MM:SS'
}

export type RouteSubscription = {
  notify_enabled: boolean
  notify_from: string | null
  notify_to: string | null
  notify_weekdays: number[]   // 0=일 … 6=토
}

// 종일 구독에 한해 적용하는 기본 조용 시간(KST). 아무 설정도 하지 않은 이용자를
// 새벽에 깨우지 않기 위한 안전장치이며, 명시적 시간대 설정은 이 규칙을 무시한다.
const QUIET_START_HOUR = 2
const QUIET_END_HOUR = 6

function toMinutes(time: string): number {
  const [hour, minute] = time.split(':')
  return Number(hour) * 60 + Number(minute)
}

export function isWithinNotifyWindow(
  departureTime: string,
  from: string | null,
  to: string | null,
): boolean {
  if (!from || !to) return true

  const target = toMinutes(departureTime)
  const start = toMinutes(from)
  const end = toMinutes(to)

  // from > to 이면 자정을 넘는 구간 (예: 22:00~02:00)
  if (start > end) return target >= start || target <= end

  return target >= start && target <= end
}

export function isNotifyWeekday(departureDate: string, weekdays: number[]): boolean {
  // 날짜 문자열을 KST 정오로 고정해 해석한다. 정오를 쓰면 어떤 런타임 타임존에서도
  // 날짜 경계를 넘지 않아 요일이 밀리지 않는다.
  const day = new Date(`${departureDate}T12:00:00+09:00`).getUTCDay()
  return weekdays.includes(day)
}

export function isQuietHourForAllDay(now: Date): boolean {
  // KST 시각을 런타임 타임존과 무관하게 계산한다.
  const kstHour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul',
      hour: '2-digit',
      hour12: false,
    }).format(now),
  ) % 24

  return kstHour >= QUIET_START_HOUR && kstHour < QUIET_END_HOUR
}

export function shouldNotify(
  room: RoomForAlert,
  sub: RouteSubscription,
  now: Date = new Date(),
): boolean {
  if (!sub.notify_enabled) return false
  if (!isNotifyWeekday(room.departure_date, sub.notify_weekdays)) return false
  if (!isWithinNotifyWindow(room.departure_time, sub.notify_from, sub.notify_to)) return false

  const isAllDay = !sub.notify_from || !sub.notify_to
  if (isAllDay && isQuietHourForAllDay(now)) return false

  return true
}
