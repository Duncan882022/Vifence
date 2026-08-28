import { describe, expect, it } from 'vitest'
import { isTechnicalPatrolWorkerLabel, resolvePatrolRoiDisplayLabel } from './resolvePatrolRoiDisplayLabel'
import type { PersonRoiDisplay } from './types'

function track(partial: Partial<PersonRoiDisplay>): PersonRoiDisplay {
  return {
    trackId: 't1',
    personId: 'p1',
    label: '',
    confidence: 0.9,
    bbox: [0, 0, 10, 10],
    state: 'confirmed',
    locked: true,
    tier: 'person',
    ...partial,
  }
}

describe('resolvePatrolRoiDisplayLabel', () => {
  it('identity tier — ưu tiên tên thật, không mã p-*', () => {
    const label = resolvePatrolRoiDisplayLabel(track({
      tier: 'identity',
      workerId: 'p-SGC-6688',
      workerName: 'Duncan',
    }))
    expect(label).toBe('Duncan')
  })

  it('identity tier — không hiện mã khi chưa resolve được tên', () => {
    const label = resolvePatrolRoiDisplayLabel(track({
      tier: 'identity',
      workerId: 'p-SGC-6688',
      workerName: 'p-SGC-6688',
    }))
    expect(label).toBe('—')
  })

  it('person tier — vẫn hiện mã sgc', () => {
    expect(resolvePatrolRoiDisplayLabel(track({
      tier: 'person',
      workerId: 'sgc-00000042',
      workerName: 'sgc-00000042',
    }))).toBe('sgc-00000042')
  })
})
