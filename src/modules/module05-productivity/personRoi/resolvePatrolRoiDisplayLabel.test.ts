import { describe, expect, it } from 'vitest'
import { resolvePatrolRoiDisplayLabel } from './resolvePatrolRoiDisplayLabel'
import type { PersonRoiDisplay } from './types'

function track(partial: Partial<PersonRoiDisplay> & Pick<PersonRoiDisplay, 'tier'>): PersonRoiDisplay {
  return {
    trackId: 't1',
    personId: 'p1',
    label: '',
    confidence: 0.9,
    bbox: [0, 0, 10, 10],
    state: 'confirmed',
    locked: true,
    displayOpacity: 1,
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

  it('peak group — hiện số thứ tự và cỡ nhóm', () => {
    const label = resolvePatrolRoiDisplayLabel(track({
      tier: 'object',
      peakGroup: true,
      peakGroupIndex: 3,
      peakGroupSize: 12,
    }))
    expect(label).toBe('#3 · Nhóm 12')
  })

  it('person tier chưa ghi hồ sơ — vẫn hiện mã tk', () => {
    expect(resolvePatrolRoiDisplayLabel(track({
      tier: 'person',
      workerId: 'tk-00000042',
      workerName: 'tk-00000042',
    }))).toBe('tk-00000042')
  })

  it('đã ghi hồ sơ — hiện mã obj-* thay "Người"', () => {
    expect(resolvePatrolRoiDisplayLabel(track({
      tier: 'person',
      workerId: 'tk-00000042',
      workerName: 'Người',
      promotedFrom: ['obj-20260904-0002'],
    }))).toBe('obj-20260904-0002')
  })

  it('không hiện nhãn chung Người khi BE gửi worker_name generic', () => {
    expect(resolvePatrolRoiDisplayLabel(track({
      tier: 'person',
      workerId: 'tk-0000019',
      workerName: 'Người',
      promotedFrom: ['obj-20260905-0011'],
    }))).toBe('obj-20260905-0011')
  })
})
