import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { ChangedFile } from '@/components/assistant-ui/thread/changed-files'

import { fileRowLabel, SessionFileRow } from './session-file-row'

const FILE: ChangedFile = {
  added: 212,
  at: 1_700_000_000,
  name: 'session-files.ts',
  path: '/repo/src/components/assistant-ui/thread/session-files.ts',
  removed: 6,
  status: 'created'
}

afterEach(cleanup)

describe('fileRowLabel', () => {
  it('names the file, its status, both counts and the directory', () => {
    expect(fileRowLabel('a.ts', 'Modified', 12, 3, 'src/lib')).toBe('a.ts, Modified, +12 −3, src/lib')
  })

  it('drops the parts a row does not show', () => {
    expect(fileRowLabel('a.ts', 'Created', 0, 4, '')).toBe('a.ts, Created, −4')
  })
})

describe('SessionFileRow', () => {
  it('carries the status letter, the name and the ± counts', () => {
    const { container } = render(
      <SessionFileRow actions={{ onOpenDiff: () => {} }} file={FILE} scopeCwd="/repo" variant="pane" />
    )

    expect(screen.getByText('session-files.ts')).toBeTruthy()
    expect(screen.getByLabelText('Created').textContent).toBe('A')
    // DiffCount splits "+212" across a sign and a spring-rendered number.
    expect(container.textContent).toContain('+212')
    expect(container.textContent).toContain('−6')
    // The directory line is repo-relative and shortened to its tail.
    expect(screen.getByText(/assistant-ui\/thread$/)).toBeTruthy()
  })

  it('exposes the row as one button whose name carries the meta', () => {
    render(<SessionFileRow actions={{ onOpenDiff: () => {} }} file={FILE} scopeCwd="/repo" variant="pane" />)

    const row = screen.getByRole('button', { name: /session-files\.ts, Created, \+212 −6/ })
    expect(row).toBeTruthy()
  })

  it('offers every pane action as its own labelled target', () => {
    render(
      <SessionFileRow
        actions={{ onOpen: () => {}, onOpenDiff: () => {}, onReveal: () => {}, revealLabel: 'Open containing folder' }}
        file={FILE}
        scopeCwd="/repo"
        variant="pane"
      />
    )

    expect(screen.getByRole('button', { name: 'Open file' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open containing folder' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy path' })).toBeTruthy()
    // No nested interactive elements: the row button holds none.
    expect(screen.getByRole('button', { name: /session-files\.ts/ }).querySelector('button')).toBeNull()
  })

  it('keeps the card row to a single action', () => {
    render(<SessionFileRow actions={{ onOpenDiff: () => {} }} file={FILE} variant="card" />)

    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Copy path' })).toBeNull()
  })
})
