import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import { hasTodoSnapshot, TodoToolCard } from './todo-card'

afterEach(cleanup)

const snapshot = (todos: unknown[], revision = 1) => JSON.stringify({ revision, summary: {}, todos })

const mount = (result: unknown) =>
  render(
    <MemoryRouter>
      <TodoToolCard result={result} />
    </MemoryRouter>
  )

describe('hasTodoSnapshot', () => {
  it('accepts a written list', () => {
    expect(hasTodoSnapshot(snapshot([{ content: 'a', id: '1', status: 'pending' }]))).toBe(true)
  })

  it('rejects the error string a rejected write returns', () => {
    expect(hasTodoSnapshot("Todo item '1' has empty or missing content.")).toBe(false)
  })

  it('rejects an empty list and a missing result', () => {
    expect(hasTodoSnapshot(snapshot([]))).toBe(false)
    expect(hasTodoSnapshot(undefined)).toBe(false)
  })
})

describe('TodoToolCard', () => {
  const three = [
    { content: 'Read the contract', id: '1', status: 'completed' },
    { content: 'Write the card', id: '2', status: 'in_progress' },
    { content: 'Ship it', id: '3', status: 'pending' }
  ]

  it('summarizes the list as one collapsed line', () => {
    mount(snapshot(three))

    expect(screen.getByText('Tasks 1/3')).toBeTruthy()
    // The label already carries the count; a second bare "1/3" next to it read
    // as a duplicate in the live UI.
    expect(screen.queryByText('1/3')).toBeNull()
    // Collapsed: the live step rides the header, the full roster stays closed.
    expect(screen.getByText(/Write the card/)).toBeTruthy()
    // Truncation is visible, so the full step must stay reachable on hover.
    expect(screen.getByText(/Write the card/).getAttribute('title')).toBe('Write the card')
    expect(screen.queryByText('Read the contract')).toBeNull()
  })

  it('opens the full checklist on click', () => {
    mount(snapshot(three))
    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByText('Read the contract')).toBeTruthy()
    expect(screen.getByText('Ship it')).toBeTruthy()
  })

  it('does not count cancelled items toward the total', () => {
    mount(
      snapshot([
        { content: 'Done thing', id: '1', status: 'completed' },
        { content: 'Dropped thing', id: '2', status: 'cancelled' }
      ])
    )

    expect(screen.getByText('Tasks 1/1')).toBeTruthy()
  })

  it('renders subtasks under their parent', () => {
    mount(
      snapshot([
        { content: 'Parent', id: '1', status: 'in_progress' },
        { content: 'Child', id: '2', parent: '1', status: 'pending' }
      ])
    )
    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByText('Parent')).toBeTruthy()
    expect(screen.getByText('Child')).toBeTruthy()
  })
})
