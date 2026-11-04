import { useStore } from '@nanostores/react'
import { useMemo, useState } from 'react'

import type { ChangedFile } from '@/components/assistant-ui/thread/changed-files'
import { FOCUS_RING, SessionFileRow } from '@/components/assistant-ui/thread/session-file-row'
import { deriveSessionFileTurns } from '@/components/assistant-ui/thread/session-files'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { Tip } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import type { ChatMessage } from '@/lib/chat-messages'
import { isDesktopFsRemoteMode } from '@/lib/desktop-fs'
import { fmtDayTime, fmtFullDateTime } from '@/lib/time'
import { cn } from '@/lib/utils'
import { copyFilePath, revealFile } from '@/store/file-actions'
import { $panesFlipped } from '@/store/layout'
import { openReviewForPath } from '@/store/review'
import { $activeSessionId, $messages } from '@/store/session'
import { $sessionFilesTarget, closeSessionFiles, type SessionFilesTarget } from '@/store/session-files'
import { $sessionStates } from '@/store/session-states'

import { SidebarPanelLabel } from '../../shell/sidebar-label'
import { pickRevealLabel } from '../file-actions'
import { RightSidebarSectionHeader } from '../index'

const EMPTY_MESSAGES: ChatMessage[] = []

/** The live transcript a target pins, or the active session when it pins none. */
function resolveRuntimeId(
  target: null | SessionFilesTarget,
  states: Record<string, { storedSessionId: null | string }>,
  activeRuntimeId: null | string
): null | string {
  // A target with no ids pins nothing (a card clicked on a session that had
  // not minted a runtime yet) — follow the active session like the palette does.
  if (!target || (!target.runtimeId && !target.storedId)) {
    return activeRuntimeId
  }

  if (target.runtimeId && states[target.runtimeId]) {
    return target.runtimeId
  }

  if (target.storedId) {
    const match = Object.entries(states).find(([, state]) => state.storedSessionId === target.storedId)

    if (match) {
      return match[0]
    }
  }

  return null
}

/** One file inside the pane: the shared row plus the context menu that mirrors
 *  every action the hover rail offers. */
function SessionFileEntry({
  file,
  revealLabel,
  scopeCwd
}: {
  file: ChangedFile
  revealLabel: string
  scopeCwd: null | string
}) {
  const { t } = useI18n()
  const s = t.sessionFiles
  const localFs = !isDesktopFsRemoteMode()
  const onDiff = () => void openReviewForPath(file.path, scopeCwd, 'main')
  const onOpen = localFs ? () => void window.hermesDesktop?.openExternal(file.path) : undefined
  const onReveal = localFs ? () => void revealFile(file.path) : undefined

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div>
          <SessionFileRow
            actions={{ onOpen, onOpenDiff: onDiff, onReveal, revealLabel }}
            file={file}
            scopeCwd={scopeCwd}
            variant="pane"
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onDiff}>{s.openDiff}</ContextMenuItem>
        {onOpen && <ContextMenuItem onSelect={onOpen}>{s.openFile}</ContextMenuItem>}
        {onReveal && <ContextMenuItem onSelect={onReveal}>{revealLabel}</ContextMenuItem>}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => void copyFilePath(file.path)}>{t.fileMenu.copyPath}</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

/**
 * Session-scoped inventory of every file the conversation touched, grouped by
 * the turn that touched it, newest first.
 *
 * This is the stable counterpart to the inline changed-files card: the card
 * stays a "here's what just landed" summary that retires with the next prompt,
 * while this panel accumulates. It derives from the same message parts the
 * card already reads, so there is no new state to persist and nothing to keep
 * in sync — open it, and the transcript is the source of truth.
 */
export function SessionFilesPane() {
  const { t } = useI18n()
  const s = t.sessionFiles
  const panesFlipped = useStore($panesFlipped)
  const states = useStore($sessionStates)
  const activeRuntimeId = useStore($activeSessionId)
  const draftMessages = useStore($messages)
  const target = useStore($sessionFilesTarget)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())

  const runtimeId = resolveRuntimeId(target, states, activeRuntimeId)
  const state = runtimeId ? states[runtimeId] : undefined
  // A pinned target that has not hydrated yet shows nothing rather than the
  // active session's files under another session's name.
  const pinned = Boolean(target && (target.runtimeId || target.storedId))
  const messages = state?.messages ?? (pinned ? EMPTY_MESSAGES : draftMessages)
  const scopeCwd = state?.cwd || null

  // While a turn runs its assistant message is still accumulating parts; the
  // inline card withholds it for the same reason (rows that grow per write
  // thrash), so this panel shows the last settled turn instead of a list that
  // rewrites itself 30 times a second.
  // A pinned target whose slice has not hydrated yet is not an empty session;
  // saying "no files yet" there would be a lie about someone else's record.
  const hydrating = pinned && !state
  const busy = Boolean(state?.busy)
  const settled = busy && messages[messages.length - 1]?.role === 'assistant' ? messages.slice(0, -1) : messages

  const turns = useMemo(() => deriveSessionFileTurns(settled), [settled])
  const fileCount = turns.reduce((total, turn) => total + turn.files.length, 0)
  const revealLabel = pickRevealLabel(t.fileMenu.revealFinder, t.fileMenu.revealExplorer, t.fileMenu.revealFileManager)

  const toggleTurn = (id: string) => {
    setCollapsed(current => {
      const next = new Set(current)

      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }

      return next
    })
  }

  return (
    <aside
      aria-label={s.aria}
      className={cn(
        'before:pointer-events-none relative flex h-full w-full min-w-0 flex-col overflow-hidden border-(--ui-stroke-secondary) bg-(--ui-sidebar-surface-background) pt-(--titlebar-height) text-(--ui-text-tertiary)',
        panesFlipped
          ? 'border-r shadow-[inset_-0.0625rem_0_0_color-mix(in_srgb,white_18%,transparent)]'
          : 'border-l shadow-[inset_0.0625rem_0_0_color-mix(in_srgb,white_18%,transparent)]'
      )}
    >
      <RightSidebarSectionHeader data-suppress-pane-reveal-side="">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <SidebarPanelLabel data-pane-self-label="">{s.title}</SidebarPanelLabel>
          {fileCount > 0 && (
            <span className="shrink-0 truncate text-[0.6875rem] tabular-nums text-(--ui-text-quaternary)">
              {s.summary(fileCount, turns.length)}
            </span>
          )}
        </div>
        <Tip label={s.close}>
          <Button
            aria-label={s.close}
            className={cn('size-6', FOCUS_RING)}
            onClick={closeSessionFiles}
            size="icon-xs"
            variant="ghost"
          >
            <Codicon name="close" size="0.8125rem" />
          </Button>
        </Tip>
      </RightSidebarSectionHeader>

      {hydrating ? (
        <div className="flex min-h-0 flex-1 items-center justify-center gap-2 px-6 text-[0.6875rem] text-(--ui-text-tertiary)">
          <span
            aria-hidden="true"
            className="size-1.5 animate-pulse rounded-full bg-(--ui-text-quaternary) motion-reduce:animate-none"
          />
          {t.assistant.thread.loadingSession}
        </div>
      ) : turns.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <span className="flex size-9 items-center justify-center rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) text-(--ui-text-tertiary)">
            <Codicon name="files" size="1.125rem" />
          </span>
          <div className="text-[0.75rem] font-semibold text-(--ui-text-secondary)">{s.emptyTitle}</div>
          <div className="max-w-[16rem] text-[0.6875rem] leading-relaxed text-(--ui-text-tertiary)">{s.emptyBody}</div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-auto pb-4">
          {/* The newest turn is missing while it runs; say so instead of
              letting the list look like it lost files. */}
          {busy && (
            <div
              className="flex items-center gap-2 px-2.5 pt-2 pb-0.5 text-[0.6875rem] leading-4 text-(--ui-text-tertiary)"
              data-session-files-busy=""
            >
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 animate-pulse rounded-full bg-(--ui-text-quaternary) motion-reduce:animate-none"
              />
              {s.busyNote}
            </div>
          )}
          {turns.map(turn => {
            const isCollapsed = collapsed.has(turn.id)

            return (
              // The header sticks to the top of the scroll box so a long record
              // stays oriented while rows scroll under it. A <button> sizes
              // `auto` as fit-content, so it needs an explicit full width.
              <section key={turn.id}>
                <button
                  aria-expanded={!isCollapsed}
                  className={cn(
                    'sticky top-0 z-10 flex w-full items-center gap-2 border-b border-(--ui-stroke-secondary) bg-(--ui-sidebar-surface-background) px-2.5 py-1.5 text-left outline-none',
                    FOCUS_RING
                  )}
                  data-session-turn={turn.id}
                  onClick={() => toggleTurn(turn.id)}
                  type="button"
                >
                  <Codicon
                    className="shrink-0 text-(--ui-text-quaternary)"
                    name={isCollapsed ? 'chevron-right' : 'chevron-down'}
                    size="0.8125rem"
                  />
                  <span className="min-w-0 flex-1 truncate text-[0.71875rem] leading-4 font-semibold text-(--ui-text-secondary)">
                    {turn.label || s.untitledTurn}
                  </span>
                  <span className="shrink-0 rounded-full border border-(--ui-stroke-secondary) px-1.5 text-[0.625rem] leading-4 tabular-nums text-(--ui-text-tertiary)">
                    {s.fileCount(turn.files.length)}
                  </span>
                  {turn.at !== undefined && (
                    <span
                      className="shrink-0 text-[0.65625rem] leading-4 tabular-nums text-(--ui-text-tertiary)"
                      title={fmtFullDateTime.format(new Date(turn.at * 1000))}
                    >
                      {fmtDayTime.format(new Date(turn.at * 1000))}
                    </span>
                  )}
                </button>
                {!isCollapsed && (
                  <div className="mt-1.5 mb-2 flex flex-col gap-1 px-2.5">
                    {turn.files.map(file => (
                      <SessionFileEntry file={file} key={file.path} revealLabel={revealLabel} scopeCwd={scopeCwd} />
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
    </aside>
  )
}
