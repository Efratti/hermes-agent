import { useRef } from 'react'

import { deriveSessionFileTurns, type SessionFileTurn } from '@/components/assistant-ui/thread/session-files'
import type { ChatMessage } from '@/lib/chat-messages'

type DeriveSession = (messages: readonly ChatMessage[]) => SessionFileTurn[]

/** Same length and same element identities: the array was copied, not changed. */
function isUnchanged(previous: readonly ChatMessage[], next: readonly ChatMessage[]): boolean {
  return previous.length === next.length && previous.every((message, index) => message === next[index])
}

/**
 * `deriveSessionFileTurns` behind an identity cache.
 *
 * The pane hands in the settled transcript, and a streaming turn rebuilds that
 * array on every delta: `messages.slice(0, -1)` is a fresh array whose
 * ELEMENTS are unchanged. A `useMemo([settled])` re-folds the whole history
 * 30 times a second for that; comparing element identities costs one pointer
 * scan and reuses the previous result until a settled message itself changes.
 *
 * Store messages are immutable (an edit produces a new object), which is what
 * makes the identity check a correctness check and not just a heuristic. The
 * test next to this file fails first if that ever stops being true.
 */
export function useSessionTurns(
  messages: readonly ChatMessage[],
  derive: DeriveSession = deriveSessionFileTurns
): SessionFileTurn[] {
  const cache = useRef<null | { input: readonly ChatMessage[]; turns: SessionFileTurn[] }>(null)
  const cached = cache.current

  if (cached && isUnchanged(cached.input, messages)) {
    return cached.turns
  }

  const turns = derive(messages)
  cache.current = { input: messages, turns }

  return turns
}
