import type { ChatMessage } from '@/lib/chat-messages'

export interface SessionFilesFixtureOptions {
  /** Repeat edits of each file inside one turn (default 1). */
  editsPerFile?: number
  /** Distinct files one turn edits (default 4). */
  filesPerTurn?: number
  /** Number of user turns to generate. */
  turns: number
}

// One diff per existence shape: modified, created, deleted. `.join('\n')` on
// use, so the case table stays readable.
const DIFFS = [
  ['--- a/src/app/file.ts', '+++ b/src/app/file.ts', '@@ -1,1 +1,2 @@', '-old', '+new', '+more'],
  ['--- a/src/app/new.ts', '+++ b/src/app/new.ts', '@@ -0,0 +1,2 @@', '+one', '+two'],
  ['--- a/src/app/gone.ts', '+++ b/src/app/gone.ts', '@@ -1,2 +0,0 @@', '-one', '-two']
] as const

type EditPart = Record<string, unknown>

function editPart(path: string, diff: string, at: number): EditPart {
  return {
    type: 'tool-call',
    toolName: 'write_file',
    args: { path },
    result: JSON.stringify({ inline_diff: diff }),
    completedAt: at
  }
}

/**
 * Deterministic transcript shaped like a long working session: one prompt and
 * one assistant row per turn, `filesPerTurn` distinct files, `editsPerFile`
 * repeat edits of each. Ids, paths and timestamps are stable across runs so a
 * budget can be compared with yesterday's budget.
 *
 * Consumers: the derivation budget suite and the pane's streaming guard. No
 * production module imports this file.
 */
export function buildSessionMessages({
  editsPerFile = 1,
  filesPerTurn = 4,
  turns
}: SessionFilesFixtureOptions): ChatMessage[] {
  const messages: ChatMessage[] = []

  for (let turn = 0; turn < turns; turn++) {
    const at = 1_700_000_000 + turn * 10

    messages.push({
      id: `u${turn}`,
      parts: [{ text: `request ${turn}`, type: 'text' }],
      role: 'user',
      timestamp: at
    } as unknown as ChatMessage)

    const parts: EditPart[] = []

    for (let file = 0; file < filesPerTurn; file++) {
      const path = `/repo/src/module-${turn % 7}/file-${file}.ts`
      const diff = DIFFS[file % DIFFS.length]!.join('\n')

      for (let edit = 0; edit < editsPerFile; edit++) {
        parts.push(editPart(path, diff, at + file + edit))
      }
    }

    messages.push({ id: `a${turn}`, parts, role: 'assistant', timestamp: at + 1 } as unknown as ChatMessage)
  }

  return messages
}
