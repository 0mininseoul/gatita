export type ServiceSharePayload = {
  title: string
  text: string
  url: string
}

type ServiceShareApi = {
  share?: (payload: ServiceSharePayload) => Promise<void>
  clipboard?: {
    writeText: (text: string) => Promise<void>
  }
}

export type ServiceShareResult = 'shared' | 'copied' | 'cancelled'

export function hasServiceShareIntent(search: string) {
  return new URLSearchParams(search).get('share') === '1'
}

export function buildServiceSharePayload(currentLocation: string): ServiceSharePayload {
  const canonicalUrl = new URL('/', currentLocation)

  return {
    title: '같이타',
    text: '가천대 학우들과 택시비 부담을 나누는 같이타를 함께 이용해 보세요.',
    url: canonicalUrl.toString(),
  }
}

export function buildServiceShareFallbackText(payload: ServiceSharePayload) {
  return `${payload.text}\n${payload.url}`
}

export function removeServiceShareIntent(currentLocation: string) {
  const url = new URL(currentLocation)
  url.searchParams.delete('share')
  return `${url.pathname}${url.search}${url.hash}`
}

function isAbortError(error: unknown) {
  return typeof error === 'object'
    && error !== null
    && 'name' in error
    && error.name === 'AbortError'
}

export async function shareService(
  currentLocation: string,
  api: ServiceShareApi,
): Promise<ServiceShareResult> {
  const payload = buildServiceSharePayload(currentLocation)

  try {
    if (typeof api.share === 'function') {
      await api.share(payload)
      return 'shared'
    }

    if (!api.clipboard?.writeText) {
      throw new Error('Share and clipboard APIs are unavailable')
    }

    await api.clipboard.writeText(buildServiceShareFallbackText(payload))
    return 'copied'
  } catch (error) {
    if (isAbortError(error)) return 'cancelled'
    throw error
  }
}
