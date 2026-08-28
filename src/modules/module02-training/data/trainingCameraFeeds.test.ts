import { describe, expect, it } from 'vitest'
import { MOCK_TRAINING_CAMERAS } from './trainingCameras'
import {
  getBestStreamUrl,
  inferCameraStreamType,
  resolveCameraStreamType,
  resolveCameraStreamUrl,
} from './trainingCameraFeeds'

describe('trainingCameraFeeds stream consistency', () => {
  it('Module 02 A-03/A-04 dùng getBestStreamUrl (cùng nguồn VMS như Module 03)', () => {
    const a03 = MOCK_TRAINING_CAMERAS.find(c => c.id === 'A-03')
    const a04 = MOCK_TRAINING_CAMERAS.find(c => c.id === 'A-04')
    expect(a03?.streamUrl).toBe(getBestStreamUrl('A-03'))
    expect(a04?.streamUrl).toBe(getBestStreamUrl('A-04'))
    expect(resolveCameraStreamUrl('A-03')).toBe(getBestStreamUrl('A-03'))
  })

  it('inferCameraStreamType — HC/BC bodycam, DR/FC flycam', () => {
    expect(inferCameraStreamType('HC-02')).toBe('bodycam')
    expect(inferCameraStreamType('BC-01')).toBe('bodycam')
    expect(inferCameraStreamType('DR-03')).toBe('flycam')
    expect(inferCameraStreamType('A-03')).toBe('fixed')
  })

  it('resolveCameraStreamType — streamType tường minh ưu tiên', () => {
    expect(resolveCameraStreamType('HC-02', 'mobile')).toBe('mobile')
    expect(resolveCameraStreamType('HC-02', 'fixed')).toBe('bodycam')
  })
})
