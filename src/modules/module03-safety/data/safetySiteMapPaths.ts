/** OCP1 — Hạ Long Xanh site plan (viewBox 0 0 640 420) */

export const SITE_VIEWBOX = '0 0 640 420'

/** Ranh giới mặt bằng công trường — thửa đất ven vịnh, không vuông vức */
export const SITE_BOUNDARY_PATH =
  'M 44 392 L 56 272 L 96 168 L 176 64 L 320 44 L 476 54 L 596 136 L 612 272 L 588 392 L 404 410 L 236 414 Z'


export interface SiteZoneShape {
  id: string
  d: string
  labelX: number
  labelY: number
  sublabelY?: number
}

/** 7 khu vực — polygon khép kín, khe hở giữa các vùng = đường nội bộ */
export const SITE_ZONE_SHAPES: SiteZoneShape[] = [
  {
    id: 'khu-a',
    d: 'M 64 258 L 64 178 L 96 168 L 176 64 L 284 64 L 284 178 L 174 258 Z',
    labelX: 174,
    labelY: 148,
    sublabelY: 162,
  },
  {
    id: 'khu-b',
    d: 'M 296 64 L 476 54 L 576 124 L 576 248 L 456 248 L 296 178 Z',
    labelX: 416,
    labelY: 142,
    sublabelY: 156,
  },
  {
    id: 'khu-d',
    d: 'M 64 268 L 174 268 L 174 258 L 284 178 L 284 268 L 174 328 L 64 328 Z',
    labelX: 168,
    labelY: 278,
    sublabelY: 292,
  },
  {
    id: 'khu-c',
    d: 'M 296 188 L 446 248 L 446 328 L 296 328 L 296 188 Z',
    labelX: 368,
    labelY: 262,
    sublabelY: 276,
  },
  {
    id: 'crane',
    d: 'M 456 258 L 576 248 L 576 124 L 596 136 L 596 268 L 588 328 L 456 328 Z',
    labelX: 518,
    labelY: 262,
    sublabelY: 276,
  },
  {
    id: 'gate',
    d: 'M 64 338 L 144 338 L 174 328 L 174 392 L 64 392 Z',
    labelX: 108,
    labelY: 362,
  },
  {
    id: 'yard',
    d: 'M 154 338 L 588 338 L 588 392 L 404 410 L 236 414 L 174 392 L 174 338 Z',
    labelX: 348,
    labelY: 368,
    sublabelY: 382,
  },
]

/** Đường nội bộ công trường */
export const SITE_ROADS: string[] = [
  'M 284 64 L 284 328',
  'M 446 248 L 446 338',
  'M 64 258 L 576 248',
  'M 174 328 L 446 328',
  'M 154 338 L 588 338',
  'M 64 338 L 588 338',
]

export const CRANE_SYMBOL = { cx: 524, cy: 218, r: 16 }

/** Thước tỷ lệ (px ≈ mét demo) */
export const SCALE_BAR = { x: 52, y: 400, len: 80, label: '50 m' }
