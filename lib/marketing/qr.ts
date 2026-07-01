import { SITE_URL } from '@/lib/seo'

export const OFFLINE_POSTER_QR_CAMPAIGN = {
  id: 'offline_poster_2026_summer',
  eventName: 'qr_poster_scanned',
  trackingPath: '/qr/poster',
  destinationPath: '/map',
  source: 'offline_poster',
  medium: 'qr',
  campaign: 'offline_poster_2026_summer',
  content: 'campus_poster',
  placement: 'offline_poster',
} as const

export function buildOfflinePosterQrUrl(baseUrl = SITE_URL) {
  return `${baseUrl.replace(/\/$/, '')}${OFFLINE_POSTER_QR_CAMPAIGN.trackingPath}`
}

export function buildOfflinePosterDestinationPath() {
  const params = new URLSearchParams({
    utm_source: OFFLINE_POSTER_QR_CAMPAIGN.source,
    utm_medium: OFFLINE_POSTER_QR_CAMPAIGN.medium,
    utm_campaign: OFFLINE_POSTER_QR_CAMPAIGN.campaign,
    utm_content: OFFLINE_POSTER_QR_CAMPAIGN.content,
    qr_code: OFFLINE_POSTER_QR_CAMPAIGN.id,
  })

  return `${OFFLINE_POSTER_QR_CAMPAIGN.destinationPath}?${params.toString()}`
}

export function getOfflinePosterQrEventProperties() {
  return {
    qr_code_id: OFFLINE_POSTER_QR_CAMPAIGN.id,
    qr_placement: OFFLINE_POSTER_QR_CAMPAIGN.placement,
    qr_content: OFFLINE_POSTER_QR_CAMPAIGN.content,
    destination_path: OFFLINE_POSTER_QR_CAMPAIGN.destinationPath,
    utm_source: OFFLINE_POSTER_QR_CAMPAIGN.source,
    utm_medium: OFFLINE_POSTER_QR_CAMPAIGN.medium,
    utm_campaign: OFFLINE_POSTER_QR_CAMPAIGN.campaign,
    utm_content: OFFLINE_POSTER_QR_CAMPAIGN.content,
  }
}
