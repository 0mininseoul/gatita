'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Compass, MapPin, Navigation, Route, Users, X } from 'lucide-react'
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
  }, [handleLocationSelect, locationStats, mapStatus, routeStats, selectedFrom, selectedTo])

  useEffect(() => {
    if (!selectedFrom) {
      setFocusedLocation(null)
    }
  }, [selectedFrom])

  const focusedStat = focusedLocation
    ? locationStats.get(focusedLocation) ?? emptyStat()
    : emptyStat()
  const selectedOriginStat = selectedFrom
    ? locationStats.get(selectedFrom) ?? emptyStat()
    : emptyStat()
  const isSheetOpen = Boolean(selectedFrom || focusedLocation)

  return (
    <section className="relative h-full min-h-[100dvh] w-full overflow-hidden bg-[#e7edf4]">
      <div ref={mapContainerRef} className="absolute inset-0 h-full w-full" />

      <div className="pointer-events-none absolute left-3 top-24 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-2 sm:left-4">
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

      {(mapStatus === 'missing-key' || mapStatus === 'error') && (
        <div className="absolute inset-0 overflow-hidden bg-[linear-gradient(135deg,#eaf2ff_0%,#f8fbff_45%,#eef6f1_100%)]">
          <div className="absolute left-[8%] top-[46%] h-2 w-[84%] -rotate-6 rounded-full bg-white/80 shadow-inner" />
          <div className="absolute left-[36%] top-[12%] h-[76%] w-2 rotate-12 rounded-full bg-white/75 shadow-inner" />
          <div className="absolute inset-x-4 top-24 rounded-lg border border-white/70 bg-white/85 px-3 py-2 text-xs font-semibold text-gray-600 shadow-sm backdrop-blur">
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

      {isSheetOpen && (
        <div
          className="absolute inset-x-3 bottom-3 z-30 mx-auto max-w-2xl rounded-lg border border-white/80 bg-white/95 px-4 pt-4 shadow-[0_18px_48px_rgba(17,24,39,0.22)] backdrop-blur"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            aria-label="선택 닫기"
            onClick={() => {
              onSelectFrom('')
              onSelectTo('')
              setFocusedLocation(null)
            }}
            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-950"
          >
            <X className="h-5 w-5" />
          </button>

          {selectedFrom && selectedTo ? (
            <div className="grid gap-4 pr-8 sm:grid-cols-[1fr_auto] sm:items-end sm:pr-0">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.08em] text-primary-600">선택 경로</p>
                <div className="mt-1 flex min-w-0 items-center gap-2 text-base font-extrabold text-gray-950">
                  <span className="truncate">{LOCATIONS[selectedFrom]}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" />
                  <span className="truncate">{LOCATIONS[selectedTo]}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-gray-600">
                  <span>오늘 예정 방 {selectedRouteStat.roomCount}개</span>
                  {selectedRouteStat.nextTime && <span>다음 출발 {selectedRouteStat.nextTime}</span>}
                  <span className="inline-flex items-center gap-1">
                    <Route className="h-3.5 w-3.5" />
                    {getDistanceMeters(selectedFrom, selectedTo)}m
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onOpenRooms}
                className="inline-flex items-center justify-center rounded-lg bg-gray-950 px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-gray-800"
              >
                방 보기
                <ArrowRight className="ml-2 h-4 w-4" />
              </button>
            </div>
          ) : selectedFrom ? (
            <div className="pr-8">
              <p className="text-xs font-black uppercase tracking-[0.08em] text-primary-600">출발 지점</p>
              <div className="mt-1 flex min-w-0 items-center gap-2 text-base font-extrabold text-gray-950">
                <Navigation className="h-4 w-4 shrink-0 text-primary-600" />
                <span className="truncate">{LOCATIONS[selectedFrom]}</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-gray-600">
                오늘 연결된 방 {selectedOriginStat.roomCount}개
                {selectedOriginStat.nextTime ? ` · 다음 출발 ${selectedOriginStat.nextTime}` : ''}
              </p>
            </div>
          ) : focusedLocation ? (
            <div className="pr-8">
              <p className="text-xs font-black uppercase tracking-[0.08em] text-primary-600">고정 지점</p>
              <div className="mt-1 flex min-w-0 items-center gap-2 text-base font-extrabold text-gray-950">
                <MapPin className="h-4 w-4 shrink-0 text-primary-600" />
                <span className="truncate">{LOCATIONS[focusedLocation]}</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-gray-600">
                연결된 오늘 예정 방 {focusedStat.roomCount}개
                {focusedStat.nextTime ? ` · 다음 출발 ${focusedStat.nextTime}` : ''}
              </p>
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}
