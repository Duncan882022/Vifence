/**
 * Ảnh gửi lên `/analyze/*` phải là khung hình đầy đủ.
 *
 * Cắt theo vùng `object-cover` còn nhìn thấy sẽ tạo ra một hệ toạ độ thứ hai:
 * backend đo polygon ROI 0–1 trên mảnh đã cắt còn FE vẽ chúng trên khung đầy
 * đủ, và bbox trả về lệch hệ với bbox của luồng VMS dù hai nguồn cùng đổ vào
 * một overlay.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { captureCameraAnalyzeFrame, invalidateVideoFrameCapture } from './videoFrameCapture'

interface DrawCall {
  sx: number
  sy: number
  sw: number
  sh: number
  dw: number
  dh: number
}

let drawCalls: DrawCall[] = []

function stubCanvas() {
  const ctx = {
    drawImage: (
      _img: unknown,
      sx: number, sy: number, sw: number, sh: number,
      _dx: number, _dy: number, dw: number, dh: number,
    ) => {
      drawCalls.push({ sx, sy, sw, sh, dw, dh })
    },
  }
  return {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toDataURL: () => 'data:image/jpeg;base64,QUJD',
  }
}

function mockVideo(
  videoWidth: number,
  videoHeight: number,
  clientWidth: number,
  clientHeight: number,
): HTMLVideoElement {
  return { videoWidth, videoHeight, clientWidth, clientHeight } as HTMLVideoElement
}

describe('captureCameraAnalyzeFrame', () => {
  beforeEach(() => {
    drawCalls = []
    vi.stubGlobal('document', { createElement: () => stubCanvas() })
    vi.stubGlobal('performance', { now: () => Date.now() })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('gửi trọn khung hình kể cả khi ô hiển thị cắt bớt hai bên', () => {
    // Khung 1920×1080 trong ô vuông 400×400: object-cover che mất hai bên.
    const video = mockVideo(1920, 1080, 400, 400)
    invalidateVideoFrameCapture(video)

    const image = captureCameraAnalyzeFrame(video, 'A-03', 640, 0.72)

    expect(image).toBe('QUJD')
    expect(drawCalls).toHaveLength(1)
    const [call] = drawCalls
    expect(call.sx).toBe(0)
    expect(call.sy).toBe(0)
    expect(call.sw).toBe(1920)
    expect(call.sh).toBe(1080)
  })

  it('giữ nguyên tỉ lệ khung hình sau khi thu nhỏ về maxWidth', () => {
    const video = mockVideo(1920, 1080, 400, 400)
    invalidateVideoFrameCapture(video)

    captureCameraAnalyzeFrame(video, 'A-03', 640, 0.72)

    const [call] = drawCalls
    expect(call.dw).toBe(640)
    expect(call.dh).toBe(360)
    expect(call.dw / call.dh).toBeCloseTo(1920 / 1080, 5)
  })

  it('bodycam dọc cũng gửi trọn khung', () => {
    const video = mockVideo(720, 1280, 320, 240)
    invalidateVideoFrameCapture(video)

    captureCameraAnalyzeFrame(video, 'HC-02', 640, 0.68)

    const [call] = drawCalls
    expect(call.sw).toBe(720)
    expect(call.sh).toBe(1280)
  })

  it('chưa có metadata video thì không chụp', () => {
    const video = mockVideo(0, 0, 320, 240)
    expect(captureCameraAnalyzeFrame(video, 'A-03', 640, 0.72)).toBeNull()
    expect(drawCalls).toHaveLength(0)
  })
})
