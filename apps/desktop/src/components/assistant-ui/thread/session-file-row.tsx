import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { DiffCount } from '@/components/ui/diff-count'
import { FileTypeIcon } from '@/components/ui/file-type-icon'
import { OverflowTip, Tip } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import { displayPath } from '@/lib/display-path'
import { fmtClock, fmtFullDateTime } from '@/lib/time'
import { cn } from '@/lib/utils'
import { copyFilePath } from '@/store/file-actions'

import type { ChangedFile, ChangedFileStatus } from './changed-files'
import { shortDirectory } from './session-files'

/** A/M/D, the letters every git surface uses — the tooltip carries the word. */
const FILE_STATUS_LETTER: Record<ChangedFileStatus, string> = {
  created: 'A',
  deleted: 'D',
  modified: 'M'
}

const FILE_STATUS_TONE: Record<ChangedFileStatus, string> = {
  created: 'border-(--ui-green) text-(--ui-green)',
  deleted: 'border-(--ui-red) text-(--ui-red)',
  modified: 'border-(--ui-stroke-secondary) text-(--ui-text-secondary)'
}

/** The app kills `:focus-visible` outlines and the `--tw-ring-*` chain in
 *  styles.css ("No focus rings, anywhere"), so a focus indicator has to be a
 *  direct inset box-shadow — the same escape hatch the composer uses. */
export const FOCUS_RING = 'focus-visible:shadow-[inset_0_0_0_2px_var(--dt-ring)]'

/** The meta columns step aside while the rail is up, so the two occupy the
 *  same corner without either one showing through the other. */
const META_SWAP =
  'transition-opacity duration-100 group-hover/file:opacity-0 group-focus-within/file:opacity-0 motion-reduce:transition-none'

/** Status letter, right-aligned counts, right-aligned time: three fixed
 *  columns, so every row in the list shares one scan line. */
const COLUMNS = 'grid-cols-[0.875rem_minmax(0,1fr)_3.5rem]'

export interface SessionFileRowActions {
  onOpen?: () => void
  onOpenDiff: () => void
  onReveal?: () => void
  revealLabel?: string
}

interface SessionFileRowProps {
  actions: SessionFileRowActions
  file: ChangedFile
  /** Session root, so a file under it reads as a repo-relative directory.
   *  Only the pane variant renders a directory, so the card omits it. */
  scopeCwd?: null | string
  /** `pane` carries the directory line and the action rail; `card` is the
   *  single-line row inside the transcript's changed-files widget. */
  variant: 'card' | 'pane'
}

/** Turning the two visible lines into one string keeps the accessible name of
 *  the row stable while the meta columns stay decorative. */
export function fileRowLabel(name: string, status: string, added: number, removed: number, directory: string): string {
  const counts = [added > 0 ? `+${added}` : '', removed > 0 ? `−${removed}` : ''].filter(Boolean).join(' ')

  return [name, status, counts, directory].filter(Boolean).join(', ')
}

/**
 * One file, shared by the session-files panel and the transcript's inline
 * changed-files card. The whole row is the diff affordance; the rail adds the
 * two filesystem actions plus copy, and stays out of the way until the row is
 * hovered or focused so the name keeps its room at 380px.
 */
export function SessionFileRow({ actions, file, scopeCwd, variant }: SessionFileRowProps) {
  const { t } = useI18n()
  const s = t.sessionFiles
  const pane = variant === 'pane'
  const statusWord = s.status[file.status]
  const directory = shortDirectory(file.path, scopeCwd)
  const time = file.at === undefined ? '' : fmtClock.format(new Date(file.at * 1000))

  return (
    <div
      className={cn(
        'group/file relative flex w-full items-center rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) transition-colors',
        'hover:border-(--ui-text-quaternary) focus-within:border-(--ui-text-quaternary) has-[:focus-visible]:border-(--ui-text-tertiary)',
        pane ? 'min-h-12' : 'min-h-9'
      )}
      data-session-file=""
    >
      <button
        aria-label={fileRowLabel(file.name, statusWord, file.added, file.removed, directory)}
        className={cn(
          'flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md py-1.5 pr-2 pl-2 text-left outline-none active:bg-(--ui-bg-hover)',
          FOCUS_RING
        )}
        onClick={actions.onOpenDiff}
        type="button"
      >
        <span
          className={cn(
            'flex shrink-0 items-center justify-center rounded-sm border border-(--ui-stroke-secondary) bg-(--ui-bg-sidebar) text-(--ui-text-tertiary)',
            pane ? 'size-6' : 'size-5'
          )}
        >
          <FileTypeIcon path={file.path} size={pane ? '0.9375rem' : '0.75rem'} />
        </span>
        <span className={cn('grid min-w-0 flex-1 items-center gap-x-1.5', COLUMNS, pane && 'gap-y-0.5')}>
          <Tip label={statusWord}>
            <span
              aria-label={statusWord}
              className={cn(
                'flex size-3.5 items-center justify-center rounded-sm border font-mono text-[0.625rem] leading-none font-semibold',
                FILE_STATUS_TONE[file.status]
              )}
              role="img"
            >
              {FILE_STATUS_LETTER[file.status]}
            </span>
          </Tip>
          <OverflowTip label={displayPath(file.path)}>
            <span
              className="min-w-0 truncate text-[0.8125rem] leading-[1.125rem] font-medium text-(--ui-text-primary)"
              data-session-file-name=""
            >
              {file.name}
            </span>
          </OverflowTip>
          <DiffCount
            added={file.added}
            className={cn('justify-end overflow-hidden text-[0.6875rem] leading-4 whitespace-nowrap', pane && META_SWAP)}
            removed={file.removed}
          />
          {pane && (
            <>
              <span aria-hidden="true" />
              <OverflowTip label={displayPath(file.path)}>
                <span
                  className="min-w-0 truncate text-[0.6875rem] leading-4 text-(--ui-text-tertiary)"
                  data-session-file-path=""
                >
                  {directory || s.workspaceRoot}
                </span>
              </OverflowTip>
              {time ? (
                <span
                  className={cn(
                    'overflow-hidden text-right text-[0.65625rem] leading-4 tabular-nums text-(--ui-text-tertiary)',
                    META_SWAP
                  )}
                  title={file.at === undefined ? undefined : fmtFullDateTime.format(new Date(file.at * 1000))}
                >
                  {time}
                </span>
              ) : (
                <span />
              )}
            </>
          )}
        </span>
      </button>
      {pane && (
        <div
          className={cn(
            'pointer-events-none absolute inset-y-px right-px flex items-center gap-0.5 rounded-r-[5px] bg-(--ui-bg-elevated) pr-1 pl-1 opacity-0 transition-opacity duration-100 motion-reduce:transition-none',
            'group-focus-within/file:pointer-events-auto group-focus-within/file:opacity-100',
            'group-hover/file:pointer-events-auto group-hover/file:opacity-100'
          )}
          data-session-file-rail=""
        >
          {/* Blend the panel's left edge into whatever is still fading out. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 -left-4 w-4 bg-linear-to-r from-transparent to-(--ui-bg-elevated)"
          />
          {actions.onOpen && (
            <Tip label={s.openFile}>
              <Button
                aria-label={s.openFile}
                className={FOCUS_RING}
                onClick={actions.onOpen}
                size="icon-xs"
                variant="ghost"
              >
                <Codicon name="link-external" size="0.875rem" />
              </Button>
            </Tip>
          )}
          {actions.onReveal && actions.revealLabel && (
            <Tip label={actions.revealLabel}>
              <Button
                aria-label={actions.revealLabel}
                className={FOCUS_RING}
                onClick={actions.onReveal}
                size="icon-xs"
                variant="ghost"
              >
                <Codicon name="folder-opened" size="0.875rem" />
              </Button>
            </Tip>
          )}
          <Tip label={t.fileMenu.copyPath}>
            <Button
              aria-label={t.fileMenu.copyPath}
              className={FOCUS_RING}
              onClick={() => void copyFilePath(file.path)}
              size="icon-xs"
              variant="ghost"
            >
              <Codicon name="copy" size="0.8125rem" />
            </Button>
          </Tip>
        </div>
      )}
    </div>
  )
}
