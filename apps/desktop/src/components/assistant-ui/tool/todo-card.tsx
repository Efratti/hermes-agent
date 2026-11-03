'use client'

import { useStore } from '@nanostores/react'
import { type FC, useState } from 'react'

import { useSessionView } from '@/app/chat/session-view'
import { SCAFFOLD_GLYPH_CLASS, SCAFFOLD_LABEL_CLASS } from '@/components/chat/scaffold-row'
import { StatusPendingIcon } from '@/components/chat/status-pending-icon'
import { Codicon } from '@/components/ui/codicon'
import { DisclosureCaret } from '@/components/ui/disclosure-caret'
import { GlyphSpinner } from '@/components/ui/glyph-spinner'
import { useI18n } from '@/i18n'
import { parseTodoRevision, parseTodos, type TodoItem, type TodoStatus, todoTree } from '@/lib/todos'
import { useStoreSelector } from '@/lib/use-session-slice'
import { cn } from '@/lib/utils'
import { $todoRevisionsBySession } from '@/store/todos'

/**
 * One `todo_list` tool call rendered as a checklist card in the transcript.
 *
 * Why a transcript card and not the composer stack: the stack is transient by
 * design (a finished list is dropped 4s after the last checkmark, an unfinished
 * one is cleared at turn end), so the plan vanished before anyone read it. A
 * transcript part is rebuilt from the stored row on every reload, so the plan
 * survives the turn, the session switch, and a restart.
 *
 * One card per write is deliberate. A step-by-step run writes the list ~once
 * per step; each card is a single collapsed line (`Tasks 2/5 · <current step>`)
 * so the turn reads as a progress log, and the card holding the live revision
 * — the newest write, tracked by the same revision watermark the store uses —
 * opens itself. Older cards stay collapsed as history.
 */
export const TodoToolCard: FC<{ result: unknown }> = ({ result }) => {
  const todos = parseTodos(result)
  const revision = parseTodoRevision(result)

  if (!todos || todos.length === 0) {
    return null
  }

  return <TodoCard revision={revision} todos={todos} />
}

/** Whether a tool result carries a renderable snapshot. Callers use this to
 *  fall back to the generic tool row for failed writes (an empty-content or
 *  bad-status item returns an error string, which must stay visible). */
export const hasTodoSnapshot = (result: unknown): boolean => {
  const todos = parseTodos(result)

  return todos !== null && todos.length > 0
}

const TodoGlyph: FC<{ status: TodoStatus }> = ({ status }) => {
  const { t } = useI18n()

  if (status === 'in_progress') {
    return (
      <GlyphSpinner
        ariaLabel={t.statusStack.running}
        className="text-[0.8rem] leading-none text-muted-foreground/80"
        spinner="braille"
      />
    )
  }

  if (status === 'pending') {
    return <StatusPendingIcon />
  }

  const glyph =
    status === 'completed'
      ? { className: 'text-emerald-500/80', name: 'pass-filled' }
      : { className: 'text-muted-foreground/45', name: 'circle-slash' }

  return <Codicon className={glyph.className} name={glyph.name} size="0.8rem" />
}

const TodoCard: FC<{ revision: null | number; todos: readonly TodoItem[] }> = ({ revision, todos }) => {
  const { t } = useI18n()
  const runtimeId = useStore(useSessionView().$runtimeId)
  const liveRevision = useStoreSelector($todoRevisionsBySession, map => (runtimeId ? map[runtimeId] : undefined))
  // null = follow the live rule; true/false = the user overrode it on this card.
  // Without the override a live card could not be closed: `isLive || opened` is
  // true no matter how many times you click it.
  const [override, setOverride] = useState<boolean | null>(null)

  const done = todos.filter(todo => todo.status === 'completed').length
  const counted = todos.filter(todo => todo.status !== 'cancelled')
  const current = todos.find(todo => todo.status === 'in_progress')

  // The newest write is the one the session store is currently pinned to; it
  // opens on its own so the live plan is readable without a click. Anything
  // older collapses to its one-line summary once a newer write lands.
  const isLive = revision !== null && liveRevision !== undefined && revision === liveRevision
  const expanded = override ?? isLive

  return (
    <div className="my-1" data-slot="todo-card">
      <button
        aria-expanded={expanded}
        className="flex w-full items-center gap-1.5 text-left"
        onClick={() => setOverride(!expanded)}
        type="button"
      >
        <DisclosureCaret open={expanded} size="1em" />
        <span className={cn(SCAFFOLD_GLYPH_CLASS, 'text-muted-foreground/70')}>
          <Codicon name="checklist" size="0.8rem" />
        </span>
        <span className={SCAFFOLD_LABEL_CLASS}>{t.statusStack.todos(done, counted.length)}</span>
        {!expanded && current && (
          // The line truncates at whatever the column fits; the native tooltip
          // keeps the full step reachable without opening the card.
          <span
            className="min-w-0 truncate text-[length:var(--conversation-tool-font-size)] text-(--conversation-scaffold-meta)"
            title={current.content}
          >
            · {current.content}
          </span>
        )}
      </button>

      {expanded && (
        <div className="mt-1 ml-[0.55rem] border-l border-border/60 pl-2.5">
          {todoTree(todos).map(([todo, depth]) => (
            <div
              className="flex items-baseline gap-1.5 py-[1.5px]"
              key={todo.id}
              style={{ paddingLeft: Math.min(depth, 4) * 12 }}
            >
              <span className={SCAFFOLD_GLYPH_CLASS}>
                <TodoGlyph status={todo.status} />
              </span>
              <span
                className={cn(
                  'min-w-0 break-words text-[length:var(--conversation-tool-font-size)] leading-(--conversation-line-height)',
                  todo.status === 'completed' || todo.status === 'cancelled'
                    ? 'text-muted-foreground/60 line-through'
                    : todo.status === 'in_progress'
                      ? 'text-foreground'
                      : 'text-muted-foreground'
                )}
              >
                {todo.content}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
