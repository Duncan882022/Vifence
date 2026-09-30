import {
  BOTTOM_CABLE_MAX_RISE,
  BOX_SECTION,
  DUCT_WALL,
  INFERRED_COVER,
  INFERRED_EMBEDS,
  INFERRED_REBAR,
  type InferredBarSpec,
} from '../data/boxGirderSection'
import type { BimProperty, GirderZone, ObjectKind } from '../types'
import { buildTubeMesh, mergeTubeMeshes, type Vec3 } from './ifcSweptTube'

export interface MeshData {
  positions: Float32Array
  indices: Uint32Array
}

export const GIRDER_ZONES: GirderZone[] = ['bottom', 'web-left', 'web-right', 'deck']

/** Girder coords: x ngang từ tim, y từ đáy dầm, z dọc từ giữa nhịp (m). */
export function girderOriginFromBounds(min: Vec3, max: Vec3): Vec3 {
  return [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2]
}

export function zoneOfPoint(x: number, y: number): GirderZone {
  if (y < BOX_SECTION.joint1) return 'bottom'
  if (y > BOX_SECTION.joint2) return 'deck'
  return x < 0 ? 'web-left' : 'web-right'
}

export function boundsOf(positions: Float32Array): { min: Vec3; max: Vec3 } | null {
  if (positions.length < 3) return null
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < positions.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const v = positions[i + a]
      if (v < min[a]) min[a] = v
      if (v > max[a]) max[a] = v
    }
  }
  return Number.isFinite(min[0]) ? { min, max } : null
}

/** Đai kín bao cả đáy + 2 sườn: tâm nằm trong lòng hộp, cao hơn khoảng giữa 2 mạch ngừng. */
export function isBoxHoop(min: Vec3, max: Vec3): boolean {
  const cx = (min[0] + max[0]) / 2
  return Math.abs(cx) < 1.2 && max[1] - min[1] > BOX_SECTION.joint2 - BOX_SECTION.joint1
}

/** Box hoops are placed with the bottom-slab cage (they must be in before GĐ1 is cast). */
export function zoneOfBounds(min: Vec3, max: Vec3): GirderZone {
  if (isBoxHoop(min, max)) return 'bottom'
  return zoneOfPoint((min[0] + max[0]) / 2, (min[1] + max[1]) / 2)
}

export function nearGirderEnd(min: Vec3, max: Vec3, within: number): boolean {
  const half = BOX_SECTION.length / 2
  return Math.max(Math.abs(min[2]), Math.abs(max[2])) > half - within
}

type Poly = Vec3[]

function clipPoly(poly: Poly, axis: 0 | 1, value: number, keepAbove: boolean): Poly {
  const out: Poly = []
  const inside = (p: Vec3) => (keepAbove ? p[axis] >= value : p[axis] <= value)
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const ain = inside(a)
    const bin = inside(b)
    if (ain) out.push(a)
    if (ain !== bin) {
      const t = (value - a[axis]) / (b[axis] - a[axis])
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])])
    }
  }
  return out
}

/** Cắt mesh DamHop tại 2 mạch ngừng + tim dầm → bản đáy / 2 sườn / bản mặt. */
export function splitConcreteByZone(mesh: MeshData): Record<GirderZone, MeshData | null> {
  const acc: Record<GirderZone, number[]> = { bottom: [], 'web-left': [], 'web-right': [], deck: [] }
  const P = mesh.positions
  const planes: [0 | 1, number][] = [[1, BOX_SECTION.joint1], [1, BOX_SECTION.joint2], [0, 0]]
  for (let t = 0; t + 2 < mesh.indices.length; t += 3) {
    const tri: Poly = [0, 1, 2].map(k => {
      const i = mesh.indices[t + k] * 3
      return [P[i], P[i + 1], P[i + 2]] as Vec3
    })
    let pieces: Poly[] = [tri]
    for (const [axis, value] of planes) {
      const next: Poly[] = []
      for (const piece of pieces) {
        const lo = clipPoly(piece, axis, value, false)
        const hi = clipPoly(piece, axis, value, true)
        if (lo.length >= 3) next.push(lo)
        if (hi.length >= 3) next.push(hi)
      }
      pieces = next
    }
    for (const piece of pieces) {
      let cx = 0
      let cy = 0
      for (const p of piece) { cx += p[0]; cy += p[1] }
      const zone = zoneOfPoint(cx / piece.length, cy / piece.length)
      const bucket = acc[zone]
      for (let k = 1; k + 1 < piece.length; k++) {
        bucket.push(...piece[0], ...piece[k], ...piece[k + 1])
      }
    }
  }
  const out = {} as Record<GirderZone, MeshData | null>
  for (const zone of GIRDER_ZONES) {
    const flat = acc[zone]
    if (flat.length < 9) {
      out[zone] = null
      continue
    }
    const positions = new Float32Array(flat)
    const indices = new Uint32Array(positions.length / 3)
    for (let i = 0; i < indices.length; i++) indices[i] = i
    out[zone] = { positions, indices }
  }
  return out
}

function longAxis(points: Vec3[]): 0 | 1 | 2 {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const p of points) for (let a = 0; a < 3; a++) {
    if (p[a] < min[a]) min[a] = p[a]
    if (p[a] > max[a]) max[a] = p[a]
  }
  const r = [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
  return r[0] >= r[1] && r[0] >= r[2] ? 0 : r[1] >= r[2] ? 1 : 2
}

function sampleAt(line: Vec3[], axis: 0 | 1 | 2, s: number): Vec3 {
  if (s <= line[0][axis]) return line[0]
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]
    const b = line[i]
    if (s <= b[axis]) {
      const span = b[axis] - a[axis] || 1
      const t = (s - a[axis]) / span
      return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])]
    }
  }
  return line[line.length - 1]
}

/**
 * Tim bó cáp từ lưới điểm điều khiển NURBS (mỗi mặt = nửa ống).
 * Hàng đầu/cuối của một mặt nằm trên đường sinh đối diện → khoảng cách = đường kính.
 */
export function cableCenterline(faces: Vec3[][][], samples = 64): { points: Vec3[]; radius: number } | null {
  const lines: Vec3[][] = []
  const diameters: number[] = []
  for (const rows of faces) {
    if (rows.length < 2 || rows[0].length < 2) continue
    const cols = Math.min(...rows.map(r => r.length))
    const line: Vec3[] = []
    for (let j = 0; j < cols; j++) {
      let x = 0
      let y = 0
      let z = 0
      for (const row of rows) { x += row[j][0]; y += row[j][1]; z += row[j][2] }
      line.push([x / rows.length, y / rows.length, z / rows.length])
      const a = rows[0][j]
      const b = rows[rows.length - 1][j]
      diameters.push(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]))
    }
    lines.push(line)
  }
  if (!lines.length) return null
  const axis = longAxis(lines.flat())
  lines.forEach(line => line.sort((a, b) => a[axis] - b[axis]))
  const lo = Math.max(...lines.map(l => l[0][axis]))
  const hi = Math.min(...lines.map(l => l[l.length - 1][axis]))
  if (!(hi > lo)) return null
  const points: Vec3[] = []
  for (let i = 0; i <= samples; i++) {
    const s = lo + ((hi - lo) * i) / samples
    const pts = lines.map(line => sampleAt(line, axis, s))
    points.push([
      pts.reduce((v, p) => v + p[0], 0) / pts.length,
      pts.reduce((v, p) => v + p[1], 0) / pts.length,
      pts.reduce((v, p) => v + p[2], 0) / pts.length,
    ])
  }
  diameters.sort((a, b) => a - b)
  const radius = (diameters[Math.floor(diameters.length / 2)] ?? 0.09) / 2
  return { points, radius }
}

export function cableZone(points: Vec3[]): GirderZone {
  let minY = Infinity
  let maxY = -Infinity
  let sumX = 0
  for (const p of points) {
    if (p[1] < minY) minY = p[1]
    if (p[1] > maxY) maxY = p[1]
    sumX += p[0]
  }
  if (maxY - minY < BOTTOM_CABLE_MAX_RISE) return 'bottom'
  return sumX / points.length < 0 ? 'web-left' : 'web-right'
}

export interface CableAxis {
  id: string
  points: Vec3[]
  radius: number
  zone: GirderZone
  profile: string | null
}

/** Neo nhận vùng của bó có đầu gần nhất. */
export function anchorZone(center: Vec3, cables: CableAxis[]): { zone: GirderZone; cableId: string } | null {
  let best: { zone: GirderZone; cableId: string; d: number } | null = null
  for (const cable of cables) {
    for (const end of [cable.points[0], cable.points[cable.points.length - 1]]) {
      const d = Math.hypot(end[0] - center[0], end[1] - center[1], end[2] - center[2])
      if (!best || d < best.d) best = { zone: cable.zone, cableId: cable.id, d }
    }
  }
  return best ? { zone: best.zone, cableId: best.cableId } : null
}

export function cableProperties(cable: CableAxis): BimProperty[] {
  let minY = Infinity
  let maxY = -Infinity
  for (const p of cable.points) {
    if (p[1] < minY) minY = p[1]
    if (p[1] > maxY) maxY = p[1]
  }
  const mm = (v: number) => String(Math.round(v * 1000))
  return [
    { key: 'yLow', label: 'Tung độ thấp nhất', value: mm(minY), unit: 'mm', provenance: 'extracted' },
    { key: 'yEnd', label: 'Tung độ tại neo', value: mm(Math.max(cable.points[0][1], cable.points[cable.points.length - 1][1])), unit: 'mm', provenance: 'extracted' },
    { key: 'rise', label: 'Độ vồng bó', value: mm(maxY - minY), unit: 'mm', provenance: 'extracted' },
    { key: 'dDuct', label: 'Đường kính ống gen', value: mm(cable.radius * 2), unit: 'mm', provenance: 'extracted' },
  ]
}

export interface InferredPart {
  id: string
  name: string
  kind: ObjectKind
  zone: GirderZone
  tags: string[]
  style: 'solid' | 'ghost'
  mesh: MeshData
  properties: BimProperty[]
}

function lerpTable(table: readonly (readonly [number, number])[], x: number): number {
  if (x <= table[0][0]) return table[0][1]
  for (let i = 1; i < table.length; i++) {
    const [x0, y0] = table[i - 1]
    const [x1, y1] = table[i]
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0 || 1)) * (y1 - y0)
  }
  return table[table.length - 1][1]
}

const CANT_UNDERSIDE = BOX_SECTION.outer.filter(([, y]) => y >= 2.4)

/** Tim thanh ngang lớp dưới bản mặt: bám đáy cánh hẫng, không thấp hơn trần hộp. */
export function deckBottomBarY(x: number): number {
  const ax = Math.abs(x)
  const ceiling = BOX_SECTION.inner[BOX_SECTION.inner.length - 1][1] + INFERRED_COVER
  if (ax <= CANT_UNDERSIDE[0][0]) return ceiling
  return Math.max(ceiling, lerpTable(CANT_UNDERSIDE, ax) + INFERRED_COVER)
}

function range(from: number, to: number, step: number): number[] {
  const out: number[] = []
  for (let v = from; v <= to + 1e-9; v += step) out.push(Number(v.toFixed(4)))
  return out
}

function tubes(paths: Vec3[][], radius: number, radial = 4): MeshData | null {
  return mergeTubeMeshes(paths.map(p => buildTubeMesh(p, radius, radial)).filter((m): m is MeshData => m !== null))
}

function boxMesh(center: Vec3, size: Vec3): MeshData {
  const [cx, cy, cz] = center
  const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2]
  const positions = new Float32Array([
    cx - hx, cy - hy, cz - hz, cx + hx, cy - hy, cz - hz, cx + hx, cy + hy, cz - hz, cx - hx, cy + hy, cz - hz,
    cx - hx, cy - hy, cz + hz, cx + hx, cy - hy, cz + hz, cx + hx, cy + hy, cz + hz, cx - hx, cy + hy, cz + hz,
  ])
  const indices = new Uint32Array([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4,
    3, 6, 2, 3, 7, 6, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
  ])
  return { positions, indices }
}

function barProps(spec: InferredBarSpec, count: number): BimProperty[] {
  return [
    { key: 'dia', label: 'Đường kính', value: `D${spec.dia}`, provenance: 'inferred' },
    { key: 'spacing', label: 'Bước', value: String(Math.round(spec.spacing * 1000)), unit: 'mm', provenance: 'inferred' },
    { key: 'count', label: 'Số thanh', value: String(count), provenance: 'inferred' },
    { key: 'basis', label: 'Căn cứ', value: `Nội suy ${spec.note} – BIM chưa mô hình`, provenance: 'inferred' },
    { key: 'afc', label: 'Bản vẽ bố trí thép', value: null, provenance: 'required' },
  ]
}

/** Dựng các cấu kiện dầm hộp còn thiếu trong 2 file IFC (đánh dấu Đề xuất). */
export function buildInferredParts(cables: CableAxis[]): InferredPart[] {
  const S = BOX_SECTION
  const zEnd = S.length / 2 - INFERRED_COVER
  const parts: InferredPart[] = []
  const push = (part: Omit<InferredPart, 'mesh'> & { mesh: MeshData | null }) => {
    if (part.mesh) parts.push(part as InferredPart)
  }
  const r = (spec: InferredBarSpec) => spec.dia / 2000

  const topLong = INFERRED_REBAR.deckLongTop
  const topXs = range(-(S.deckWidth / 2 - 0.1), S.deckWidth / 2 - 0.1, topLong.spacing)
  push({
    id: 'inf-deck-long-top', name: topLong.name, kind: 'rebar', zone: 'deck', style: 'solid',
    tags: ['rebar-deck', 'inferred-rebar'],
    mesh: tubes(topXs.map(x => [[x, S.height - 0.1, -zEnd], [x, S.height - 0.1, zEnd]]), r(topLong)),
    properties: barProps(topLong, topXs.length),
  })

  const botLong = INFERRED_REBAR.deckLongBot
  push({
    id: 'inf-deck-long-bot', name: botLong.name, kind: 'rebar', zone: 'deck', style: 'solid',
    tags: ['rebar-deck', 'inferred-rebar'],
    mesh: tubes(topXs.map(x => {
      const y = deckBottomBarY(x) + 0.014
      return [[x, y, -zEnd], [x, y, zEnd]] as Vec3[]
    }), r(botLong)),
    properties: barProps(botLong, topXs.length),
  })

  const cantTop = INFERRED_REBAR.cantTop
  const cantZs = range(-zEnd, zEnd, cantTop.spacing)
  const xRoot = 3.0
  const xTip = S.deckWidth / 2 - 0.08
  const sides = [-1, 1]
  push({
    id: 'inf-cant-top', name: cantTop.name, kind: 'rebar', zone: 'deck', style: 'solid',
    tags: ['rebar-deck', 'inferred-rebar'],
    mesh: tubes(sides.flatMap(s => cantZs.map(z => [[s * xRoot, S.height - 0.076, z], [s * xTip, S.height - 0.076, z]] as Vec3[])), r(cantTop)),
    properties: barProps(cantTop, cantZs.length * 2),
  })

  const cantBot = INFERRED_REBAR.cantBot
  const cantXs = range(xRoot, xTip, (xTip - xRoot) / 6)
  push({
    id: 'inf-cant-bot', name: cantBot.name, kind: 'rebar', zone: 'deck', style: 'solid',
    tags: ['rebar-deck', 'inferred-rebar'],
    mesh: tubes(sides.flatMap(s => cantZs.map(z => cantXs.map(x => [s * x, deckBottomBarY(x), z] as Vec3))), r(cantBot)),
    properties: barProps(cantBot, cantZs.length * 2),
  })

  const bLow = INFERRED_REBAR.bottomLongBot
  const bLowXs = range(-2.4, 2.4, bLow.spacing).filter(x => Math.abs(x) > 0.6)
  push({
    id: 'inf-bottom-long-bot', name: bLow.name, kind: 'rebar', zone: 'bottom', style: 'solid',
    tags: ['rebar-bottom', 'inferred-rebar'],
    mesh: tubes(bLowXs.map(x => [[x, INFERRED_COVER + r(bLow), -zEnd], [x, INFERRED_COVER + r(bLow), zEnd]] as Vec3[]), r(bLow)),
    properties: barProps(bLow, bLowXs.length),
  })

  const bTop = INFERRED_REBAR.bottomLongTop
  const bTopXs = range(-2.0, 2.0, bTop.spacing)
  const bTopY = S.bottomSlabThk - INFERRED_COVER - r(bTop)
  push({
    id: 'inf-bottom-long-top', name: bTop.name, kind: 'rebar', zone: 'bottom', style: 'solid',
    tags: ['rebar-bottom', 'inferred-rebar'],
    mesh: tubes(bTopXs.map(x => [[x, bTopY, -zEnd], [x, bTopY, zEnd]] as Vec3[]), r(bTop)),
    properties: barProps(bTop, bTopXs.length),
  })

  const starter = INFERRED_REBAR.starter
  const starterZs = range(-zEnd, zEnd, starter.spacing)
  const xs = S.deckWidth / 2 - 0.45
  push({
    id: 'inf-starter', name: starter.name, kind: 'rebar', zone: 'deck', style: 'solid',
    tags: ['rebar-deck', 'rebar-starter', 'inferred-rebar'],
    mesh: tubes(sides.flatMap(s => starterZs.map(z => [
      [s * xs - 0.07, S.height - 0.12, z],
      [s * xs - 0.07, S.height + 0.35, z],
      [s * xs + 0.07, S.height + 0.35, z],
      [s * xs + 0.07, S.height - 0.12, z],
    ] as Vec3[])), r(starter)),
    properties: barProps(starter, starterZs.length * 2),
  })

  const webCx = (BOX_SECTION.inner[0][0] + BOX_SECTION.outer[1][0]) / 2
  const embedProps = (note: string): BimProperty[] => [
    { key: 'basis', label: 'Căn cứ', value: `Nội suy: ${note}`, provenance: 'inferred' },
    { key: 'afc', label: 'Bản vẽ chi tiết chôn sẵn', value: null, provenance: 'required' },
  ]

  const bearingZ = S.length / 2 - 0.6
  push({
    id: 'inf-bearing', name: INFERRED_EMBEDS.bearing.name, kind: 'embed', zone: 'bottom', style: 'solid',
    tags: ['bearing-plate'],
    mesh: mergeTubeMeshes(sides.flatMap(s => [-1, 1].map(e => boxMesh([s * webCx, -0.01, e * bearingZ], [0.5, 0.02, 0.6])))),
    properties: embedProps(INFERRED_EMBEDS.bearing.note),
  })

  const weepZ = S.length / 2 - 1.0
  push({
    id: 'inf-weep', name: INFERRED_EMBEDS.weep.name, kind: 'embed', zone: 'bottom', style: 'solid',
    tags: ['drain-pipe', 'weep-hole'],
    mesh: tubes([-1, 1].map(e => [[0, -0.02, e * weepZ], [0, S.bottomSlabThk + 0.02, e * weepZ]]), 0.025, 10),
    properties: embedProps(INFERRED_EMBEDS.weep.note),
  })

  const liftZ = S.length / 2 - 2.5
  const loop = (x: number, z: number): Vec3[] => {
    const pts: Vec3[] = [[x, S.height - 0.45, z - 0.12], [x, S.height + 0.18, z - 0.12]]
    for (let k = 1; k < 8; k++) {
      const a = Math.PI - (Math.PI * k) / 8
      pts.push([x, S.height + 0.18 + 0.12 * Math.sin(a), z + 0.12 * Math.cos(a)])
    }
    pts.push([x, S.height + 0.18, z + 0.12], [x, S.height - 0.45, z + 0.12])
    return pts
  }
  push({
    id: 'inf-lifting', name: INFERRED_EMBEDS.lifting.name, kind: 'embed', zone: 'deck', style: 'solid',
    tags: ['lifting-loop'],
    mesh: tubes(sides.flatMap(s => [-1, 1].map(e => loop(s * webCx, e * liftZ))), 0.016, 6),
    properties: embedProps(INFERRED_EMBEDS.lifting.note),
  })

  const drainX = S.deckWidth / 2 - 0.7
  const drainBottom = lerpTable(CANT_UNDERSIDE, drainX) - 0.05
  push({
    id: 'inf-drain', name: INFERRED_EMBEDS.drain.name, kind: 'embed', zone: 'deck', style: 'solid',
    tags: ['drain-pipe', 'deck-drain'],
    mesh: tubes(sides.flatMap(s => [-12, -4, 4, 12].map(z => [[s * drainX, drainBottom, z], [s * drainX, S.height + 0.01, z]] as Vec3[])), 0.05, 10),
    properties: embedProps(INFERRED_EMBEDS.drain.note),
  })

  for (const cable of cables) {
    push({
      id: `inf-duct-${cable.id}`,
      name: `Ống gen ${cable.profile ?? ''} · ${Math.round((cable.radius + DUCT_WALL) * 2000)} mm`.replace('  ', ' '),
      kind: 'dul',
      zone: cable.zone,
      style: 'ghost',
      tags: [cable.zone === 'bottom' ? 'duct-bottom' : 'duct-web', 'duct'],
      mesh: buildTubeMesh(cable.points, cable.radius + DUCT_WALL, 10),
      properties: [
        { key: 'dDuct', label: 'Đường kính ống gen', value: String(Math.round((cable.radius + DUCT_WALL) * 2000)), unit: 'mm', provenance: 'inferred' },
        { key: 'basis', label: 'Căn cứ', value: 'Nội suy bao ngoài bó cáp IFC', provenance: 'inferred' },
        { key: 'vent', label: 'Ống thông hơi / bơm vữa', value: null, provenance: 'required' },
      ],
    })
  }

  return parts
}
