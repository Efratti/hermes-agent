/**
 * Survive a translation layer that rewrites the DOM under the app.
 *
 * Browser translation (the Google Translate extension, Chrome's own translate)
 * does not just swap strings: it REPARENTS the nodes React owns, wrapping text
 * nodes in `<font>` elements. React recorded those parent/child pairs, and in
 * its commit phase asks the DOM to remove / insert before / replace a node it
 * still believes is in place. The DOM then throws
 *
 *   NotFoundError: Failed to execute 'removeChild' on 'Node':
 *   The node to be removed is not a child of this node.
 *
 * Nothing in the app can catch that usefully: it is thrown inside React's
 * commit, so the nearest error boundary unmounts whatever was committing — in
 * practice the whole workspace pane ("“workspace” failed to render"), and Retry
 * re-crashes as soon as the translator's observer fires again.
 *
 * The DOM calls that can throw `NotFoundError` are exactly three, so the guard
 * covers all three:
 *
 *  - `removeChild`: the node already lives elsewhere, so the removal is moot.
 *    Skipping it leaves React's bookkeeping one node stale until that subtree
 *    renders again — the same trade every app that survives translation makes.
 *  - `insertBefore`: the reference node moved away. Append instead of dropping
 *    the node, so translated content is never lost, only reordered.
 *  - `replaceChild`: the old node moved away. Append the replacement the same
 *    way.
 *
 * A parent/child pair that is genuinely intact goes through untouched, so
 * ordinary mounts and unmounts keep working. Each skip is recorded (bounded) on
 * `window.__hermesForeignDomMismatches` so a report names the call instead of
 * guessing.
 *
 * Installed once, from the renderer entry, before React mounts.
 */

const GUARDED = Symbol.for('hermes.foreignDomGuardInstalled')
const REPORTS_KEY = '__hermesForeignDomMismatches'
const REPORT_LIMIT = 40

export interface ForeignDomMismatch {
  method: 'removeChild' | 'insertBefore' | 'replaceChild'
  /** The node React asked about, e.g. "#text" or "SPAN". */
  node: string
  /** Its real parent when the call happened, or "" when it had none. */
  actualParent: string
  /** The parent React passed in. */
  expectedParent: string
  text: string
  at: number
  stack: string
}

interface GuardedNodePrototype extends Node {
  [GUARDED]?: true
}

interface GuardWindow extends Window {
  [REPORTS_KEY]?: ForeignDomMismatch[]
}

function describe(node: Node | null): string {
  if (!node) {
    return ''
  }

  const name = node.nodeName
  const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)

  return text ? `${name}(${text})` : name
}

function record(method: ForeignDomMismatch['method'], node: Node, expectedParent: Node): void {
  if (typeof window === 'undefined') {
    return
  }

  const scope = window as GuardWindow
  const reports = (scope[REPORTS_KEY] ??= [])

  reports.push({
    method,
    node: describe(node),
    actualParent: describe(node.parentNode),
    expectedParent: describe(expectedParent),
    text: (node.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
    at: Date.now(),
    stack: String(new Error('foreign-dom-guard').stack ?? '')
      .split('\n')
      .slice(2, 9)
      .join('\n'),
  })

  if (reports.length > REPORT_LIMIT) {
    reports.splice(0, reports.length - REPORT_LIMIT)
  }
}

/** Install the guard. Returns a restore function (tests). */
export function installForeignDomGuard(): () => void {
  if (typeof Node === 'undefined') {
    return () => {}
  }

  const proto = Node.prototype as GuardedNodePrototype

  if (proto[GUARDED]) {
    return () => {}
  }

  const removeChild = Node.prototype.removeChild
  const insertBefore = Node.prototype.insertBefore
  const replaceChild = Node.prototype.replaceChild

  Node.prototype.removeChild = function patchedRemoveChild<T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      record('removeChild', child, this)

      return child
    }

    return removeChild.call(this, child) as T
  }

  Node.prototype.insertBefore = function patchedInsertBefore<T extends Node>(
    this: Node,
    node: T,
    child: Node | null,
  ): T {
    if (child && child.parentNode !== this) {
      record('insertBefore', node, this)

      try {
        this.appendChild(node)
      } catch {
        // Nothing sensible left to do; the node stays where the translator put it.
      }

      return node
    }

    return insertBefore.call(this, node, child) as T
  }

  Node.prototype.replaceChild = function patchedReplaceChild<T extends Node>(
    this: Node,
    node: Node,
    child: T,
  ): T {
    if (child.parentNode !== this) {
      record('replaceChild', child, this)

      try {
        this.appendChild(node)
      } catch {
        // Same as above: keep the replacement off the tree rather than throw.
      }

      return child
    }

    return replaceChild.call(this, node, child) as T
  }

  proto[GUARDED] = true

  return () => {
    Node.prototype.removeChild = removeChild
    Node.prototype.insertBefore = insertBefore
    Node.prototype.replaceChild = replaceChild
    delete proto[GUARDED]
  }
}

/** Mismatches the guard absorbed since load (diagnostics; bounded). */
export function readForeignDomMismatches(): ForeignDomMismatch[] {
  if (typeof window === 'undefined') {
    return []
  }

  return [...((window as GuardWindow)[REPORTS_KEY] ?? [])]
}
