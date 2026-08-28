import { describe, expect, it } from 'vitest'
import { PATROL_HEATMAP_DOT_HEX, resolveDetectionDotTier } from './patrolDetectionDotUi'
import { PATROL_TIER_TOKENS } from './patrolTierTokens'

describe('resolveDetectionDotTier', () => {
  it('object tier → trắng', () => {
    expect(resolveDetectionDotTier({ tier: 'object', objectId: 'obj-1' })).toBe('object')
  })

  it('person tier → xanh', () => {
    expect(resolveDetectionDotTier({ tier: 'person', objectId: 'pers-0001' })).toBe('person')
  })

  it('identity tier + verified → tím', () => {
    expect(resolveDetectionDotTier({ tier: 'identity', verified: true, objectId: 'p-102' })).toBe('identity')
  })

  it('identity tier không cần verified (mũ) → tím', () => {
    expect(resolveDetectionDotTier({ tier: 'identity', objectId: 'pers-0001' })).toBe('identity')
  })

  it('identity tier nhưng chưa verified (flycam tầm cao) → xanh person', () => {
    expect(resolveDetectionDotTier({ tier: 'identity', verified: false, objectId: 'pers-0099' })).toBe('person')
  })

  it('suy từ objectId khi thiếu tier', () => {
    expect(resolveDetectionDotTier({ objectId: 'OBJ-0007' })).toBe('object')
    expect(resolveDetectionDotTier({ objectId: 'pers-0001' })).toBe('person')
  })

  it('màu chấm heatmap khớp PATROL_TIER_TOKENS', () => {
    expect(PATROL_HEATMAP_DOT_HEX.person).toBe(PATROL_TIER_TOKENS.person.heatmapDotHex)
    expect(PATROL_HEATMAP_DOT_HEX.identity).toBe(PATROL_TIER_TOKENS.identity.heatmapDotHex)
    expect(PATROL_HEATMAP_DOT_HEX.person).toBe('#38bdf8')
    expect(PATROL_HEATMAP_DOT_HEX.identity).toBe('#a78bfa')
  })
})
