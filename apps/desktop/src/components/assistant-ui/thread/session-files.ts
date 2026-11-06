// Pure session-level view of the transcript's file edits: the same derivation
// the inline "N files changed" card runs, folded across every message and
// grouped by the user turn that caused them.

import { type ChatMessage, chatMessageText } from '@/lib/chat-messages'

import { type ChangedFile, deriveChangedFiles, mergeStatus } from './changed-files'

export interface SessionFileTurn {
  /** Unix seconds the turn's prompt was sent, when stamped. */
  at?: number
  /** Newest touch first — the panel reads as a record, not a diff. */
  files: ChangedFile[]
  /** The prompt's id: stable across re-derivations, used as the group key. */
  id: string
  /** One-line prompt excerpt. Empty when the turn began with assistant output
   *  (a resumed session whose first user row predates the loaded page). */
  label: string
}

const LABEL_MAX = 72

/**
 * The directory part of a path, shortened for a ~250px row: repo-relative when
 * the session's cwd contains it, then only the last two segments. The basename
 * is the row's own label, so repeating it here would waste the second line.
 */
export function shortDirectory(path: string, cwd?: null | string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  const root = cwd?.replace(/\\/g, '/').replace(/\/+$/, '') ?? ''
  const relative = root && normalized.startsWith(`${root}/`) ? normalized.slice(root.length + 1) : normalized
  const slash = relative.lastIndexOf('/')
  const directory = slash > 0 ? relative.slice(0, slash) : ''
  const segments = directory.split('/').filter(Boolean)

  if (segments.length === 0) {
    return ''
  }

  return segments.length > 2 ? `…/${segments.slice(-2).join('/')}` : segments.join('/')
}


function turnLabel(message: ChatMessage): string {
  const text = chatMessageText(message).replace(/\s+/g, ' ').trim()

  return text.length > LABEL_MAX ? `${text.slice(0, LABEL_MAX - 1)}…` : text
}

function sortNewestFirst(files: ChangedFile[]): ChangedFile[] {
  return files.sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
}

/**
 * Group every message's file-edit parts by turn, newest turn first.
 *
 * A turn starts at a user message and owns the assistant messages that follow
 * it, which is the same boundary the transcript groups replies on. Turns that
 * touched no files are dropped: this is an inventory, not a transcript.
 */
export function deriveSessionFileTurns(messages: readonly ChatMessage[]): SessionFileTurn[] {
  const turns: SessionFileTurn[] = []
  let parts: unknown[] = []
  let id = ''
  let label = ''
  let at: number | undefined

  const flush = () => {
    if (!id) {
      parts = []

      return
    }

    const files = deriveChangedFiles(parts)

    if (files.length > 0) {
      turns.push({ at, files: sortNewestFirst(files), id, label })
    }

    parts = []
  }

  for (const message of messages) {
    if (message.hidden) {
      continue
    }

    if (message.role === 'user') {
      flush()
      id = message.id
      label = turnLabel(message)
      at = message.timestamp

      continue
    }

    if (message.role !== 'assistant') {
      continue
    }

    if (!id) {
      id = message.id
      label = ''
      at = message.timestamp
    }

    parts.push(...message.parts)
  }

  flush()

  return turns.reverse()
}

export interface SessionFileAggregate {
  /** Merged view of every touch of this path: summed churn, merged status,
   *  newest timestamp. A copy — never the turn's own ChangedFile object. */
  file: ChangedFile
  /** Turns that touched it, most recent first. */
  turnIds: string[]
}

/** Collapse a turn-grouped inventory into one row per path: churn adds up
 *  across turns, status merges (a file created early still reads as created),
 *  time is the newest touch, and the row order is that same newest touch. */
export function aggregateSessionFiles(turns: readonly SessionFileTurn[]): SessionFileAggregate[] {
  const byPath = new Map<string, SessionFileAggregate>()

  for (const turn of turns) {
    for (const file of turn.files) {
      const existing = byPath.get(file.path)

      if (!existing) {
        byPath.set(file.path, { file: { ...file }, turnIds: [turn.id] })

        continue
      }

      existing.file.added += file.added
      existing.file.removed += file.removed
      existing.file.status = mergeStatus(existing.file.status, file.status)
      existing.turnIds.push(turn.id)

      if ((file.at ?? 0) > (existing.file.at ?? 0)) {
        existing.file.at = file.at
      }
    }
  }

  return [...byPath.values()].sort((a, b) => (b.file.at ?? 0) - (a.file.at ?? 0))
}

/** Case-insensitive substring match on the path as the tool reported it;
 *  an empty or whitespace query matches everything. */
export function matchesFileQuery(path: string, query: string): boolean {
  const needle = query.trim().toLowerCase()

  return needle === '' || path.toLowerCase().includes(needle)
}

/** Keeps only matching files, and drops turns left with none. Turn labels and
 *  ids survive, so collapsed groups stay collapsed across a filter change. */
export function filterSessionFileTurns(turns: readonly SessionFileTurn[], query: string): SessionFileTurn[] {
  if (query.trim() === '') {
    return turns as SessionFileTurn[]
  }

  return turns.flatMap(turn => {
    const files = turn.files.filter(file => matchesFileQuery(file.path, query))

    return files.length === 0 ? [] : [{ ...turn, files }]
  })
}

export function filterSessionFileAggregates(
  rows: readonly SessionFileAggregate[],
  query: string
): SessionFileAggregate[] {
  return query.trim() === ''
    ? (rows as SessionFileAggregate[])
    : rows.filter(row => matchesFileQuery(row.file.path, query))
}
