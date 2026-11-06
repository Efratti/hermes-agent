import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { SessionFileTurn } from '@/components/assistant-ui/thread/session-files'
import type { ChatMessage } from '@/lib/chat-messages'

import { useSessionTurns } from './use-session-turns'

const TURNS: SessionFileTurn[] = [{ files: [], id: 'turn-1', label: 'first' }]

const message = (id: string): ChatMessage => ({ id, parts: [], role: 'assistant' }) as unknown as ChatMessage

const renderTurns = (initialMessages: ChatMessage[], derive: (messages: readonly ChatMessage[]) => SessionFileTurn[]) =>
  renderHook(({ messages }: { messages: ChatMessage[] }) => useSessionTurns(messages, derive), {
    initialProps: { messages: initialMessages }
  })

describe('useSessionTurns', () => {
  it('reuses the previous result when only the array identity changes', () => {
    const derive = vi.fn(() => TURNS)
    const settled = [message('u1'), message('a1')]
    const { rerender } = renderTurns(settled, derive)

    expect(derive).toHaveBeenCalledTimes(1)

    for (let delta = 0; delta < 30; delta++) {
      rerender({ messages: settled.slice() })
    }

    expect(derive).toHaveBeenCalledTimes(1)
  })

  it('re-derives when a settled message object changes', () => {
    const derive = vi.fn(() => TURNS)
    const settled = [message('u1'), message('a1')]
    const { rerender } = renderTurns(settled, derive)

    rerender({ messages: [settled[0]!, message('a1-edited')] })

    expect(derive).toHaveBeenCalledTimes(2)
  })

  it('re-derives when the transcript grows', () => {
    const derive = vi.fn(() => TURNS)
    const settled = [message('u1'), message('a1')]
    const { rerender } = renderTurns(settled, derive)

    rerender({ messages: [...settled, message('u2')] })

    expect(derive).toHaveBeenCalledTimes(2)
  })
})
