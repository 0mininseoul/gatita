import type { Message, User } from '@/lib/supabase'

export const HOST_APPEARANCE_MESSAGE_PREFIX = '__gatita_host_appearance__:'
export const LEGACY_HOST_APPEARANCE_MESSAGE_PREFIX = '방장 인상착의:'

export type MessageAuthor = Pick<User, 'id' | 'nickname' | 'department' | 'avatar_url'>

// 방장 인상착의 메시지에서 본문을 추출한다. 일반 메시지는 빈 문자열.
export function extractHostAppearanceFromMessage(content: string): string {
  if (content.startsWith(HOST_APPEARANCE_MESSAGE_PREFIX)) {
    return content.slice(HOST_APPEARANCE_MESSAGE_PREFIX.length).trim()
  }

  if (content.startsWith(LEGACY_HOST_APPEARANCE_MESSAGE_PREFIX)) {
    return content.slice(LEGACY_HOST_APPEARANCE_MESSAGE_PREFIX.length).trim()
  }

  return ''
}

export function isHostAppearanceMessage(content: string): boolean {
  return extractHostAppearanceFromMessage(content) !== ''
}

// 낙관적 업데이트로 만든 임시 메시지 여부 (transition 식별용).
export function isOptimisticMessageId(id: string): boolean {
  return id.startsWith('temp-')
}

// 원본 메시지 행을 화면에 보일 메시지와 최신 방장 인상착의로 분리한다.
export function splitMessages(rows: Message[]): { visible: Message[]; latestHostAppearance: string } {
  let latestHostAppearance = ''
  const visible: Message[] = []

  for (const row of rows) {
    const appearance = extractHostAppearanceFromMessage(row.content)
    if (appearance) {
      latestHostAppearance = appearance
    } else {
      visible.push(row)
    }
  }

  return { visible, latestHostAppearance }
}

function findInsertionIndex(list: Message[], createdAt: string): number {
  // 새 메시지는 보통 가장 최신이라 끝에서부터 탐색하는 편이 빠르다.
  let index = list.length
  while (index > 0 && list[index - 1].created_at > createdAt) {
    index -= 1
  }
  return index
}

// created_at 오름차순 목록에 메시지를 삽입하거나 갱신한다.
// - 같은 id가 이미 있으면 교체 (실시간 echo 중복 방지)
// - 실제 행이 들어오면 같은 작성자/내용의 임시(temp) 메시지를 찾아 reconcile
// - 그 외에는 created_at 순서를 지켜 삽입
export function upsertMessage(list: Message[], incoming: Message): Message[] {
  const existingIndex = list.findIndex((message) => message.id === incoming.id)
  if (existingIndex !== -1) {
    const next = list.slice()
    next[existingIndex] = {
      ...next[existingIndex],
      ...incoming,
      user: incoming.user ?? next[existingIndex].user,
    }
    return next
  }

  if (!isOptimisticMessageId(incoming.id)) {
    const optimisticIndex = list.findIndex(
      (message) =>
        isOptimisticMessageId(message.id) &&
        message.user_id === incoming.user_id &&
        message.content === incoming.content
    )
    if (optimisticIndex !== -1) {
      const next = list.slice()
      next[optimisticIndex] = {
        ...incoming,
        user: incoming.user ?? list[optimisticIndex].user,
      }
      return next
    }
  }

  const next = list.slice()
  next.splice(findInsertionIndex(next, incoming.created_at), 0, incoming)
  return next
}

// 페이지네이션: 더 과거 메시지(오름차순)를 기존 목록 앞에 붙인다. id 중복은 제거.
export function prependOlderMessages(list: Message[], older: Message[]): Message[] {
  if (older.length === 0) return list

  const existingIds = new Set(list.map((message) => message.id))
  const deduped = older.filter((message) => !existingIds.has(message.id))
  if (deduped.length === 0) return list

  return [...deduped, ...list]
}
