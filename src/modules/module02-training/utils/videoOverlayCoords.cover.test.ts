/**
 * Camera CCTV mặc định chiếu `object-cover`: video bị cắt bớt hai bên để lấp
 * đầy ô. Bbox backend gửi theo khung hình đầy đủ, nên phép chiếu phải cắt đúng
 * phần bị khuất — không được co toàn bộ khung vào vùng còn nhìn thấy.
 */
import { describe, expect, it } from 'vitest'
import {
  mapBackendBboxToOverlay,
  videoRectToOverlayPercent,
} from './videoOverlayCoords'

function mockVideo(
  videoWidth: number,
  videoHeight: number,
  clientWidth: number,
  clientHeight: number,
): HTMLVideoElement {
  return { videoWidth, videoHeight, clientWidth, clientHeight } as HTMLVideoElement
}

/** Chiếu trực tiếp bằng công thức cover — mốc đối chiếu độc lập. */
function expectedCover(
  bbox: [number, number, number, number],
  vw: number,
  vh: number,
  cw: number,
  ch: number,
) {
  return videoRectToOverlayPercent(
    { x: bbox[0], y: bbox[1], width: bbox[2] - bbox[0], height: bbox[3] - bbox[1] },
    vw,
    vh,
    cw,
    ch,
    'cover',
  )
}

describe('mapBackendBboxToOverlay — object-cover', () => {
  it('hộp giữa khung nằm giữa ô', () => {
    const video = mockVideo(1920, 1080, 400, 400)
    const mapped = mapBackendBboxToOverlay([864, 432, 1056, 648], 1920, 1080, video, 'cover')
    expect(mapped.x + mapped.w / 2).toBeCloseTo(50, 4)
    expect(mapped.y + mapped.h / 2).toBeCloseTo(50, 4)
  })

  it('hộp lệch phải khớp công thức cover, không bị kéo về giữa', () => {
    const video = mockVideo(1920, 1080, 400, 400)
    const bbox: [number, number, number, number] = [1400, 400, 1600, 800]
    const mapped = mapBackendBboxToOverlay(bbox, 1920, 1080, video, 'cover')
    const want = expectedCover(bbox, 1920, 1080, 400, 400)

    expect(mapped.x).toBeCloseTo(want.x, 4)
    expect(mapped.w).toBeCloseTo(want.w, 4)
    expect(mapped.y).toBeCloseTo(want.y, 4)
    expect(mapped.h).toBeCloseTo(want.h, 4)
  })

  it('bề rộng hộp giữ đúng tỉ lệ với bề rộng khung hình', () => {
    // Hộp rộng 10% khung 1920. Ô 400×400 cắt còn 1080px bề ngang, nên 192px
    // nguồn chiếm 192/1080 ≈ 17.78% chiều rộng ô.
    const video = mockVideo(1920, 1080, 400, 400)
    const mapped = mapBackendBboxToOverlay([864, 0, 1056, 108], 1920, 1080, video, 'cover')
    expect(mapped.w).toBeCloseTo((192 / 1080) * 100, 4)
  })

  it('vật ở mép trái bị cover cắt đi thì hộp nằm ngoài ô', () => {
    const video = mockVideo(1920, 1080, 400, 400)
    const mapped = mapBackendBboxToOverlay([0, 400, 192, 800], 1920, 1080, video, 'cover')
    expect(mapped.x + mapped.w).toBeLessThan(0)
  })

  it('object-position bottom — mốc dọc bám đáy', () => {
    const video = mockVideo(1920, 1080, 400, 300)
    const bbox: [number, number, number, number] = [800, 900, 1000, 1080]
    const mapped = mapBackendBboxToOverlay(bbox, 1920, 1080, video, 'cover', 'bottom')
    const want = videoRectToOverlayPercent(
      { x: 800, y: 900, width: 200, height: 180 },
      1920,
      1080,
      400,
      300,
      'cover',
      'bottom',
    )
    expect(mapped.x).toBeCloseTo(want.x, 4)
    expect(mapped.y).toBeCloseTo(want.y, 4)
    expect(mapped.y + mapped.h).toBeCloseTo(100, 4)
  })

  it('khung analyze nhỏ hơn video vẫn khớp sau khi scale', () => {
    const video = mockVideo(1920, 1080, 400, 400)
    const mapped = mapBackendBboxToOverlay([700, 200, 800, 400], 960, 540, video, 'cover')
    const want = expectedCover([1400, 400, 1600, 800], 1920, 1080, 400, 400)
    expect(mapped.x).toBeCloseTo(want.x, 4)
    expect(mapped.w).toBeCloseTo(want.w, 4)
  })
})
