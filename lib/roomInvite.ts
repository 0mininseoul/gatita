type RoomInvitePayloadInput = {
  origin: string
  roomId: string
  fromLabel: string
  toLabel: string
  departureDate: string
  departureTime: string
  participantCount: number
  maxParticipants: number
}

function formatInviteDateTime(departureDate: string, departureTime: string) {
  const [, month, day] = departureDate.split('-').map(Number)
  const time = departureTime.slice(0, 5)

  if (!Number.isFinite(month) || !Number.isFinite(day)) {
    return time
  }

  return `${month}월 ${day}일 ${time}`
}

export function buildRoomInviteUrl(origin: string, roomId: string) {
  const url = new URL(`/rooms/${roomId}`, origin)
  url.searchParams.set('invite', '1')
  return url.toString()
}

export function buildRoomInviteSharePayload(input: RoomInvitePayloadInput) {
  const url = buildRoomInviteUrl(input.origin, input.roomId)
  const dateTime = formatInviteDateTime(input.departureDate, input.departureTime)

  return {
    title: '같이타 초대',
    text: [
      `[같이타] ${dateTime}`,
      `${input.fromLabel} → ${input.toLabel} 같이 갈 사람?`,
      `현재 ${input.participantCount}/${input.maxParticipants}명 참여 중`,
      `가천대 계정으로 바로 입장하기: ${url}`,
    ].join('\n'),
    url,
  }
}
