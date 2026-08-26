import { describe, expect, it } from 'vitest'

import { formatPersonOverlayLabel } from './personOverlayLabel'

describe('nhãn ROI người trên bodycam', () => {
  it('không có mã nào → Đối tượng', () => {
    expect(formatPersonOverlayLabel(null, { workerId: '', workerName: '' })).toBe('Đối tượng')
    expect(formatPersonOverlayLabel(undefined, {})).toBe('Đối tượng')
  })

  it('mã ẩn danh sgc-* → hiện mã, đây là tầng Người', () => {
    expect(
      formatPersonOverlayLabel(null, { workerId: 'sgc-00000002', workerName: '' }),
    ).toBe('sgc-00000002')
  })

  it('tên gán thủ công thắng mọi thứ khác', () => {
    expect(
      formatPersonOverlayLabel(null, {
        workerId: 'sgc-00000002',
        manualDisplayName: 'Trung',
      }),
    ).toBe('Trung')
  })
})
