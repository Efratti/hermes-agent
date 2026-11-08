/**
 * Regression coverage for the translation-extension crash:
 * "“workspace” failed to render — Failed to execute 'removeChild' on 'Node'".
 *
 * The DOM tests pin the guard's contract; the React test reproduces the real
 * commit that used to die, with Google Translate's re-parenting simulated the
 * way the extension actually does it (wrap the text node in a <font>).
 */
import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { installForeignDomGuard, readForeignDomMismatches } from './foreign-dom-guard'

let restore: (() => void) | null = null
let root: Root | null = null
let host: HTMLDivElement | null = null

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  delete (window as unknown as Record<string, unknown>).__hermesForeignDomMismatches
})

afterEach(() => {
  if (root) {act(() => root!.unmount())}
  root = null
  host?.remove()
  host = null
  restore?.()
  restore = null
})

/** What the Google Translate extension does to a text node: wrap it in <font>. */
function translateLikeGoogle(parent: Node, text: Node): HTMLElement {
  const font = document.createElement('font')
  parent.replaceChild(font, text)
  font.appendChild(text)
  font.setAttribute('class', 'translated-ltr')

  return font
}

describe('translation layers that reparent nodes', () => {
  it('throws on removeChild of a moved node without the guard (the reported crash)', () => {
    const parent = document.createElement('p')
    const text = document.createTextNode('hello')
    parent.appendChild(text)
    translateLikeGoogle(parent, text)

    expect(() => parent.removeChild(text)).toThrow(/not a child of this node|NotFoundError/)
  })

  it('skips only the stale removal and still removes a real child', () => {
    restore = installForeignDomGuard()

    const parent = document.createElement('p')
    const text = document.createTextNode('hello')
    parent.appendChild(text)
    translateLikeGoogle(parent, text)

    expect(() => parent.removeChild(text)).not.toThrow()
    expect(text.parentNode).toBe(parent.firstChild) // left where the translator put it

    const real = document.createElement('span')
    parent.appendChild(real)
    parent.removeChild(real)
    expect(real.parentNode).toBeNull()
  })

  it('skips an insertBefore whose reference node moved away', () => {
    restore = installForeignDomGuard()

    const parent = document.createElement('p')
    const text = document.createTextNode('hello')
    parent.appendChild(text)
    translateLikeGoogle(parent, text)

    const fresh = document.createElement('span')
    expect(() => parent.insertBefore(fresh, text)).not.toThrow()
  })

  it('inserts instead of dropping the node when the reference moved, and reports it', () => {
    restore = installForeignDomGuard()

    const parent = document.createElement('p')
    const text = document.createTextNode('hello')
    parent.appendChild(text)
    translateLikeGoogle(parent, text)

    const fresh = document.createTextNode('world')
    parent.insertBefore(fresh, text)

    // Appended, not lost: translated content must never disappear.
    expect(parent.lastChild).toBe(fresh)
    expect(readForeignDomMismatches().some(report => report.method === 'insertBefore')).toBe(true)
  })

  it('appends the replacement when the node it replaces moved away', () => {
    restore = installForeignDomGuard()

    const parent = document.createElement('p')
    const text = document.createTextNode('hello')
    parent.appendChild(text)
    translateLikeGoogle(parent, text)

    const replacement = document.createElement('em')
    expect(() => parent.replaceChild(replacement, text)).not.toThrow()
    expect(replacement.parentNode).toBe(parent)
    expect(readForeignDomMismatches().some(report => report.method === 'replaceChild')).toBe(true)
  })

  it('records what it absorbed, so a report names the call', () => {
    restore = installForeignDomGuard()

    const parent = document.createElement('p')
    const text = document.createTextNode('hello')
    parent.appendChild(text)
    translateLikeGoogle(parent, text)
    parent.removeChild(text)

    const [report] = readForeignDomMismatches()
    expect(report.method).toBe('removeChild')
    expect(report.node).toContain('#text')
    expect(report.expectedParent).toContain('P')
    expect(report.text).toBe('hello')
  })

  it('keeps a React commit alive when the text it is removing was translated', () => {
    // Without the guard React's commit throws here and the pane unmounts.
    restore = installForeignDomGuard()

    function Translatable() {
      const [shown] = useState(true)

      return createElement('p', null, shown ? 'hello' : null)
    }

    root = createRoot(host!)
    act(() => root!.render(createElement(Translatable)))

    const paragraph = host!.querySelector('p')!
    translateLikeGoogle(paragraph, paragraph.firstChild!)

    expect(() => act(() => root!.render(createElement('div', null, 'swapped')))).not.toThrow()
    expect(host!.textContent).toBe('swapped')
  })

  it('is idempotent: installing twice leaves one patch', () => {
    restore = installForeignDomGuard()
    const second = installForeignDomGuard()
    second() // no-op restore of an already-installed guard

    const parent = document.createElement('p')
    const text = document.createTextNode('x')
    parent.appendChild(text)
    translateLikeGoogle(parent, text)
    expect(() => parent.removeChild(text)).not.toThrow()
  })
})
