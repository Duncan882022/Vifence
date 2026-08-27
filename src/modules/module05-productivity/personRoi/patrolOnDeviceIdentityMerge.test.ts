import { describe, expect, it } from 'vitest'
import { mergePatrolOnDeviceWithServerIdentity } from './patrolOnDeviceIdentityMerge'

describe('mergePatrolOnDeviceWithServerIdentity', () => {
  it('maps server identity onto local box by IoU', () => {
    const merged = mergePatrolOnDeviceWithServerIdentity(
      [{ bbox: [100, 200, 180, 400], score: 0.71 }],
      [{
        behavior: 'person',
        confidence: 0.84,
        bbox: [102, 198, 178, 402],
        worker_id: 'sgc-00000340',
        worker_name: 'sgc-00000340',
        track_id: 'ptk0033:person',
        tier: 'person',
      }],
      720,
      1280,
      720,
      1280,
    )

    expect(merged).toHaveLength(1)
    expect(merged[0].bbox).toEqual([100, 200, 180, 400])
    expect(merged[0].worker_id).toBe('sgc-00000340')
    expect(merged[0].track_id).toBe('ptk0033:person')
  })

  it('scales server bbox when frame sizes differ', () => {
    const merged = mergePatrolOnDeviceWithServerIdentity(
      [{ bbox: [50, 100, 90, 200], score: 0.65 }],
      [{
        behavior: 'person',
        confidence: 0.8,
        bbox: [100, 200, 180, 400],
        worker_id: 'sgc-1',
        track_id: 'ptk0001:person',
      }],
      360,
      640,
      720,
      1280,
    )

    expect(merged).toHaveLength(1)
    expect(merged[0].worker_id).toBe('sgc-1')
  })

  it('assigns each server hint to at most one local box', () => {
    const merged = mergePatrolOnDeviceWithServerIdentity(
      [
        { bbox: [100, 200, 180, 400], score: 0.7 },
        { bbox: [300, 200, 380, 400], score: 0.68 },
      ],
      [{
        behavior: 'person',
        confidence: 0.9,
        bbox: [102, 198, 178, 402],
        worker_id: 'sgc-a',
        track_id: 'ptk1:person',
      }],
      720,
      1280,
      720,
      1280,
    )

    expect(merged).toHaveLength(2)
    const withId = merged.filter(m => m.worker_id === 'sgc-a')
    expect(withId).toHaveLength(1)
  })
})
