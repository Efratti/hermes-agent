import { describe, expect, it, vi } from 'vitest'

import type * as ChangedFilesModule from '@/components/assistant-ui/thread/changed-files'
import { buildSessionMessages } from '@/test/session-files-fixture'

const { counted } = vi.hoisted(() => ({ counted: { calls: 0 } }))

vi.mock('@/components/assistant-ui/thread/changed-files', async importOriginal => {
  const actual = await importOriginal<typeof ChangedFilesModule>()

  return {
    ...actual,
    deriveChangedFiles: (parts: readonly unknown[]) => {
      counted.calls += 1

      return actual.deriveChangedFiles(parts)
    }
  }
})

import { deriveSessionFileTurns } from '@/components/assistant-ui/thread/session-files'

const BEST_OF = 5

/** Min of N runs: the first run pays JIT warm-up, the min is the honest cost. */
function bestRun(messages: ReturnType<typeof buildSessionMessages>): number {
  let best = Number.POSITIVE_INFINITY

  for (let run = 0; run < BEST_OF; run++) {
    const started = performance.now()
    deriveSessionFileTurns(messages)
    best = Math.min(best, performance.now() - started)
  }

  return best
}

describe('deriveSessionFileTurns performance', () => {
  it('folds a 1,000-turn session inside the budget', () => {
    const small = buildSessionMessages({ filesPerTurn: 4, turns: 250 })
    const large = buildSessionMessages({ filesPerTurn: 4, turns: 1_000 })
    const smallMs = bestRun(small)
    const largeMs = bestRun(large)

    // The measured numbers are the point.
    console.info(
      `[session-files] 250 turns / 1,000 parts: ${smallMs.toFixed(1)} ms; 1,000 turns / 4,000 parts: ${largeMs.toFixed(1)} ms`
    )

    expect(smallMs).toBeLessThan(40)
    expect(largeMs).toBeLessThan(120)

    // 4x the data lands near 4x the time when the fold is linear; a quadratic
    // regression lands near 16x. Only meaningful once the small run is above
    // timer noise.
    if (smallMs > 0.5) {
      expect(largeMs / smallMs).toBeLessThan(8)
    }
  })

  it('folds each edited turn exactly once', () => {
    counted.calls = 0

    const turns = deriveSessionFileTurns(buildSessionMessages({ filesPerTurn: 2, turns: 50 }))

    expect(turns).toHaveLength(50)
    expect(counted.calls).toBe(50)
  })
})
