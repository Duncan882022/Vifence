import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BUFFER_WAIT_TIMEOUT_MS,
  clearCameraBufferState,
  getCameraBufferedAheadMs,
  getOverlayBufferGate,
  isCameraOverlayReady,
  isOverlayBufferGateOpen,
  OVERLAY_BUFFER_TARGET_MS,
  reportCameraBufferState,
  resetCameraBufferReadiness,
  subscribeOverlayBufferGate,
} from './cameraBufferReadiness'

describe('cameraBufferReadiness', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-03T08:00:00+07:00'))
    resetCameraBufferReadiness()
  })

  afterEach(() => {
    resetCameraBufferReadiness()
    vi.useRealTimers()
  })

  it('mở sẵn khi chưa có camera nào đăng ký', () => {
    expect(isOverlayBufferGateOpen()).toBe(true)
    expect(getOverlayBufferGate().totalCount).toBe(0)
  })

  it('đóng cửa cho tới khi mọi camera đệm đủ ngưỡng', () => {
    reportCameraBufferState('HC-01', { bufferedAheadMs: 1200, needsBuffer: true })
    reportCameraBufferState('DR-03', { bufferedAheadMs: 800, needsBuffer: true })
    expect(isOverlayBufferGateOpen()).toBe(false)
    expect(getOverlayBufferGate().pending).toEqual(['DR-03', 'HC-01'])

    reportCameraBufferState('HC-01', {
      bufferedAheadMs: OVERLAY_BUFFER_TARGET_MS,
      needsBuffer: true,
    })
    expect(isOverlayBufferGateOpen()).toBe(false)
    expect(getOverlayBufferGate().pending).toEqual(['DR-03'])

    reportCameraBufferState('DR-03', {
      bufferedAheadMs: OVERLAY_BUFFER_TARGET_MS + 500,
      needsBuffer: true,
    })
    expect(isOverlayBufferGateOpen()).toBe(true)
    expect(getOverlayBufferGate().readyCount).toBe(2)
  })

  it('giữ cửa mở khi buffer tụt lại — tránh overlay nhấp nháy giữa phiên xem', () => {
    reportCameraBufferState('HC-01', {
      bufferedAheadMs: OVERLAY_BUFFER_TARGET_MS,
      needsBuffer: true,
    })
    expect(isOverlayBufferGateOpen()).toBe(true)

    reportCameraBufferState('HC-01', { bufferedAheadMs: 400, needsBuffer: true })
    expect(isOverlayBufferGateOpen()).toBe(true)
  })

  it('luồng độ trễ thấp không tính vào cửa chờ', () => {
    reportCameraBufferState('HC-02', { bufferedAheadMs: 250, needsBuffer: false })
    expect(isOverlayBufferGateOpen()).toBe(true)
    expect(getOverlayBufferGate().totalCount).toBe(0)
  })

  it('cho qua sau thời hạn chờ dù chưa đệm đủ', () => {
    reportCameraBufferState('HC-01', { bufferedAheadMs: 900, needsBuffer: true })
    expect(isOverlayBufferGateOpen()).toBe(false)

    vi.advanceTimersByTime(BUFFER_WAIT_TIMEOUT_MS + 100)
    reportCameraBufferState('HC-01', { bufferedAheadMs: 950, needsBuffer: true })

    expect(isOverlayBufferGateOpen()).toBe(true)
  })

  it('camera mới vào giữa phiên lại đóng cửa cho tới khi nó đệm đủ', () => {
    reportCameraBufferState('HC-01', {
      bufferedAheadMs: OVERLAY_BUFFER_TARGET_MS,
      needsBuffer: true,
    })
    expect(isOverlayBufferGateOpen()).toBe(true)

    reportCameraBufferState('DR-03', { bufferedAheadMs: 0, needsBuffer: true })
    expect(isOverlayBufferGateOpen()).toBe(false)
  })

  it('bỏ tile khỏi cửa khi rời màn hình', () => {
    reportCameraBufferState('HC-01', {
      bufferedAheadMs: OVERLAY_BUFFER_TARGET_MS,
      needsBuffer: true,
    })
    reportCameraBufferState('DR-03', { bufferedAheadMs: 100, needsBuffer: true })
    expect(isOverlayBufferGateOpen()).toBe(false)

    clearCameraBufferState('DR-03')
    expect(isOverlayBufferGateOpen()).toBe(true)
    expect(getCameraBufferedAheadMs('DR-03')).toBeNull()
  })

  it('báo độ trễ đo được của luồng cần đệm', () => {
    reportCameraBufferState('HC-01', { bufferedAheadMs: 4200, needsBuffer: true })
    expect(getCameraBufferedAheadMs('HC-01')).toBe(4200)

    reportCameraBufferState('HC-02', { bufferedAheadMs: 300, needsBuffer: false })
    expect(getCameraBufferedAheadMs('HC-02')).toBeNull()
  })

  it('chỉ gọi listener khi trạng thái cửa thực sự đổi', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeOverlayBufferGate(listener)

    reportCameraBufferState('HC-01', { bufferedAheadMs: 1000, needsBuffer: true })
    expect(listener).toHaveBeenCalledTimes(1)

    reportCameraBufferState('HC-01', { bufferedAheadMs: 1100, needsBuffer: true })
    expect(listener).toHaveBeenCalledTimes(1)

    reportCameraBufferState('HC-01', {
      bufferedAheadMs: OVERLAY_BUFFER_TARGET_MS,
      needsBuffer: true,
    })
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
  })

  describe('cửa chờ riêng từng camera', () => {
    it('tile đã đệm đủ vẽ được ngay, không chờ tile chậm cùng lưới', () => {
      reportCameraBufferState('HC-01', {
        bufferedAheadMs: OVERLAY_BUFFER_TARGET_MS,
        needsBuffer: true,
      })
      reportCameraBufferState('DR-03', { bufferedAheadMs: 300, needsBuffer: true })

      // Cửa chung vẫn đóng vì DR-03 chưa xong…
      expect(isOverlayBufferGateOpen()).toBe(false)
      // …nhưng HC-01 không có lý do gì phải chờ theo.
      expect(isCameraOverlayReady('HC-01')).toBe(true)
      expect(isCameraOverlayReady('DR-03')).toBe(false)
    })

    it('luồng không cần đệm và camera chưa đăng ký đều sẵn sàng ngay', () => {
      reportCameraBufferState('HC-02', { bufferedAheadMs: 120, needsBuffer: false })
      expect(isCameraOverlayReady('HC-02')).toBe(true)
      expect(isCameraOverlayReady('DR-03')).toBe(true)
    })

    it('hết hạn chờ thì cho qua dù chưa đệm đủ', () => {
      reportCameraBufferState('DR-03', { bufferedAheadMs: 200, needsBuffer: true })
      expect(isCameraOverlayReady('DR-03')).toBe(false)

      vi.advanceTimersByTime(BUFFER_WAIT_TIMEOUT_MS + 100)
      reportCameraBufferState('DR-03', { bufferedAheadMs: 220, needsBuffer: true })
      expect(isCameraOverlayReady('DR-03')).toBe(true)
    })

    it('mỗi lần một tile chuyển sang sẵn sàng đều báo cho listener', () => {
      const listener = vi.fn()
      const unsubscribe = subscribeOverlayBufferGate(listener)

      reportCameraBufferState('HC-01', { bufferedAheadMs: 100, needsBuffer: true })
      reportCameraBufferState('DR-03', { bufferedAheadMs: 100, needsBuffer: true })
      const beforeReady = listener.mock.calls.length

      reportCameraBufferState('HC-01', {
        bufferedAheadMs: OVERLAY_BUFFER_TARGET_MS,
        needsBuffer: true,
      })
      expect(listener.mock.calls.length).toBeGreaterThan(beforeReady)
      expect(isCameraOverlayReady('HC-01')).toBe(true)

      unsubscribe()
    })
  })
})
