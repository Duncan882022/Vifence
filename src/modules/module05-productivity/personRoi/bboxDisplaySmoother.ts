import type { Bbox } from './types'

interface SmoothState {
  bbox: Bbox
}

function bboxDiagonal(b: Bbox): number {
  return Math.hypot(b[2] - b[0], b[3] - b[1])
}

function maxCornerShift(a: Bbox, b: Bbox): number {
  return Math.max(
    Math.abs(a[0] - b[0]),
    Math.abs(a[1] - b[1]),
    Math.abs(a[2] - b[2]),
    Math.abs(a[3] - b[3]),
  )
}

/**
 * EMA 4 góc cho overlay — giống demo YOLO/ByteTrack trên TikTok.
 * Kalman giữ track; lớp này chỉ làm mượt cảm giác vẽ trên video 25–30 FPS.
 */
export class BboxDisplaySmoother {
  private states = new Map<string, SmoothState>()

  smooth(
    trackId: string,
    raw: Bbox,
    {
      alpha = 0.44,
      snapDiagonalRatio = 0.16,
    }: {
      alpha?: number
      snapDiagonalRatio?: number
    } = {},
  ): Bbox {
    const prev = this.states.get(trackId)
    if (!prev) {
      this.states.set(trackId, { bbox: raw })
      return raw
    }

    const diagonal = Math.max(bboxDiagonal(raw), bboxDiagonal(prev.bbox), 48)
    const shift = maxCornerShift(raw, prev.bbox)
    const blend = shift / diagonal >= snapDiagonalRatio ? 0.96 : alpha

    const out: Bbox = [
      blend * raw[0] + (1 - blend) * prev.bbox[0],
      blend * raw[1] + (1 - blend) * prev.bbox[1],
      blend * raw[2] + (1 - blend) * prev.bbox[2],
      blend * raw[3] + (1 - blend) * prev.bbox[3],
    ]
    this.states.set(trackId, { bbox: out })
    return out
  }

  reset(trackId: string): void {
    this.states.delete(trackId)
  }

  prune(activeTrackIds: Set<string>): void {
    for (const id of this.states.keys()) {
      if (!activeTrackIds.has(id)) this.states.delete(id)
    }
  }

  clear(): void {
    this.states.clear()
  }
}
