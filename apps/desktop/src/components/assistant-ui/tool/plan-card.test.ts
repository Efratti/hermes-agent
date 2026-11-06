import { describe, expect, it } from 'vitest'

import { isCardToolName } from '@/lib/tool-render-class'

import { planPathFromResult } from './plan-card'

describe('planPathFromResult', () => {
  it('reads a structured path from the result', () => {
    const result = JSON.stringify({ action: 'submit', path: '/home/q/.hermes/plans/2026-11-05_081905-x.md' })

    expect(planPathFromResult(result)).toBe('/home/q/.hermes/plans/2026-11-05_081905-x.md')
  })

  it('falls back to the path named in the result message', () => {
    const message =
      'Plan saved to /home/q/.hermes/plans/2026-11-05_081905-terminal-autonomous-agents-research.md. Approve it to start.'

    expect(planPathFromResult({ message })).toBe(
      '/home/q/.hermes/plans/2026-11-05_081905-terminal-autonomous-agents-research.md'
    )
  })

  it('ignores results that name no plan file', () => {
    expect(planPathFromResult({ message: 'There is nothing awaiting approval.' })).toBeNull()
    expect(planPathFromResult(null)).toBeNull()
    expect(planPathFromResult('not json')).toBeNull()
  })
})

describe('plan_mode render class', () => {
  it('is a card tool, so the plan row survives run grouping and stays visible', () => {
    expect(isCardToolName('plan_mode')).toBe(true)
  })
})
