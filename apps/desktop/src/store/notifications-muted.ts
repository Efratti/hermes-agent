import { atom } from 'nanostores'

import { persistStore } from '@/lib/persist-store'
import { persistBoolean, storedBoolean } from '@/lib/storage'

// One-click global mute for OS-level notifications. Kept separate from
// `$nativeNotifyPrefs` on purpose: muting must never rewrite the user's saved
// enabled/kinds choices, so unmuting restores exactly what they had.
const NOTIFICATIONS_MUTED_STORAGE_KEY = 'hermes.desktop.notificationsMuted'

export const $notificationsMuted = atom(storedBoolean(NOTIFICATIONS_MUTED_STORAGE_KEY, false))

persistStore(
  $notificationsMuted,
  (muted, options) => persistBoolean(NOTIFICATIONS_MUTED_STORAGE_KEY, muted, options),
  false
)

// Mute every open window, not just the one whose button was pressed.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key === NOTIFICATIONS_MUTED_STORAGE_KEY) {
      $notificationsMuted.set(storedBoolean(NOTIFICATIONS_MUTED_STORAGE_KEY, false))
    }
  })
}

export function setNotificationsMuted(muted: boolean) {
  $notificationsMuted.set(muted)
}

export function toggleNotificationsMuted() {
  $notificationsMuted.set(!$notificationsMuted.get())
}
