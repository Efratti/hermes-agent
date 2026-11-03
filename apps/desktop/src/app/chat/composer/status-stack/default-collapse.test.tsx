import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, it } from 'vitest'

import { $backgroundStatusBySession } from '@/store/composer-status'
import { $goalsBySession } from '@/store/goals'
import { $sessionControlBySession } from '@/store/session-control'
import { $subagentsBySession, upsertSubagent } from '@/store/subagents'
import { $todosBySession, clearSessionTodos, restoreSessionTodosFromSnapshot } from '@/store/todos'

import { QueuePanel } from '../queue-panel'

import { ComposerStatusStack } from './index'

const noop = () => {}

const queue = (parked: boolean) => (
  <QueuePanel
    busy
    editingId={null}
    entries={[{ attachments: [], id: 'queued', queuedAt: 1, text: 'Queued request' }]}
    onDelete={noop}
    onEdit={noop}
    onResume={noop}
    onSendNow={noop}
    parked={parked}
  />
)

const stack = (parked = false) => (
  <MemoryRouter>
    <ComposerStatusStack queue={queue(parked)} sessionId="owner" />
  </MemoryRouter>
)

afterEach(() => {
  cleanup()
  $backgroundStatusBySession.set({})
  $goalsBySession.set({})
  $sessionControlBySession.set({})
  $subagentsBySession.set({})
  $todosBySession.set({})
  clearSessionTodos('owner')
})

it('offers a collapsed read-only checklist from an idle session, without a running spinner', () => {
  restoreSessionTodosFromSnapshot(
    'owner',
    {
      revision: 3,
      todos: [
        { id: 'one', content: 'Already done', status: 'completed' },
        { id: 'two', content: 'Still open', status: 'in_progress' }
      ]
    },
    false
  )
  render(stack())

  const review = screen.getByRole('button', { name: /Previous tasks 1\/2/ })
  expect(review.getAttribute('aria-expanded')).toBe('false')
  expect(screen.queryByText('Still open')).toBeNull()
  fireEvent.click(review)
  expect(screen.getByText('Still open')).toBeTruthy()
  expect(screen.queryByLabelText('Running')).toBeNull()
})

it('starts every group collapsed, todos included, and expands on demand', () => {
  $todosBySession.set({ owner: [{ id: 'todo', content: 'Visible todo', status: 'in_progress' }] })
  $goalsBySession.set({ owner: { status: 'active', title: 'Hidden legacy goal', updatedAt: 1 } })
  $backgroundStatusBySession.set({
    owner: [{ id: 'process', type: 'background', state: 'running', title: 'Background process' }]
  })
  upsertSubagent('owner', { subagent_id: 'worker', goal: 'Worker task' })
  const view = render(stack())

  // The plan lives in the transcript card now; the stack pins one line. Rows
  // here duplicated the card sitting 20px above them.
  expect(screen.queryByText('Visible todo')).toBeNull()

  const todoHeader = screen.getByRole('button', { name: /Tasks 0\/1/ })
  expect(todoHeader.getAttribute('aria-expanded')).toBe('false')
  // Collapsed still reports liveness: a running todo shows the spinner.
  expect(within(todoHeader).getByLabelText('Running')).toBeTruthy()

  for (const text of ['Hidden legacy goal', 'Background process', 'Worker task', 'Queued request']) {
    expect(screen.queryByText(text)).toBeNull()
  }

  fireEvent.click(todoHeader)
  expect(screen.getByText('Visible todo')).toBeTruthy()

  act(() => upsertSubagent('owner', { subagent_id: 'worker', text: 'Progress arrived' }, false, 'subagent.progress'))
  view.rerender(stack(true))
  expect(screen.queryByText('Worker task')).toBeNull()
  expect(screen.queryByText('Queued request')).toBeNull()

  const header = screen.getByRole('button', { name: /1 Subagent/ })
  fireEvent.click(header)
  expect(screen.getByText('Worker task')).toBeTruthy()
  expect(screen.getByText('Progress arrived')).toBeTruthy()
  view.rerender(stack(false))
  expect(screen.getByText('Worker task')).toBeTruthy()
})

it('starts structured goals collapsed and preserves manual queue expansion when parked', () => {
  $sessionControlBySession.set({
    owner: {
      capability: 'supported',
      error: null,
      loading: false,
      pendingAction: null,
      snapshot: {
        goal: {
          title: 'Structured goal',
          status: 'active',
          max_turns: 20,
          turns_used: 1,
          subgoals: ['Criterion'],
          gates: [],
          contract: { outcome: '', verification: '', boundaries: '', constraints: '', stop_when: '' }
        },
        heartbeat: null,
        loop: null,
        revision: '1',
        updated_at: 1
      }
    }
  })
  const view = render(stack())
  const goal = screen.getByRole('button', { name: /Goal active/ })
  expect(goal.getAttribute('aria-expanded')).toBe('false')
  expect(screen.queryByText('Criterion')).toBeNull()
  fireEvent.click(goal)
  expect(screen.getByText('Criterion')).toBeTruthy()

  const queued = screen.getByRole('button', { name: /1 queued/i })
  fireEvent.click(queued)
  expect(screen.getByText('Queued request')).toBeTruthy()
  view.rerender(stack(true))
  expect(screen.getByText('Queued request')).toBeTruthy()
})
