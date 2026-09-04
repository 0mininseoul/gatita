import { isRoomJoinable, type LocationType } from '@/lib/supabase'

export type InventoryRoom = {
  from_location: LocationType
  departure_date: string
  departure_time: string
  max_participants: number
  participants?: Array<{ id: string }>
}

export type OriginRoomInventory = {
  visibleRoomCount: number
  joinableRoomCount: number
  hasJoinableRoom: boolean
}

export function getOriginRoomInventory(
  rooms: InventoryRoom[],
  fromLocation: LocationType,
  now = new Date(),
): OriginRoomInventory {
  const visibleRooms = rooms.filter((room) => room.from_location === fromLocation)
  const joinableRoomCount = visibleRooms.filter((room) => (
    isRoomJoinable(room.departure_date, room.departure_time, now)
    && (room.participants?.length ?? 0) < room.max_participants
  )).length

  return {
    visibleRoomCount: visibleRooms.length,
    joinableRoomCount,
    hasJoinableRoom: joinableRoomCount > 0,
  }
}
