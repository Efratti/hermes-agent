import { describe, expect, it } from 'vitest'

import type { ChatMessage } from '@/lib/chat-messages'

import {
  aggregateSessionFiles,
  deriveSessionFileTurns,
  filterSessionFileTurns,
  matchesFileQuery,
  shortDirectory
} from './session-files'

type Part = Record<string, unknown>

const MODIFIED_DIFF = ['--- a/src/a.ts', '+++ b/src/a.ts', '@@ -1,2 +1,2 @@', '-old', '+new'].join('\n')
const CREATED_DIFF = ['--- a/src/new.ts', '+++ b/src/new.ts', '@@ -0,0 +1,2 @@', '+one', '+two'].join('\n')
const DELETED_DIFF = ['--- a/src/gone.ts', '+++ b/src/gone.ts', '@@ -1,2 +0,0 @@', '-one', '-two'].join('\n')

function edit(path: string, diff: string, at?: number): Part {
  return {
    type: 'tool-call',
    toolName: 'write_file',
    args: { path },
    result: JSON.stringify({ inline_diff: diff }),
    completedAt: at
  }
}

function message(id: string, role: ChatMessage['role'], parts: Part[], extra: Partial<ChatMessage> = {}): ChatMessage {
  return { id, role, parts, ...extra } as unknown as ChatMessage
}

const user = (id: string, text: string, timestamp: number) =>
  message(id, 'user', [{ type: 'text', text }], { timestamp })

describe('deriveSessionFileTurns', () => {
  it('groups edits under the prompt that caused them, newest turn first', () => {
    const turns = deriveSessionFileTurns([
      user('u1', 'first ask', 100),
      message('a1', 'assistant', [edit('/repo/src/a.ts', MODIFIED_DIFF, 101)], { timestamp: 101 }),
      user('u2', 'second ask', 200),
      message('a2', 'assistant', [edit('/repo/src/new.ts', CREATED_DIFF, 201)], { timestamp: 201 })
    ])

    expect(turns.map(turn => turn.id)).toEqual(['u2', 'u1'])
    expect(turns[0]!.files.map(file => file.name)).toEqual(['new.ts'])
    expect(turns[0]!.label).toBe('second ask')
  })

  it('drops turns that touched nothing and keeps the prompt as the label', () => {
    const turns = deriveSessionFileTurns([
      user('u1', 'read only', 100),
      message('a1', 'assistant', [{ type: 'text', text: 'done' }], { timestamp: 101 }),
      user('u2', 'edit it', 200),
      message('a2', 'assistant', [edit('/repo/src/a.ts', MODIFIED_DIFF)], { timestamp: 201 })
    ])

    expect(turns).toHaveLength(1)
    expect(turns[0]!.label).toBe('edit it')
  })

  it('reads created and deleted from the diff hunks', () => {
    const [turn] = deriveSessionFileTurns([
      user('u1', 'go', 100),
      message('a1', 'assistant', [
        edit('/repo/src/new.ts', CREATED_DIFF),
        edit('/repo/src/gone.ts', DELETED_DIFF),
        edit('/repo/src/a.ts', MODIFIED_DIFF)
      ])
    ])

    expect(turn!.files.map(file => file.status)).toEqual(['created', 'deleted', 'modified'])
  })

  it('sums repeat edits to one file and keeps the creation status', () => {
    const [turn] = deriveSessionFileTurns([
      user('u1', 'go', 100),
      message('a1', 'assistant', [
        edit('/repo/src/new.ts', CREATED_DIFF, 100),
        edit('/repo/src/new.ts', MODIFIED_DIFF, 140)
      ])
    ])

    expect(turn!.files).toHaveLength(1)
    expect(turn!.files[0]).toMatchObject({ added: 3, removed: 1, status: 'created', at: 140 })
  })

  it('puts the newest touch first inside a turn and stamps the turn with its prompt time', () => {
    const [turn] = deriveSessionFileTurns([
      user('u1', 'go', 300),
      message('a1', 'assistant', [edit('/repo/src/old.ts', MODIFIED_DIFF, 301), edit('/repo/src/new.ts', MODIFIED_DIFF, 310)])
    ])

    expect(turn!.at).toBe(300)
    expect(turn!.files.map(file => file.name)).toEqual(['new.ts', 'old.ts'])
  })
})

describe('aggregateSessionFiles', () => {
  it('collapses a path touched in several turns, summing churn and merging status', () => {
    const turns = deriveSessionFileTurns([
      user('u1', 'create it', 100),
      message('a1', 'assistant', [edit('/repo/src/new.ts', CREATED_DIFF, 101)], { timestamp: 101 }),
      user('u2', 'edit it again', 200),
      message('a2', 'assistant', [edit('/repo/src/new.ts', MODIFIED_DIFF, 201)], { timestamp: 201 })
    ])

    const rows = aggregateSessionFiles(turns)

    expect(rows).toHaveLength(1)
    expect(rows[0]!.turnIds).toEqual(['u2', 'u1'])
    expect(rows[0]!.file).toMatchObject({ added: 3, removed: 1, status: 'created', at: 201 })
  })

  it('orders rows by their newest touch', () => {
    const turns = deriveSessionFileTurns([
      user('u1', 'first', 100),
      message('a1', 'assistant', [edit('/repo/src/old.ts', MODIFIED_DIFF, 101)]),
      user('u2', 'second', 200),
      message('a2', 'assistant', [edit('/repo/src/new.ts', CREATED_DIFF, 201)])
    ])

    expect(aggregateSessionFiles(turns).map(row => row.file.name)).toEqual(['new.ts', 'old.ts'])
  })

  it('leaves the turn derivation untouched', () => {
    const turns = deriveSessionFileTurns([
      user('u1', 'once', 100),
      message('a1', 'assistant', [edit('/repo/src/a.ts', MODIFIED_DIFF, 101)])
    ])

    const before = structuredClone(turns)

    aggregateSessionFiles(turns)

    expect(turns).toEqual(before)
  })

  it('returns nothing for an empty transcript', () => {
    expect(aggregateSessionFiles([])).toEqual([])
  })
})

describe('matchesFileQuery', () => {
  it('matches a case-insensitive substring and accepts a blank query', () => {
    expect(matchesFileQuery('/repo/src/a.ts', 'A.TS')).toBe(true)
    expect(matchesFileQuery('/repo/src/a.ts', '  ')).toBe(true)
    expect(matchesFileQuery('/repo/src/a.ts', 'b.ts')).toBe(false)
  })
})

describe('filterSessionFileTurns', () => {
  const build = () =>
    deriveSessionFileTurns([
      user('u1', 'first ask', 100),
      message('a1', 'assistant', [edit('/repo/src/a.ts', MODIFIED_DIFF), edit('/repo/src/b.ts', MODIFIED_DIFF)]),
      user('u2', 'second ask', 200),
      message('a2', 'assistant', [edit('/repo/src/new.ts', CREATED_DIFF)])
    ])

  it('keeps the turn label and drops the files that miss', () => {
    const [turn] = filterSessionFileTurns(build(), 'a.ts')

    expect(turn!.id).toBe('u1')
    expect(turn!.label).toBe('first ask')
    expect(turn!.files.map(file => file.name)).toEqual(['a.ts'])
  })

  it('drops a turn whose files all miss', () => {
    expect(filterSessionFileTurns(build(), 'new')).toHaveLength(1)
    expect(filterSessionFileTurns(build(), 'nothing-here')).toEqual([])
  })

  it('returns the input array untouched for a blank query', () => {
    const turns = build()

    expect(filterSessionFileTurns(turns, '   ')).toBe(turns)
  })
})

describe('shortDirectory', () => {
  it('makes the path relative to the session cwd and keeps two segments', () => {
    expect(shortDirectory('/repo/src/app/x.ts', '/repo')).toBe('src/app')
    expect(shortDirectory('/repo/a/b/c/deep/file.ts', '/repo')).toBe('…/c/deep')
  })

  it('falls back to the tail of an absolute path and stays empty at the root', () => {
    expect(shortDirectory('/repo/src/a.ts')).toBe('repo/src')
    expect(shortDirectory('C:\\repo\\src\\a.ts')).toBe('…/repo/src')
    expect(shortDirectory('/repo/README.md', '/repo')).toBe('')
  })
})
