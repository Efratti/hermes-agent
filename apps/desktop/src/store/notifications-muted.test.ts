import { beforeEach, describe, expect, it } from 'vitest'

import { $notificationsMuted, setNotificationsMuted, toggleNotificationsMuted } from './notifications-muted'

const STORAGE_KEY = 'hermes.desktop.notificationsMuted'

/** Another window writes the key; the browser replays it here as a storage event. */
function otherWindowWrites(value: boolean) {
  window.localStorage.setItem(STORAGE_KEY, String(value))
  window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: String(value) }))
}

describe('$notificationsMuted', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setNotificationsMuted(false)
  })

  it('starts unmuted', () => {
    expect($notificationsMuted.get()).toBe(false)
  })

  it('persists a mute so the next launch opens muted', () => {
    setNotificationsMuted(true)
    expect($notificationsMuted.get()).toBe(true)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('true')
  })

  it('toggles back off and persists the unmute', () => {
    toggleNotificationsMuted()
    expect($notificationsMuted.get()).toBe(true)
    toggleNotificationsMuted()
    expect($notificationsMuted.get()).toBe(false)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('false')
  })

  it('follows a mute made in another window', () => {
    otherWindowWrites(true)
    expect($notificationsMuted.get()).toBe(true)

    otherWindowWrites(false)
    expect($notificationsMuted.get()).toBe(false)
  })

  it('ignores storage events for unrelated keys', () => {
    window.dispatchEvent(new StorageEvent('storage', { key: 'hermes.desktop.hapticsMuted', newValue: 'true' }))
    expect($notificationsMuted.get()).toBe(false)
  })
})
