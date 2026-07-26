/** OCP1 — Hạ Long Xanh site plan (viewBox 0 0 640 420) — 6 zone thí điểm */

export const SITE_VIEWBOX = '0 0 640 420'

export const SITE_BOUNDARY_PATH =
  'M 44 392 L 56 272 L 96 168 L 176 64 L 320 44 L 476 54 L 596 136 L 612 272 L 588 392 L 404 410 L 236 414 Z'

export interface SiteZoneShape {
  id: string
  d: string
  labelX: number
  labelY: number
  sublabelY?: number
}

export const SITE_ZONE_SHAPES: SiteZoneShape[] = [
  {
    id: 'zone-a01',
    d: 'M 64 258 L 64 178 L 96 168 L 176 64 L 284 64 L 284 178 L 174 258 Z',
    labelX: 174,
    labelY: 118,
    sublabelY: 132,
  },
  {
    id: 'zone-a02',
    d: 'M 296 64 L 476 54 L 576 124 L 576 248 L 456 248 L 296 178 Z',
    labelX: 416,
    labelY: 112,
    sublabelY: 126,
  },
  {
    id: 'zone-b01',
    d: 'M 274 178 L 294 178 L 294 268 L 274 268 Z',
    labelX: 284,
    labelY: 218,
    sublabelY: 232,
  },
  {
    id: 'zone-b02',
    d: 'M 64 268 L 174 268 L 174 328 L 64 328 Z',
    labelX: 168,
    labelY: 298,
    sublabelY: 312,
  },
  {
    id: 'zone-b03',
    d: 'M 456 258 L 576 248 L 576 328 L 456 328 Z',
    labelX: 518,
    labelY: 262,
    sublabelY: 276,
  },
  {
    id: 'zone-c01',
    d: 'M 174 328 L 446 328 L 446 392 L 174 392 Z',
    labelX: 348,
    labelY: 358,
    sublabelY: 372,
  },
]

export const SITE_ROADS: string[] = [
  'M 284 64 L 284 328',
  'M 446 248 L 446 338',
  'M 64 258 L 576 248',
  'M 174 328 L 446 328',
  'M 64 338 L 588 338',
]

export const CRANE_SYMBOL = { cx: 524, cy: 218, r: 16 }
export const SCALE_BAR = { x: 52, y: 398, w: 48, len: 48, label: '50m' }
