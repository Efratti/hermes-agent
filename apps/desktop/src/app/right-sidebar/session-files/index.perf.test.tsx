import { act, cleanup, render } from '@testing-library/react'
import { Profiler } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ClientSessionState } from '@/app/types'
import type * as SessionFilesModule from '@/components/assistant-ui/thread/session-files'
import type { ChatMessage } from '@/lib/chat-messages'
import { $activeSessionId } from '@/store/session'
import { $sessionFilesTarget } from '@/store/session-files'
import { $sessionStates } from '@/store/session-states'
import { buildSessionMessages } from '@/test/session-files-fixture'

const { deriveCalls } = vi.hoisted(() => ({ deriveCalls: { count: 0 } }))

vi.mock('@/components/assistant-ui/thread/session-files', async importOriginal => {
  const actual = await importOriginal<typeof SessionFilesModule>()

  return {
    ...actual,
    deriveSessionFileTurns: (messages: readonly ChatMessage[]) => {
      deriveCalls.count += 1

      return actual.deriveSessionFileTurns(messages)
    }
  }
})

import { SessionFilesPane } from '.'

const TURNS = 200
const FILES_PER_TURN = 3
const SETTLED = buildSessionMessages({ filesPerTurn: FILES_PER_TURN, turns: TURNS })
const ROW_COUNT = TURNS * FILES_PER_TURN

const liveMessage = (delta: number): ChatMessage =>
  ({
    id: 'a-live',
    parts: [{ text: `delta ${delta}`, type: 'text' }],
    role: 'assistant',
    timestamp: 1_700_100_000
  }) as unknown as ChatMessage

function publish(messages: ChatMessage[]) {
  $sessionStates.set({
    'rt-perf': {
      busy: true,
      cwd: '/repo',
      messages,
      storedSessionId: 'stored-perf'
    } as unknown as ClientSessionState
  })
  $activeSessionId.set('rt-perf')
}

afterEach(() => {
  cleanup()
  $sessionStates.set({})
  $activeSessionId.set(null)
  $sessionFilesTarget.set(null)
})

describe('SessionFilesPane streaming cost', () => {
  it('does not re-derive settled history while the live turn streams', () => {
    deriveCalls.count = 0
    publish([...SETTLED, liveMessage(0)])

    let commits = 0

    const { container } = render(
      <Profiler id="session-files-pane" onRender={() => (commits += 1)}>
        <SessionFilesPane />
      </Profiler>
    )

    expect(deriveCalls.count).toBe(1)
    expect(container.querySelectorAll('[data-session-file]')).toHaveLength(ROW_COUNT)
    expect(container.querySelector('[data-session-files-busy]')).not.toBeNull()

    const commitsBeforeDeltas = commits

    act(() => {
      for (let delta = 1; delta <= 30; delta++) {
        publish([...SETTLED, liveMessage(delta)])
      }
    })

    // The deltas must actually repaint the pane, otherwise the zero below
    // would only prove nothing happened.
    expect(commits).toBeGreaterThan(commitsBeforeDeltas)
    // Every delta rebuilds the settled array; none of them may re-fold it.
    expect(deriveCalls.count).toBe(1)
    expect(container.querySelectorAll('[data-session-file]')).toHaveLength(ROW_COUNT)
    expect(container.querySelector('[data-session-files-busy]')).not.toBeNull()
  })
})
