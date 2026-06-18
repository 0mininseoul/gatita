'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Compass, LocateFixed, MapPin, Navigation, Route, Users } from 'lucide-react'
import {
  GACHON_GLOBAL_CAMPUS_BOUNDS,
  GACHON_GLOBAL_CAMPUS_CENTER,
  LOCATION_ORDER,
  LOCATION_POINTS,
  LOCATIONS,
  LocationType,
} from '@/lib/supabase'

export type CampusMapRoom = {
  id: string
  from_location: LocationType
  to_location: LocationType
  departure_time: string
  max_participants: number
  participants?: Array<{
    id: string
    user_id?: string
  }>
}

type Stat = {
  roomCount: number
  participantCount: number
  nextTime: string | null
}

type CampusRouteMapProps = {
  rooms: CampusMapRoom[]
  onlineCount: number
  selectedFrom: LocationType | ''
  selectedTo: LocationType | ''
  isLoading?: boolean
  onSelectFrom: (location: LocationType | '') => void
  onSelectTo: (location: LocationType | '') => void
  onOpenRooms: () => void
}

declare global {
  interface Window {
    kakao?: any
    __gatitaKakaoMapPromise?: Promise<any>
  }
}

const KAKAO_MAP_SDK_ID = 'gatita-kakao-map-sdk'
const MAX_MAP_LEVEL = 4
const MIN_MAP_LEVEL = 1

const emptyStat = (): Stat => ({
  roomCount: 0,
  participantCount: 0,
  nextTime: null,
})

const getRouteKey = (from: LocationType, to: LocationType) => `${from}__${to}`

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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function getDistanceMeters(from: LocationType, to: LocationType) {
  const fromPoint = LOCATION_POINTS[from]
  const toPoint = LOCATION_POINTS[to]
  const earthRadius = 6371000
  const lat1 = (fromPoint.lat * Math.PI) / 180
  const lat2 = (toPoint.lat * Math.PI) / 180
  const deltaLat = ((toPoint.lat - fromPoint.lat) * Math.PI) / 180
  const deltaLng = ((toPoint.lng - fromPoint.lng) * Math.PI) / 180
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return Math.round((earthRadius * c) / 10) * 10
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
  const locationStats = new Map<LocationType, Stat>()
  const routeStats = new Map<string, Stat>()

  LOCATION_ORDER.forEach((location) => {
    locationStats.set(location, emptyStat())
  })

  rooms.forEach((room) => {
    const participantCount = room.participants?.length ?? 0
    const involvedLocations = [room.from_location, room.to_location]
    const routeKey = getRouteKey(room.from_location, room.to_location)
    const currentRouteStat = routeStats.get(routeKey) ?? emptyStat()

    currentRouteStat.roomCount += 1
    currentRouteStat.participantCount += participantCount
    currentRouteStat.nextTime =
      !currentRouteStat.nextTime || room.departure_time < currentRouteStat.nextTime
        ? room.departure_time
        : currentRouteStat.nextTime
    routeStats.set(routeKey, currentRouteStat)

    involvedLocations.forEach((location) => {
      const currentLocationStat = locationStats.get(location) ?? emptyStat()
      currentLocationStat.roomCount += 1
      currentLocationStat.participantCount += participantCount
      currentLocationStat.nextTime =
        !currentLocationStat.nextTime || room.departure_time < currentLocationStat.nextTime
          ? room.departure_time
          : currentLocationStat.nextTime
      locationStats.set(location, currentLocationStat)
    })
  })

  return { locationStats, routeStats }
}

export default function CampusRouteMap({
  rooms,
  onlineCount,
  selectedFrom,
  selectedTo,
  isLoading = false,
  onSelectFrom,
  onSelectTo,
  onOpenRooms,
}: CampusRouteMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const kakaoRef = useRef<any>(null)
  const markerRefs = useRef<any[]>([])
  const overlayRefs = useRef<any[]>([])
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'missing-key' | 'error'>('loading')
  const [focusedLocation, setFocusedLocation] = useState<LocationType | null>(selectedFrom || null)

  const { locationStats, routeStats } = useMemo(() => buildStats(rooms), [rooms])
  const selectedRouteStat = selectedFrom && selectedTo
    ? routeStats.get(getRouteKey(selectedFrom, selectedTo)) ?? emptyStat()
    : emptyStat()

  const candidateLocations = useMemo(() => {
    if (!selectedFrom) {
      return LOCATION_ORDER
        .slice()
        .sort((a, b) => {
          const aStat = locationStats.get(a) ?? emptyStat()
          const bStat = locationStats.get(b) ?? emptyStat()
          return bStat.roomCount - aStat.roomCount
        })
    }

    return LOCATION_ORDER
      .filter((location) => location !== selectedFrom)
      .sort((a, b) => {
        const aStat = routeStats.get(getRouteKey(selectedFrom, a)) ?? emptyStat()
        const bStat = routeStats.get(getRouteKey(selectedFrom, b)) ?? emptyStat()
        return bStat.roomCount - aStat.roomCount || getDistanceMeters(selectedFrom, a) - getDistanceMeters(selectedFrom, b)
      })
  }, [locationStats, routeStats, selectedFrom])

  const handleLocationSelect = useCallback((location: LocationType) => {
    setFocusedLocation(location)

    if (!selectedFrom) {
      onSelectFrom(location)
      onSelectTo('')
      return
    }

    if (selectedFrom === location) {
      return
    }

    onSelectTo(location)
  }, [onSelectFrom, onSelectTo, selectedFrom])

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

        const zoomControl = new kakao.maps.ZoomControl()
        map.addControl(zoomControl, kakao.maps.ControlPosition.RIGHT)

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
      const locationStat = locationStats.get(location) ?? emptyStat()
      const routeStat = selectedFrom && selectedFrom !== location
        ? routeStats.get(getRouteKey(selectedFrom, location)) ?? emptyStat()
        : locationStat
      const isOrigin = selectedFrom === location
      const isDestination = selectedTo === location
      const isEmpty = !isOrigin && routeStat.roomCount === 0
      const label = isOrigin ? '출발' : `${routeStat.roomCount}개`
      const overlayClass = [
        'gatita-map-overlay',
        isOrigin ? 'is-origin' : '',
        isDestination ? 'is-destination' : '',
        isEmpty ? 'is-empty' : '',
      ].filter(Boolean).join(' ')

      const overlay = new kakao.maps.CustomOverlay({
        position,
        yAnchor: 1.42,
        content: `
          <div class="${overlayClass}">
            <span>${escapeHtml(point.shortLabel)}</span>
            <strong>${escapeHtml(label)}</strong>
          </div>
        `,
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
  }, [handleLocationSelect, locationStats, mapStatus, routeStats, selectedFrom, selectedTo])

  useEffect(() => {
    if (!selectedFrom) {
      setFocusedLocation(null)
    }
  }, [selectedFrom])

  const focusedStat = focusedLocation
    ? locationStats.get(focusedLocation) ?? emptyStat()
    : emptyStat()

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-primary-700">Gachon Global Campus</p>
          <h2 className="mt-1 text-xl font-extrabold text-gray-950">지도에서 바로 고르기</h2>
        </div>
        <div className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-primary-100 bg-white px-3 py-2 text-sm font-bold text-gray-900 shadow-sm">
          <Users className="h-4 w-4 text-primary-600" />
          <span>{onlineCount}명 접속 중</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-[0_14px_34px_rgba(31,41,70,0.08)]">
        <div className="relative h-[420px] min-h-[360px] bg-[#e7edf4]">
          <div ref={mapContainerRef} className="h-full w-full" />

          {(mapStatus === 'missing-key' || mapStatus === 'error') && (
            <div className="absolute inset-0 overflow-hidden bg-[linear-gradient(135deg,#eaf2ff_0%,#f8fbff_45%,#eef6f1_100%)]">
              <div className="absolute left-[8%] top-[46%] h-2 w-[84%] -rotate-6 rounded-full bg-white/80 shadow-inner" />
              <div className="absolute left-[36%] top-[12%] h-[76%] w-2 rotate-12 rounded-full bg-white/75 shadow-inner" />
              <div className="absolute inset-x-4 top-4 rounded-lg border border-white/70 bg-white/80 px-3 py-2 text-xs font-semibold text-gray-600 shadow-sm backdrop-blur">
                {mapStatus === 'missing-key'
                  ? '카카오맵 JavaScript 키를 연결하면 실제 지도로 표시됩니다.'
                  : '지도를 불러오지 못해 캠퍼스 기준 지점으로 표시합니다.'}
              </div>
              {LOCATION_ORDER.map((location) => {
                const point = LOCATION_POINTS[location]
                const routeStat = selectedFrom && selectedFrom !== location
                  ? routeStats.get(getRouteKey(selectedFrom, location)) ?? emptyStat()
                  : locationStats.get(location) ?? emptyStat()
                const isOrigin = selectedFrom === location
                const isDestination = selectedTo === location

                return (
                  <button
                    key={location}
                    type="button"
                    onClick={() => handleLocationSelect(location)}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-lg border px-3 py-2 text-left text-xs shadow-lg transition ${
                      isOrigin
                        ? 'border-primary-600 bg-primary-600 text-white'
                        : isDestination
                          ? 'border-gray-950 bg-gray-950 text-white'
                          : 'border-white bg-white text-gray-900 hover:border-primary-300'
                    }`}
                    style={{ left: `${point.mapX}%`, top: `${point.mapY}%` }}
                  >
                    <span className="block whitespace-nowrap font-bold">{point.shortLabel}</span>
                    <span className="block whitespace-nowrap opacity-80">
                      {isOrigin ? '출발' : `${routeStat.roomCount}개 방`}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {mapStatus === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-sm">
              <div className="loading-spinner" />
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 bg-white p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
            <div className="min-w-0">
              {selectedFrom && selectedTo ? (
                <>
                  <div className="flex min-w-0 items-center gap-2 text-base font-extrabold text-gray-950">
                    <span className="truncate">{LOCATIONS[selectedFrom]}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" />
                    <span className="truncate">{LOCATIONS[selectedTo]}</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    오늘 예정 방 {selectedRouteStat.roomCount}개
                    {selectedRouteStat.nextTime ? ` · 다음 출발 ${selectedRouteStat.nextTime}` : ''}
                  </p>
                </>
              ) : selectedFrom ? (
                <>
                  <div className="flex items-center gap-2 text-base font-extrabold text-gray-950">
                    <Navigation className="h-4 w-4 text-primary-600" />
                    <span>{LOCATIONS[selectedFrom]} 출발</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">도착 후보를 고르면 해당 경로 방으로 이동합니다.</p>
                </>
              ) : focusedLocation ? (
                <>
                  <div className="flex items-center gap-2 text-base font-extrabold text-gray-950">
                    <MapPin className="h-4 w-4 text-primary-600" />
                    <span>{LOCATIONS[focusedLocation]}</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    연결된 오늘 예정 방 {focusedStat.roomCount}개
                    {focusedStat.nextTime ? ` · 다음 출발 ${focusedStat.nextTime}` : ''}
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-base font-extrabold text-gray-950">
                    <Compass className="h-4 w-4 text-primary-600" />
                    <span>오늘 예정 방 {rooms.length}개</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">방이 많은 지점부터 먼저 확인할 수 있습니다.</p>
                </>
              )}
            </div>

            <div className="flex gap-2">
              {selectedFrom && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectFrom('')
                    onSelectTo('')
                    setFocusedLocation(null)
                  }}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
                >
                  다시 선택
                </button>
              )}
              <button
                type="button"
                onClick={onOpenRooms}
                disabled={!selectedFrom || !selectedTo}
                className="inline-flex items-center justify-center rounded-lg bg-gray-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                방 보기
                <ArrowRight className="ml-2 h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {candidateLocations.map((location) => {
          const point = LOCATION_POINTS[location]
          const stat = selectedFrom
            ? routeStats.get(getRouteKey(selectedFrom, location)) ?? emptyStat()
            : locationStats.get(location) ?? emptyStat()
          const isDestination = selectedTo === location

          return (
            <button
              key={location}
              type="button"
              onClick={() => handleLocationSelect(location)}
              className={`rounded-lg border p-3 text-left transition ${
                isDestination
                  ? 'border-gray-950 bg-gray-950 text-white'
                  : stat.roomCount > 0
                    ? 'border-primary-100 bg-white text-gray-950 shadow-sm hover:border-primary-300'
                    : 'border-gray-200 bg-white/72 text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {selectedFrom ? <Route className="h-4 w-4 shrink-0" /> : <LocateFixed className="h-4 w-4 shrink-0" />}
                    <span className="truncate text-sm font-extrabold">{point.label}</span>
                  </div>
                  <p className={`mt-1 text-xs ${isDestination ? 'text-white/72' : 'text-gray-500'}`}>
                    {selectedFrom ? `${getDistanceMeters(selectedFrom, location)}m 근처` : point.description}
                  </p>
                </div>
                <div className={`shrink-0 rounded-md px-2.5 py-1 text-sm font-black ${
                  isDestination ? 'bg-white text-gray-950' : 'bg-primary-50 text-primary-700'
                }`}>
                  {stat.roomCount}개
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-2 text-sm font-semibold text-gray-500">
          <div className="loading-spinner mr-2" />
          방 현황 불러오는 중
        </div>
      )}
    </section>
  )
}
