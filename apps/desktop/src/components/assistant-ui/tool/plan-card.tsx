'use client'

import type { FC } from 'react'

import { WIDGET_SHELL_CLASS } from '@/components/chat/widget-shell'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { copyFilePath } from '@/store/file-actions'

/** An absolute path to a markdown file, the only thing a plan submission leaves behind. */
const PLAN_PATH_RE = /(?:^|[\s("'`])(\/[^\s"'`)]+\.md)\b/

function resultBody(result: unknown): Record<string, unknown> {
  if (typeof result === 'string') {
    try {
      const parsed: unknown = JSON.parse(result)

      return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }

  return result !== null && typeof result === 'object' ? (result as Record<string, unknown>) : {}
}

/**
 * The plan file a `plan_mode` call wrote, when the result names one.
 *
 * A structured `path` wins; older plugin builds only mention it inside the
 * result's prose, so the absolute `.md` in that message is the fallback.
 */
export function planPathFromResult(result: unknown): null | string {
  const body = resultBody(result)
  const path = typeof body.path === 'string' ? body.path.trim() : ''

  if (path.endsWith('.md')) {
    return path
  }

  const message = typeof body.message === 'string' ? body.message : ''

  return message.match(PLAN_PATH_RE)?.[1] ?? null
}

/**
 * The plan file as a row you can open.
 *
 * Plan mode writes the file and answers in prose, so without this the only
 * trace of the deliverable is a path inside a sentence. The row is a transcript
 * part, so it survives reloads and session switches instead of retiring with
 * the turn like the "files changed" card does.
 */
export const PlanToolCard: FC<{ path: string }> = ({ path }) => {
  const { t } = useI18n()
  const name = path.split('/').pop() || path
  const onOpen = () => void window.hermesDesktop?.openExternal(path)

  return (
    <div
      className={cn(WIDGET_SHELL_CLASS, 'mt-1.5 flex items-center gap-2 text-xs')}
      data-slot="aui_plan-file"
    >
      <span className="flex size-6 shrink-0 items-center justify-center rounded-sm border border-(--ui-stroke-secondary) bg-(--ui-bg-sidebar) text-(--ui-text-tertiary)">
        <Codicon name="file" size="0.875rem" />
      </span>
      <span className="min-w-0 flex-1 truncate text-(--ui-text-primary)" title={path}>
        {name}
      </span>
      <Button className="shrink-0" onClick={() => void copyFilePath(path)} size="micro" variant="ghost">
        {t.fileMenu.copyPath}
      </Button>
      <Button className="shrink-0" onClick={onOpen} size="micro" variant="ghost">
        {t.sessionFiles.openFile}
      </Button>
    </div>
  )
}
