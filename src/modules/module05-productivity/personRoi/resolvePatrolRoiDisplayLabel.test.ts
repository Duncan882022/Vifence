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

  it('identity tier — ẩn mã tk kỹ thuật', () => {
    const label = resolvePatrolRoiDisplayLabel(track({
      tier: 'identity',
      workerId: 'tk-00000042',
      workerName: 'tk-00000042',
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

  it('person tier — vẫn hiện mã tk', () => {
    expect(resolvePatrolRoiDisplayLabel(track({
      tier: 'person',
      workerId: 'tk-00000042',
      workerName: 'tk-00000042',
    }))).toBe('tk-00000042')
  })
})

/**
 * Thẻ Người mang ảnh badge "Đối tượng" là hệ quả của thăng hạng giữa lượt.
 * Dấu này để người xem không nhầm sang lỗi nhận dạng.
 */
describe('dấu thăng hạng trên nhãn ROI', () => {
  it('person tier — thêm mũi tên sau mã tk', () => {
    expect(resolvePatrolRoiDisplayLabel(track({
      tier: 'person',
      workerId: 'tk-00000042',
      workerName: 'tk-00000042',
      promotedFromObject: true,
    }))).toBe('tk-00000042 ↑')
  })

  it('identity tier — thêm mũi tên sau tên thật', () => {
    expect(resolvePatrolRoiDisplayLabel(track({
      tier: 'identity',
      workerId: 'p-SGC-6688',
      workerName: 'Duncan',
      promotedFromObject: true,
    }))).toBe('Duncan ↑')
  })

  it('không đánh dấu khi chưa resolve được tên — tránh nhãn "— ↑" vô nghĩa', () => {
    expect(resolvePatrolRoiDisplayLabel(track({
      tier: 'identity',
      workerId: 'tk-00000042',
      workerName: 'tk-00000042',
      promotedFromObject: true,
    }))).toBe('—')
  })

  it('không thăng hạng thì nhãn giữ nguyên', () => {
    expect(resolvePatrolRoiDisplayLabel(track({
      tier: 'person',
      workerId: 'tk-00000042',
      workerName: 'tk-00000042',
    }))).toBe('tk-00000042')
  })
})
