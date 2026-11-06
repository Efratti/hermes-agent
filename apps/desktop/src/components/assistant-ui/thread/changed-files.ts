// Pure derivation for the assistant message's "N files changed" card: fold a
// turn's file-edit tool parts into one row per file. No React/DOM.

import {
  countDiffLineStats,
  fileEditBasename,
  fileEditPath,
  inlineDiffFromResult,
  isFileEditTool,
  parseMaybeObject
} from '@/components/assistant-ui/tool/fallback-model'
import { type ToolResultMetadata, toolResultRecord } from '@/lib/tool-result-metadata'

export type ChangedFileStatus = 'created' | 'deleted' | 'modified'

export interface ChangedFile {
  added: number
  /** Unix seconds of the last edit folded into this row, when the part carried
   *  a timeline stamp. Absent on very old hydrated rows. */
  at?: number
  /** Basename, for the row label. */
  name: string
  /** Path exactly as the tool reported it (absolute or repo-relative). */
  path: string
  removed: number
  /** Effect of the edit(s) on the file's existence, from the diff itself:
   *  a `-0,0` source hunk means it did not exist before, a `+0,0` destination
   *  hunk means it no longer exists after. Anything else is a modification. */
  status: ChangedFileStatus
}

interface ChangedFilePart {
  completedAt?: unknown
  timestamp?: unknown
  toolResultMetadata?: ToolResultMetadata
  args?: unknown
  result?: unknown
  toolName?: unknown
  type?: unknown
}

/** `/dev/null` headers and `-0,0` / `+0,0` hunks are the only creation and
 *  deletion evidence a unified diff carries; both writers (python difflib and
 *  the gateway's rendered diffs) emit them. */
function diffStatus(diff: string): ChangedFileStatus {
  if (/^---\s+\/dev\/null\s*$/m.test(diff) || /^@@+ -0,0 \+\d+(?:,\d+)? @@/m.test(diff)) {
    return 'created'
  }

  if (/^\+\+\+\s+\/dev\/null\s*$/m.test(diff) || /^@@+ -\d+(?:,\d+)? \+0,0 @@/m.test(diff)) {
    return 'deleted'
  }

  return 'modified'
}

/** Creation outranks modification (a turn that creates and then edits a file
 *  created it); deletion outranks both (that is where the file ended up). */
export function mergeStatus(previous: ChangedFileStatus, next: ChangedFileStatus): ChangedFileStatus {
  if (next === 'deleted' || previous === 'deleted') {
    return 'deleted'
  }

  if (previous === 'created' || next === 'created') {
    return 'created'
  }

  return 'modified'
}

function partTimestamp(part: ChangedFilePart): number | undefined {
  for (const value of [part.completedAt, part.timestamp]) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value
    }
  }

  return undefined
}

/**
 * One row per file the turn edited, in first-touched order, with the +/- of
 * every edit to that file summed. Only landed edits with a diff count: a call
 * still running has no result, and a failed one changed nothing.
 */
export function deriveChangedFiles(parts: readonly unknown[]): ChangedFile[] {
  const byPath = new Map<string, ChangedFile>()

  for (const raw of parts) {
    const part = (raw ?? {}) as ChangedFilePart

    if (part.type !== 'tool-call' || typeof part.toolName !== 'string' || !isFileEditTool(part.toolName)) {
      continue
    }

    const result = toolResultRecord(part)
    const diff = inlineDiffFromResult(result)

    if (!diff) {
      continue
    }

    const path = fileEditPath(parseMaybeObject(part.args), result)

    if (!path) {
      continue
    }

    const stats = countDiffLineStats(diff)
    const status = diffStatus(diff)
    const at = partTimestamp(part)
    const existing = byPath.get(path)

    if (existing) {
      existing.added += stats.added
      existing.removed += stats.removed
      existing.status = mergeStatus(existing.status, status)

      if (at !== undefined && (existing.at === undefined || at > existing.at)) {
        existing.at = at
      }
    } else {
      byPath.set(path, { added: stats.added, at, name: fileEditBasename(path), path, removed: stats.removed, status })
    }
  }

  return [...byPath.values()]
}
