import { useStore } from '@nanostores/react'
import { type FC, useMemo } from 'react'

import { useComposerScope } from '@/app/chat/composer/scope'
import { useSessionView } from '@/app/chat/session-view'
import { deriveChangedFiles } from '@/components/assistant-ui/thread/changed-files'
import { FOCUS_RING, SessionFileRow } from '@/components/assistant-ui/thread/session-file-row'
import { WIDGET_SHELL_CLASS } from '@/components/chat/widget-shell'
import { FadeScroll } from '@/components/ui/fade-scroll'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { openReviewForPath, revealReview } from '@/store/review'
import { openSessionFiles } from '@/store/session-files'

// Four whole rows plus a sliver of the fifth: 4x36px rows, 3x4px gaps and a
// 12px peek that says "there is more" without cutting a filename in half.
// A turn that rewrites twenty files should still read as one card in the
// transcript, not a wall the user has to scroll past to reach the composer.
const MAX_ROWS_HEIGHT = '10.75rem'

// Header actions are real buttons, not underlined text: the card is a surface
// with verbs, and a bordered target is what reads as clickable.
const HEADER_ACTION_CLASS = cn(
  'shrink-0 cursor-pointer rounded-md border border-(--ui-stroke-secondary) px-2 py-0.5 text-[0.6875rem] leading-4 text-(--ui-text-secondary) transition-colors hover:border-(--ui-text-quaternary) hover:bg-(--ui-bg-hover) hover:text-(--ui-text-primary)',
  FOCUS_RING
)

/**
 * Cursor-style "N files changed" summary closing out the newest assistant turn:
 * one row per file it edited with that file's +/-, and a Review action opening
 * the diff pane (⌘G). A row click opens that file's diff directly.
 *
 * Wears the shared `WIDGET_SHELL_CLASS` so it reads as the same panel as the
 * transcript's other inline widgets rather than inventing its own chrome, and
 * borrows the session-files row so a file looks the same here and in the pane.
 */
export const ChangedFilesCard: FC<{ parts: readonly unknown[] }> = ({ parts }) => {
  const { t } = useI18n()
  const copy = t.assistant.thread
  const files = useMemo(() => deriveChangedFiles(parts), [parts])
  // Review THIS surface's repo: a tile transcript pins the pane to the tile's
  // worktree; the primary passes null (follow the active session, as before).
  const view = useSessionView()
  const viewCwd = useStore(view.$cwd)
  const scopeCwd = view.kind === 'primary' ? null : viewCwd || null
  const composerScope = useComposerScope()

  if (files.length === 0) {
    return null
  }

  return (
    <div
      className={cn(WIDGET_SHELL_CLASS, 'mt-1.5 text-[length:var(--conversation-tool-font-size)]')}
      data-slot="aui_changed-files"
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-(--ui-text-primary)">{copy.filesChanged(files.length)}</span>
        <button
          className={HEADER_ACTION_CLASS}
          onClick={() => openSessionFiles({ runtimeId: view.$runtimeId.get(), storedId: view.$storedId.get() })}
          type="button"
        >
          {copy.allSessionFiles}
        </button>
        <button className={HEADER_ACTION_CLASS} onClick={() => revealReview(scopeCwd, composerScope.target)} type="button">
          {copy.reviewChanges}
        </button>
      </div>
      <FadeScroll className="-mx-1.5 mt-2 flex flex-col gap-1 overscroll-y-auto px-1.5" maxHeight={MAX_ROWS_HEIGHT}>
        {files.map(file => (
          <SessionFileRow
            actions={{ onOpenDiff: () => void openReviewForPath(file.path, scopeCwd, composerScope.target) }}
            file={file}
            key={file.path}
            variant="card"
          />
        ))}
      </FadeScroll>
    </div>
  )
}
