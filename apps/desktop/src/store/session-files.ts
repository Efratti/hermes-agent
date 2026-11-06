// Session Files panel: open state + which transcript it inventories.
//
// The panel is SUMMON-ONLY chrome (like logs): its pane contribution exists
// only while `$sessionFilesOpen` is on, so no layout preset or adoption path
// can resurrect it. The inline changed-files card is the discoverable door,
// and the palette toggle is the keyboard door.

import { atom } from 'nanostores'

export const SESSION_FILES_PANE_ID = 'session-files'

// Wider than the file tree on purpose: this pane is a record with room for
// name, directory, status, counts and time on one line, not a tree label.
export const SESSION_FILES_DEFAULT_WIDTH = '380px'
export const SESSION_FILES_MIN_WIDTH = '300px'
export const SESSION_FILES_MAX_WIDTH = '620px'

export interface SessionFilesTarget {
  /** Live runtime id of the session whose transcript owns the files. */
  runtimeId: null | string
  /** Durable id, so the target survives a runtime rekey (resume/reconnect). */
  storedId: null | string
}

/** null = follow the active session (the palette-opened default). A card
 *  opened from a tile transcript pins that tile's session instead. */
export const $sessionFilesTarget = atom<null | SessionFilesTarget>(null)

export const $sessionFilesOpen = atom(false)

export function openSessionFiles(target: null | SessionFilesTarget = null): void {
  $sessionFilesTarget.set(target)
  $sessionFilesOpen.set(true)
}

export function closeSessionFiles(): void {
  $sessionFilesOpen.set(false)
}

export type SessionFilesView = 'file' | 'turn'

/** How the panel groups its rows; resets to 'turn' on app start. */
export const $sessionFilesView = atom<SessionFilesView>('turn')

export function setSessionFilesView(view: SessionFilesView): void {
  $sessionFilesView.set(view)
}

export function toggleSessionFiles(): void {
  if ($sessionFilesOpen.get()) {
    closeSessionFiles()

    return
  }

  openSessionFiles()
}
