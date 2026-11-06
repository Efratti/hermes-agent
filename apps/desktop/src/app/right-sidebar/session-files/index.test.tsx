import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { ClientSessionState } from '@/app/types'
import type { ChatMessage } from '@/lib/chat-messages'
import { $activeSessionId } from '@/store/session'
import { $sessionFilesTarget, $sessionFilesView } from '@/store/session-files'
import { $sessionStates } from '@/store/session-states'

import { SessionFilesPane } from '.'

const DIFF = ['--- a/src/a.ts', '+++ b/src/a.ts', '@@ -1 +1 @@', '-old', '+new'].join('\n')
const NEW_DIFF = ['--- a/src/new.ts', '+++ b/src/new.ts', '@@ -0,0 +1 @@', '+one'].join('\n')

function message(id: string, role: ChatMessage['role'], parts: Record<string, unknown>[], timestamp?: number) {
  return { id, role, parts, timestamp } as unknown as ChatMessage
}

const edit = (path: string, diff: string) => ({
  type: 'tool-call',
  toolName: 'write_file',
  args: { path },
  result: JSON.stringify({ inline_diff: diff })
})

const MESSAGES: ChatMessage[] = [
  message('u1', 'user', [{ type: 'text', text: 'first ask' }], 100),
  message('a1', 'assistant', [edit('/repo/src/a.ts', DIFF)], 101),
  message('u2', 'user', [{ type: 'text', text: 'second ask' }], 200),
  message('a2', 'assistant', [edit('/repo/src/new.ts', NEW_DIFF)], 201)
]

const TWICE: ChatMessage[] = [
  message('u1', 'user', [{ type: 'text', text: 'first ask' }], 100),
  message('a1', 'assistant', [edit('/repo/src/a.ts', DIFF)], 101),
  message('u2', 'user', [{ type: 'text', text: 'second ask' }], 200),
  message('a2', 'assistant', [edit('/repo/src/a.ts', DIFF)], 201)
]

function publish(messages: ChatMessage[], busy = false) {
  $sessionStates.set({
    'rt-1': {
      busy,
      cwd: '/repo',
      messages,
      storedSessionId: 'stored-1'
    } as unknown as ClientSessionState
  })
  $activeSessionId.set('rt-1')
}

afterEach(() => {
  cleanup()
  $sessionStates.set({})
  $activeSessionId.set(null)
  $sessionFilesTarget.set(null)
  $sessionFilesView.set('turn')
})

describe('SessionFilesPane', () => {
  it('lists every touched file, newest turn first, with its status letter', () => {
    publish(MESSAGES)
    const { container } = render(<SessionFilesPane />)

    const labels = [...container.querySelectorAll('[data-session-turn]')].map(node => node.textContent ?? '')

    expect(labels[0]).toContain('second ask')
    expect(labels[1]).toContain('first ask')
    expect(screen.getByText('new.ts')).toBeTruthy()
    expect(screen.getByText('a.ts')).toBeTruthy()
    // A/M/D letters, tooltip word in the aria-label.
    expect(screen.getByLabelText('Created').textContent).toBe('A')
    expect(screen.getByLabelText('Modified').textContent).toBe('M')
  })

  it('keeps the running turn out of the inventory until it settles', () => {
    publish(MESSAGES, true)
    const { container } = render(<SessionFilesPane />)

    expect(screen.queryByText('new.ts')).toBeNull()
    expect(screen.getByText('a.ts')).toBeTruthy()
    // The panel says why the newest turn is missing instead of looking stale.
    expect(container.querySelector('[data-session-files-busy]')?.textContent).toContain('when it settles')
  })

  it('waits for a pinned transcript instead of claiming it is empty', () => {
    $sessionStates.set({})
    $activeSessionId.set(null)
    $sessionFilesTarget.set({ runtimeId: 'rt-missing', storedId: 'stored-missing' })

    const { container } = render(<SessionFilesPane />)

    expect(container.textContent).toContain('Loading session')
    expect(container.textContent).not.toContain('No files yet')
  })

  it('shows the empty state when the session touched nothing', () => {
    publish([message('u1', 'user', [{ type: 'text', text: 'hello' }], 100)])
    const { container } = render(<SessionFilesPane />)

    expect(screen.getByText('No files yet')).toBeTruthy()
    expect(container.querySelector('[data-session-files-busy]')).toBeNull()
  })

  it('does not offer a filter when the session touched nothing', () => {
    publish([message('u1', 'user', [{ type: 'text', text: 'hello' }], 100)])
    render(<SessionFilesPane />)

    expect(screen.queryByPlaceholderText('Filter files')).toBeNull()
  })

  it('collapses a path touched twice into one row with its turn count', () => {
    publish(TWICE)
    const { container } = render(<SessionFilesPane />)

    fireEvent.click(screen.getByRole('button', { name: 'Group by file' }))

    const names = [...container.querySelectorAll('[data-session-file-name]')]

    expect(names).toHaveLength(1)
    expect(names[0]!.textContent).toBe('a.ts')
    expect(names[0]!.closest('[data-session-file]')?.textContent).toContain('2 turns')
    // The same button now offers the way back.
    expect(screen.getByRole('button', { name: 'Group by turn' })).toBeTruthy()
  })

  it('filters the visible files and reports when nothing matches', () => {
    publish(MESSAGES)
    const { container } = render(<SessionFilesPane />)
    const input = screen.getByPlaceholderText('Filter files') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'new' } })

    expect(container.querySelectorAll('[data-session-turn]')).toHaveLength(1)
    expect(container.textContent).toContain('1 file · 1 turn')

    fireEvent.change(input, { target: { value: 'zzz' } })

    expect(container.textContent).toContain('No file matches')

    fireEvent.keyDown(input, { key: 'Escape' })

    expect(container.querySelectorAll('[data-session-turn]')).toHaveLength(2)
    expect(input.value).toBe('')
  })
})
