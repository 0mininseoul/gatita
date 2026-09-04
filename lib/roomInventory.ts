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

function summarizeRoomInventory(rooms: InventoryRoom[], now: Date): OriginRoomInventory {
  const joinableRoomCount = rooms.filter((room) => (
    isRoomJoinable(room.departure_date, room.departure_time, now)
    && (room.participants?.length ?? 0) < room.max_participants
  )).length

  return {
    visibleRoomCount: rooms.length,
    joinableRoomCount,
    hasJoinableRoom: joinableRoomCount > 0,
  }
}

export function getOriginRoomInventory(
  rooms: InventoryRoom[],
  fromLocation: LocationType,
  now = new Date(),
): OriginRoomInventory {
  const visibleRooms = rooms.filter((room) => room.from_location === fromLocation)
  return summarizeRoomInventory(visibleRooms, now)
}

export function getRouteRoomInventory(
  rooms: InventoryRoom[],
  fromLocation: LocationType,
  toLocation: LocationType,
  now = new Date(),
): OriginRoomInventory {
  const visibleRooms = rooms.filter((room) => (
    room.from_location === fromLocation && room.to_location === toLocation
  ))
  return summarizeRoomInventory(visibleRooms, now)
}
