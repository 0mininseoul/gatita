'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Clock, Compass, Minus, Plus, Users, X } from 'lucide-react'
import {
  getDepartureTimeOptions,
  getDestinationOptions,
  GACHON_GLOBAL_CAMPUS_BOUNDS,
  GACHON_GLOBAL_CAMPUS_CENTER,
  isRoomJoinable,
  LOCATION_ORDER,
  LOCATION_POINTS,
  LOCATIONS,
  LocationType,
} from '@/lib/supabase'
import { trackEvent } from '@/lib/analytics/client'

export type CampusMapRoom = {
  id: string
  from_location: LocationType
  to_location: LocationType
  departure_date: string
  departure_time: string
  max_participants: number
  participants?: Array<{
    id: string
    user_id?: string
  }>
}

type Stat = {
  roomCount: number
  nextTime: string | null
  nextSortKey: string | null
}

type CampusRouteMapProps = {
  rooms: CampusMapRoom[]
  onlineCount: number
  selectedFrom: LocationType | ''
  isCreatingRoom?: boolean
  isLoading?: boolean
  onSelectFrom: (location: LocationType | '') => void
  onCreateRoom: (room: {
    fromLocation: LocationType
    toLocation: LocationType
    departureTime: string
  }) => void | Promise<void>
  onJoinRoom: (roomId: string) => void
}

declare global {
  interface Window {
    kakao?: any
    __gatitaKakaoMapPromise?: Promise<any>
  }
}

const KAKAO_MAP_SDK_ID = 'gatita-kakao-map-sdk'
const MAX_MAP_LEVEL = 6
const MIN_MAP_LEVEL = 1

const emptyStat = (): Stat => ({
  roomCount: 0,
  nextTime: null,
  nextSortKey: null,
})

function getRoomSortKey(room: Pick<CampusMapRoom, 'departure_date' | 'departure_time'>) {
  return `${room.departure_date}T${room.departure_time.slice(0, 5)}`
}

function loadKakaoMaps(appKey: string) {
  if (window.kakao?.maps) {
    return new Promise<any>((resolve) => {
      window.kakao.maps.load(() => resolve(window.kakao))
    })
  }

  if (window.__gatitaKakaoMapPromise) {
    return window.__gatitaKakaoMapPromise
  }

  window.__gatitaKakaoMapPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(KAKAO_MAP_SDK_ID) as HTMLScriptElement | null

    const handleLoad = () => {
      if (!window.kakao?.maps) {
        reject(new Error('Kakao Maps SDK is unavailable.'))
        return
      }

      window.kakao.maps.load(() => resolve(window.kakao))
    }

    if (existingScript) {
      existingScript.addEventListener('load', handleLoad, { once: true })
      existingScript.addEventListener('error', () => reject(new Error('Kakao Maps SDK failed to load.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.id = KAKAO_MAP_SDK_ID
    script.async = true
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false`
    script.onload = handleLoad
    script.onerror = () => reject(new Error('Kakao Maps SDK failed to load.'))
    document.head.appendChild(script)
  })

  return window.__gatitaKakaoMapPromise
}

function clampMapToCampus(map: any, kakao: any) {
  const center = map.getCenter()
  const lat = center.getLat()
  const lng = center.getLng()
  const nextLat = Math.min(Math.max(lat, GACHON_GLOBAL_CAMPUS_BOUNDS.south), GACHON_GLOBAL_CAMPUS_BOUNDS.north)
  const nextLng = Math.min(Math.max(lng, GACHON_GLOBAL_CAMPUS_BOUNDS.west), GACHON_GLOBAL_CAMPUS_BOUNDS.east)

  if (lat !== nextLat || lng !== nextLng) {
    map.setCenter(new kakao.maps.LatLng(nextLat, nextLng))
  }

  if (map.getLevel() > MAX_MAP_LEVEL) {
    map.setLevel(MAX_MAP_LEVEL)
  }

  if (map.getLevel() < MIN_MAP_LEVEL) {
    map.setLevel(MIN_MAP_LEVEL)
  }
}

function buildStats(rooms: CampusMapRoom[]) {
  const originStats = new Map<LocationType, Stat>()

  LOCATION_ORDER.forEach((location) => {
    originStats.set(location, emptyStat())
  })

  rooms.forEach((room) => {
    const currentOriginStat = originStats.get(room.from_location) ?? emptyStat()
    const roomSortKey = getRoomSortKey(room)

    currentOriginStat.roomCount += 1
    currentOriginStat.nextTime =
      !currentOriginStat.nextSortKey || roomSortKey < currentOriginStat.nextSortKey
        ? room.departure_time
        : currentOriginStat.nextTime
    currentOriginStat.nextSortKey =
      !currentOriginStat.nextSortKey || roomSortKey < currentOriginStat.nextSortKey
        ? roomSortKey
        : currentOriginStat.nextSortKey
    originStats.set(room.from_location, currentOriginStat)
  })

  return { originStats }
}

function formatRoomTime(time: string | null) {
  if (!time) return ''
  return time.slice(0, 5)
}

export default function CampusRouteMap({
  rooms,
  onlineCount,
  selectedFrom,
  isCreatingRoom = false,
  isLoading = false,
  onSelectFrom,
  onCreateRoom,
  onJoinRoom,
}: CampusRouteMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const kakaoRef = useRef<any>(null)
  const markerRefs = useRef<any[]>([])
  const overlayRefs = useRef<any[]>([])
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'missing-key' | 'error'>('loading')
  const [focusedLocation, setFocusedLocation] = useState<LocationType | null>(selectedFrom || null)
  const [isCreateMode, setIsCreateMode] = useState(false)
  const [draftDestination, setDraftDestination] = useState<LocationType | ''>('')
  const [draftDepartureHour, setDraftDepartureHour] = useState('')
  const [draftDepartureMinute, setDraftDepartureMinute] = useState('')
  // Bumped on an interval while the create form is open so the time options stay
  // anchored to the current clock — otherwise an option that was valid when the
  // form opened can quietly go stale and (post-midnight rollover) create a room
  // far beyond the 01:00 cutoff.
  const [departureOptionsNonce, setDepartureOptionsNonce] = useState(0)

  const { originStats } = useMemo(() => buildStats(rooms), [rooms])
  const destinationOptions = useMemo(() => getDestinationOptions(selectedFrom), [selectedFrom])
  const departureTimeOptions = useMemo(
    // departureOptionsNonce intentionally drives recomputation; new Date() is read fresh.
    () => isCreateMode ? getDepartureTimeOptions(new Date(), 1) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isCreateMode, departureOptionsNonce]
  )
  const departureHourOptions = useMemo(
    () => Array.from(new Set(departureTimeOptions.map((time) => time.slice(0, 2)))),
    [departureTimeOptions]
  )
  const departureMinuteOptions = useMemo(
    () => departureTimeOptions
      .filter((time) => time.startsWith(`${draftDepartureHour}:`))
      .map((time) => time.slice(3, 5)),
    [departureTimeOptions, draftDepartureHour]
  )
  const draftDepartureTime = draftDepartureHour && draftDepartureMinute
    ? `${draftDepartureHour}:${draftDepartureMinute}`
    : ''
  const selectedOriginRooms = useMemo(
    () => selectedFrom
      ? rooms
          .filter((room) => room.from_location === selectedFrom)
          .slice()
          .sort((a, b) => getRoomSortKey(a).localeCompare(getRoomSortKey(b)))
      : [],
    [rooms, selectedFrom]
  )

  const handleLocationSelect = useCallback((location: LocationType) => {
    setFocusedLocation(location)
    onSelectFrom(location)
  }, [onSelectFrom])

  const closeSheet = useCallback(() => {
    onSelectFrom('')
    setFocusedLocation(null)
    setIsCreateMode(false)
    setDraftDestination('')
    setDraftDepartureHour('')
    setDraftDepartureMinute('')
  }, [onSelectFrom])

  // The close button sits above the momentum-scrolling sheet body (-webkit-overflow-
  // scrolling: touch). On iOS that scroller can swallow the first synthetic click, so
  // taps appear to do nothing until repeated. Acting on pointerdown for touch closes
  // the sheet on the first tap (same approach as the chat send button). preventDefault
  // works here because React pointerdown — unlike touchstart — is not passive.
  const handleCloseSheetPointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== 'touch') return
    event.preventDefault()
    closeSheet()
  }, [closeSheet])

  const handleZoomIn = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    map.setLevel(Math.max(MIN_MAP_LEVEL, map.getLevel() - 1))
  }, [])

  const handleZoomOut = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    map.setLevel(Math.min(MAX_MAP_LEVEL, map.getLevel() + 1))
  }, [])

  useEffect(() => {
    const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY

    if (!appKey) {
      setMapStatus('missing-key')
      return
    }

    let isMounted = true

    loadKakaoMaps(appKey)
      .then((kakao) => {
        if (!isMounted || !mapContainerRef.current) return

        kakaoRef.current = kakao
        const map = new kakao.maps.Map(mapContainerRef.current, {
          center: new kakao.maps.LatLng(GACHON_GLOBAL_CAMPUS_CENTER.lat, GACHON_GLOBAL_CAMPUS_CENTER.lng),
          level: 3,
        })

        map.setDraggable(true)
        map.setZoomable(true)
        mapRef.current = map

        kakao.maps.event.addListener(map, 'dragend', () => clampMapToCampus(map, kakao))
        kakao.maps.event.addListener(map, 'zoom_changed', () => clampMapToCampus(map, kakao))
        clampMapToCampus(map, kakao)
        setMapStatus('ready')
      })
      .catch((error) => {
        console.error('Kakao map load error:', error)
        if (isMounted) setMapStatus('error')
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (mapStatus !== 'ready' || !mapRef.current || !kakaoRef.current) return

    const kakao = kakaoRef.current
    const map = mapRef.current

    markerRefs.current.forEach((marker) => marker.setMap(null))
    overlayRefs.current.forEach((overlay) => overlay.setMap(null))
    markerRefs.current = []
    overlayRefs.current = []

    LOCATION_ORDER.forEach((location) => {
      const point = LOCATION_POINTS[location]
      const position = new kakao.maps.LatLng(point.lat, point.lng)
      const marker = new kakao.maps.Marker({ position })
      const originStat = originStats.get(location) ?? emptyStat()
      const isOrigin = selectedFrom === location
      const isEmpty = !isOrigin && originStat.roomCount === 0
      const label = isOrigin ? '출발' : `${originStat.roomCount}개`
      const overlayClass = [
        'gatita-map-overlay',
        isOrigin ? 'is-origin' : '',
        isEmpty ? 'is-empty' : '',
      ].filter(Boolean).join(' ')
      const overlayElement = document.createElement('button')
      overlayElement.type = 'button'
      overlayElement.className = overlayClass
      overlayElement.setAttribute('aria-label', `${point.label} 선택`)

      const overlayLabel = document.createElement('span')
      overlayLabel.textContent = point.shortLabel
      const overlayCount = document.createElement('strong')
      overlayCount.textContent = label
      overlayElement.append(overlayLabel, overlayCount)
      overlayElement.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        handleLocationSelect(location)
      })

      const overlay = new kakao.maps.CustomOverlay({
        position,
        yAnchor: 1.42,
        content: overlayElement,
      })

      marker.setMap(map)
      overlay.setMap(map)
      kakao.maps.event.addListener(marker, 'click', () => handleLocationSelect(location))
      markerRefs.current.push(marker)
      overlayRefs.current.push(overlay)
    })

    return () => {
      markerRefs.current.forEach((marker) => marker.setMap(null))
      overlayRefs.current.forEach((overlay) => overlay.setMap(null))
      markerRefs.current = []
      overlayRefs.current = []
    }
  }, [handleLocationSelect, mapStatus, originStats, selectedFrom])

  useEffect(() => {
    if (!selectedFrom || mapStatus !== 'ready' || !mapRef.current || !kakaoRef.current) return

    const kakao = kakaoRef.current
    const map = mapRef.current
    const handleMapClick = () => closeSheet()

    kakao.maps.event.addListener(map, 'click', handleMapClick)

    return () => {
      kakao.maps.event.removeListener(map, 'click', handleMapClick)
    }
  }, [closeSheet, mapStatus, selectedFrom])

  useEffect(() => {
    if (!selectedFrom) {
      setFocusedLocation(null)
      setIsCreateMode(false)
      setDraftDestination('')
      setDraftDepartureHour('')
      setDraftDepartureMinute('')
    }
  }, [selectedFrom])

  useEffect(() => {
    if (!selectedFrom) return

    setIsCreateMode(false)
    setDraftDestination('')
    setDraftDepartureHour('')
    setDraftDepartureMinute('')
  }, [selectedFrom])

  useEffect(() => {
    if (draftDestination && !destinationOptions.includes(draftDestination)) {
      setDraftDestination('')
    }
  }, [destinationOptions, draftDestination])

  useEffect(() => {
    if (!isCreateMode) return

    const intervalId = window.setInterval(() => {
      setDepartureOptionsNonce((nonce) => nonce + 1)
    }, 30000)

    return () => window.clearInterval(intervalId)
  }, [isCreateMode])

  useEffect(() => {
    if (!isCreateMode || departureTimeOptions.length === 0) return

    const firstTime = departureTimeOptions[0]
    const firstHour = firstTime.slice(0, 2)
    const firstMinute = firstTime.slice(3, 5)
    const currentTime = draftDepartureTime

    if (!currentTime || !departureTimeOptions.includes(currentTime)) {
      setDraftDepartureHour(firstHour)
      setDraftDepartureMinute(firstMinute)
    }
  }, [departureTimeOptions, draftDepartureTime, isCreateMode])

  const selectedOriginStat = selectedFrom
    ? originStats.get(selectedFrom) ?? emptyStat()
    : emptyStat()
  const isSheetOpen = Boolean(selectedFrom)

  return (
    <section className="relative h-full w-full overflow-hidden bg-[#e7edf4]">
      <div ref={mapContainerRef} className="gatita-kakao-map absolute inset-0 h-full w-full" />

      <div className="gatita-map-stats pointer-events-none absolute left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-2 sm:left-4">
        <div className="inline-flex items-center gap-2 rounded-lg border border-white/75 bg-white/90 px-3 py-2 text-xs font-extrabold text-gray-950 shadow-[0_10px_28px_rgba(17,24,39,0.12)] backdrop-blur">
          <Compass className="h-4 w-4 text-primary-600" />
          <span>오늘 예정 방 {rooms.length}개</span>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-white/75 bg-white/90 px-3 py-2 text-xs font-extrabold text-gray-950 shadow-[0_10px_28px_rgba(17,24,39,0.12)] backdrop-blur">
          <Users className="h-4 w-4 text-primary-600" />
          <span>{onlineCount}명 접속 중</span>
        </div>
        {isLoading && (
          <div className="inline-flex items-center gap-2 rounded-lg border border-white/75 bg-white/90 px-3 py-2 text-xs font-bold text-gray-600 shadow-[0_10px_28px_rgba(17,24,39,0.12)] backdrop-blur">
            <div className="loading-spinner h-4 w-4" />
            <span>방 현황 불러오는 중</span>
          </div>
        )}
      </div>

      {mapStatus === 'ready' && (
        <div className="gatita-custom-zoom-control absolute z-20 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-[0_8px_24px_rgba(17,24,39,0.16)]">
          <button
            type="button"
            aria-label="지도 확대"
            onClick={handleZoomIn}
            className="flex h-10 w-10 items-center justify-center text-gray-800 transition hover:bg-gray-50"
          >
            <Plus className="h-5 w-5" />
          </button>
          <div className="mx-2 h-px bg-gray-200" />
          <button
            type="button"
            aria-label="지도 축소"
            onClick={handleZoomOut}
            className="flex h-10 w-10 items-center justify-center text-gray-800 transition hover:bg-gray-50"
          >
            <Minus className="h-5 w-5" />
          </button>
        </div>
      )}

      {(mapStatus === 'missing-key' || mapStatus === 'error') && (
        <div
          onClick={(event) => {
            if (event.target === event.currentTarget && isSheetOpen) closeSheet()
          }}
          className="absolute inset-0 overflow-hidden bg-[linear-gradient(135deg,#eaf2ff_0%,#f8fbff_45%,#eef6f1_100%)]"
        >
          <div className="absolute left-[8%] top-[46%] h-2 w-[84%] -rotate-6 rounded-full bg-white/80 shadow-inner" />
          <div className="absolute left-[36%] top-[12%] h-[76%] w-2 rotate-12 rounded-full bg-white/75 shadow-inner" />
          <div className="absolute inset-x-4 top-24 rounded-lg border border-white/70 bg-white/85 px-3 py-2 text-xs font-semibold text-gray-600 shadow-sm backdrop-blur">
            {mapStatus === 'missing-key'
              ? '카카오맵 JavaScript 키를 연결하면 실제 지도로 표시됩니다.'
              : '지도를 불러오지 못해 캠퍼스 기준 지점으로 표시합니다.'}
          </div>
          {LOCATION_ORDER.map((location) => {
            const point = LOCATION_POINTS[location]
            const originStat = originStats.get(location) ?? emptyStat()
            const isOrigin = selectedFrom === location

            return (
              <button
                key={location}
                type="button"
                onClick={() => handleLocationSelect(location)}
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-lg border px-3 py-2 text-left text-xs shadow-lg transition ${
                  isOrigin
                    ? 'border-primary-600 bg-primary-600 text-white'
                    : 'border-white bg-white text-gray-900 hover:border-primary-300'
                }`}
                style={{ left: `${point.mapX}%`, top: `${point.mapY}%` }}
              >
                <span className="block whitespace-nowrap font-bold">{point.shortLabel}</span>
                <span className="block whitespace-nowrap opacity-80">
                  {isOrigin ? '출발' : `${originStat.roomCount}개 방`}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {mapStatus === 'loading' && (
        <div className="pointer-events-none absolute inset-0 bg-[#e7edf4]" />
      )}

      {isSheetOpen && (
        <div
          className="gatita-bottom-sheet absolute inset-x-3 z-30 mx-auto max-w-2xl rounded-lg border border-white/80 bg-white/95 px-4 pt-4 shadow-[0_18px_48px_rgba(17,24,39,0.22)] backdrop-blur"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            aria-label="선택 닫기"
            onPointerDown={handleCloseSheetPointerDown}
            onClick={closeSheet}
            className="absolute right-1.5 top-1.5 z-10 inline-flex h-12 w-12 touch-manipulation items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-950"
          >
            <X className="h-5 w-5" />
          </button>

          {selectedFrom ? (
            <div className="gatita-bottom-sheet-body">
              <div className="pr-14">
                <p className="text-xs font-black uppercase tracking-[0.08em] text-primary-600">출발 지점</p>
                <div className="mt-1 flex min-w-0 items-center gap-2 text-base font-extrabold text-gray-950">
                  <Compass className="h-4 w-4 shrink-0 text-primary-600" />
                  <span className="truncate">{LOCATIONS[selectedFrom]}</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-gray-600">
                  오늘 출발 방 {selectedOriginStat.roomCount}개
                  {selectedOriginStat.nextTime ? ` · 다음 출발 ${formatRoomTime(selectedOriginStat.nextTime)}` : ''}
                </p>
              </div>

              {selectedOriginRooms.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {selectedOriginRooms.map((room) => {
                    const participantCount = room.participants?.length ?? 0
                    const isFull = participantCount >= room.max_participants
                    const isPastDeparture = !isRoomJoinable(room.departure_date, room.departure_time)

                    return (
                      <div
                        key={room.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2 text-sm font-black text-gray-950">
                            <Clock className="h-4 w-4 shrink-0 text-primary-600" />
                            <span className="shrink-0">{formatRoomTime(room.departure_time)}</span>
                            <span className="truncate text-xs font-extrabold text-gray-600">
                              ({LOCATIONS[room.to_location]})
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {!isPastDeparture && (
                            <span className="text-xs font-black text-gray-500">
                              {participantCount}/{room.max_participants}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => onJoinRoom(room.id)}
                            disabled={isFull || isPastDeparture}
                            className="rounded-md bg-gray-950 px-3 py-1.5 text-xs font-black text-white transition hover:bg-gray-800 disabled:bg-gray-300"
                          >
                            {isPastDeparture ? '지난 방' : isFull ? '마감' : '입장'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : !isCreateMode ? (
                <div className="mt-3 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-sm font-bold text-gray-600">
                  아직 방이 없습니다
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => {
                  setIsCreateMode(true)
                  trackEvent('room_create_form_opened', {
                    from_location: selectedFrom,
                    source: 'map_bottom_sheet',
                  })
                }}
                className={`${isCreateMode ? 'hidden' : 'mt-3 inline-flex'} w-full items-center justify-center rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-primary-700`}
              >
                <Plus className="mr-2 h-4 w-4" />
                방 생성하기
              </button>

              {isCreateMode && (
                <div className="mt-3 rounded-lg border border-primary-100 bg-primary-50/70 p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-black text-gray-700">도착지</label>
                      <select
                        value={draftDestination}
                        onChange={(event) => setDraftDestination(event.target.value as LocationType | '')}
                        className="input-field bg-white py-2.5 text-base font-bold"
                      >
                        <option value="">도착지 선택</option>
                        {destinationOptions.map((location) => (
                          <option key={location} value={location}>
                            {LOCATIONS[location]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-black text-gray-700">출발예정시간</label>
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <select
                          aria-label="출발 예정 시"
                          value={draftDepartureHour}
                          onChange={(event) => {
                            const nextHour = event.target.value
                            const nextMinute = departureTimeOptions
                              .find((time) => time.startsWith(`${nextHour}:`))
                              ?.slice(3, 5) ?? ''

                            setDraftDepartureHour(nextHour)
                            setDraftDepartureMinute(nextMinute)
                          }}
                          className="input-field bg-white py-2.5 text-base font-bold"
                        >
                          {departureHourOptions.length > 0 ? (
                            departureHourOptions.map((hour) => (
                              <option key={hour} value={hour}>
                                {hour}시
                              </option>
                            ))
                          ) : (
                            <option value="">시</option>
                          )}
                        </select>
                        <span className="text-xs font-black text-gray-400">:</span>
                        <select
                          aria-label="출발 예정 분"
                          value={draftDepartureMinute}
                          onChange={(event) => setDraftDepartureMinute(event.target.value)}
                          className="input-field bg-white py-2.5 text-base font-bold"
                        >
                          {departureMinuteOptions.length > 0 ? (
                            departureMinuteOptions.map((minute) => (
                              <option key={minute} value={minute}>
                                {minute}분
                              </option>
                            ))
                          ) : (
                            <option value="">분</option>
                          )}
                        </select>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!draftDestination || !draftDepartureTime) return
                      onCreateRoom({
                        fromLocation: selectedFrom,
                        toLocation: draftDestination,
                        departureTime: draftDepartureTime,
                      })
                    }}
                    disabled={!draftDestination || !draftDepartureTime || isCreatingRoom}
                    className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-gray-950 px-4 py-2.5 text-sm font-black text-white transition hover:bg-gray-800 disabled:bg-gray-300"
                  >
                    {isCreatingRoom ? '만드는 중...' : '만들기'}
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}
