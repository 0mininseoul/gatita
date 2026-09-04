import { getDestinationOptions, type LocationType } from '@/lib/supabase'
import {
  getOriginRoomInventory,
  getRouteRoomInventory,
  type InventoryRoom,
} from '@/lib/roomInventory'

export const DORMITORY_REQUEST_DESTINATION: LocationType = '제2기숙사'

export type DormitoryDestinationMode = 'fixed' | 'selectable'

export type DormitoryRequestAvailability = {
  showBanner: boolean
  destinationMode: DormitoryDestinationMode
  fixedDestination: LocationType | null
}

export type DormitoryRecipientProfile = {
  user_id: string
  is_dormitory_resident: boolean | null
  push_enabled: boolean
}

export function shouldShowDormitoryRequestBanner(
  isDormitoryResident: boolean | null | undefined,
  availability: Pick<DormitoryRequestAvailability, 'showBanner'>,
) {
  return isDormitoryResident === true && availability.showBanner
}

export function getDormitoryRequestBannerTitle(fromLocation: LocationType) {
  return fromLocation === DORMITORY_REQUEST_DESTINATION
    ? '혹시 역으로 가시나요?'
    : '혹시 기숙사 가시나요?'
}

export function getDormitoryRequestAvailability(
  rooms: InventoryRoom[],
  fromLocation: LocationType,
  now = new Date(),
): DormitoryRequestAvailability {
  if (fromLocation === DORMITORY_REQUEST_DESTINATION) {
    return {
      showBanner: !getOriginRoomInventory(rooms, fromLocation, now).hasJoinableRoom,
      destinationMode: 'selectable',
      fixedDestination: null,
    }
  }

  if (fromLocation === '가천대역_1번출구' || fromLocation === '가천대학교_정문') {
    return {
      showBanner: !getRouteRoomInventory(
        rooms,
        fromLocation,
        DORMITORY_REQUEST_DESTINATION,
        now,
      ).hasJoinableRoom,
      destinationMode: 'fixed',
      fixedDestination: DORMITORY_REQUEST_DESTINATION,
    }
  }

  return {
    showBanner: false,
    destinationMode: 'fixed',
    fixedDestination: null,
  }
}

export function getDormitoryRequestDestinationOptions(fromLocation: LocationType) {
  return getDestinationOptions(fromLocation)
}

export function mergeDormitoryRequestRecipientIds(
  routeRecipientIds: string[],
  residentProfiles: DormitoryRecipientProfile[],
  creatorId: string,
) {
  const recipientIds = new Set(routeRecipientIds)

  residentProfiles.forEach((profile) => {
    if (profile.is_dormitory_resident === true && profile.push_enabled === true) {
      recipientIds.add(profile.user_id)
    }
  })

  recipientIds.delete(creatorId)
  return Array.from(recipientIds)
}
