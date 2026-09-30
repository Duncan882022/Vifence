import { IFC_TO_METERS } from './ifcFirstPaint'

/** web-ifc type codes — keep numeric so tests run without wasm. */
export const IFC_TYPE = {
  SWEPT_DISK: 1260650574,
  COMPOSITE_CURVE: 3732776249,
  POLYLINE: 3724593414,
  TRIMMED_CURVE: 3593883385,
  CIRCLE: 2611217952,
  LINE: 1281925730,
  MAPPED_ITEM: 2347385850,
  REPRESENTATION_MAP: 1660063152,
  SHAPE_REPRESENTATION: 4240577450,
} as const

export type Vec3 = [number, number, number]

export function ifcNumeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value !== '' && Number.isFinite(Number(value))) return Number(value)
  if (value && typeof value === 'object') {
    const rec = value as { value?: unknown; _representationValue?: unknown }
    if (typeof rec.value === 'number' && Number.isFinite(rec.value)) return rec.value
    if (typeof rec._representationValue === 'number' && Number.isFinite(rec._representationValue)) return rec._representationValue
  }
  return null
}

function vec3(values: unknown): Vec3 | null {
  if (!Array.isArray(values) || values.length < 3) return null
  const x = ifcNumeric(values[0])
  const y = ifcNumeric(values[1])
  const z = ifcNumeric(values[2])
  if (x === null || y === null || z === null) return null
  return [x, y, z]
}

function cartesian(point: unknown): Vec3 | null {
  if (!point || typeof point !== 'object') return null
  return vec3((point as { Coordinates?: unknown }).Coordinates)
}

function trimParam(trim: unknown): number | null {
  if (Array.isArray(trim)) return ifcNumeric(trim[0])
  return ifcNumeric(trim)
}

function sampleCircle(circle: Record<string, unknown>, a0: number, a1: number, sense: boolean, segments = 8): Vec3[] {
  const position = circle.Position as Record<string, unknown> | undefined
  const loc = cartesian(position?.Location) ?? [0, 0, 0]
  const axisRaw = vec3((position?.Axis as { DirectionRatios?: unknown } | undefined)?.DirectionRatios) ?? [0, 0, 1]
  const refRaw = vec3((position?.RefDirection as { DirectionRatios?: unknown } | undefined)?.DirectionRatios)
    ?? [1, 0, 0]
  const radius = ifcNumeric(circle.Radius) ?? 0
  const ax = axisRaw
  const dx = refRaw
  const dy: Vec3 = [
    ax[1] * dx[2] - ax[2] * dx[1],
    ax[2] * dx[0] - ax[0] * dx[2],
    ax[0] * dx[1] - ax[1] * dx[0],
  ]
  const degrees = Math.abs(a0) > Math.PI * 2 + 0.5 || Math.abs(a1) > Math.PI * 2 + 0.5
  let t0 = degrees ? (a0 * Math.PI) / 180 : a0
  let t1 = degrees ? (a1 * Math.PI) / 180 : a1
  if (!sense) {
    const swap = t0
    t0 = t1
    t1 = swap
  }
  let span = t1 - t0
  if (sense && span < 0) span += Math.PI * 2
  if (!sense && span > 0) span -= Math.PI * 2
  const pts: Vec3[] = []
  for (let i = 0; i <= segments; i++) {
    const t = t0 + (span * i) / segments
    const c = Math.cos(t)
    const s = Math.sin(t)
    pts.push([
      loc[0] + radius * (dx[0] * c + dy[0] * s),
      loc[1] + radius * (dx[1] * c + dy[1] * s),
      loc[2] + radius * (dx[2] * c + dy[2] * s),
    ])
  }
  return pts
}

function sampleLine(line: Record<string, unknown>, u0: number, u1: number): Vec3[] {
  const pnt = cartesian(line.Pnt) ?? [0, 0, 0]
  const dir = vec3((line.Dir as { DirectionRatios?: unknown } | undefined)?.DirectionRatios)
    ?? vec3((line.Dir as { Orientation?: { DirectionRatios?: unknown } } | undefined)?.Orientation?.DirectionRatios)
    ?? [1, 0, 0]
  const mag = ifcNumeric((line.Dir as { Magnitude?: unknown } | undefined)?.Magnitude) ?? 1
  return [
    [pnt[0] + dir[0] * mag * u0, pnt[1] + dir[1] * mag * u0, pnt[2] + dir[2] * mag * u0],
    [pnt[0] + dir[0] * mag * u1, pnt[1] + dir[1] * mag * u1, pnt[2] + dir[2] * mag * u1],
  ]
}

export function curvePoints(curve: unknown): Vec3[] {
  if (!curve || typeof curve !== 'object') return []
  const node = curve as Record<string, unknown> & { type?: number }
  if (node.type === IFC_TYPE.POLYLINE) {
    return ((node.Points as unknown[]) ?? []).map(cartesian).filter((p): p is Vec3 => p !== null)
  }
  if (node.type === IFC_TYPE.COMPOSITE_CURVE) {
    const out: Vec3[] = []
    for (const seg of (node.Segments as unknown[]) ?? []) {
      if (!seg || typeof seg !== 'object') continue
      const parent = (seg as { ParentCurve?: unknown }).ParentCurve
      const pts = curvePoints(parent)
      const sameSense = (seg as { SameSense?: unknown }).SameSense
      const ordered = sameSense === false || ifcNumeric(sameSense) === 0 ? [...pts].reverse() : [...pts]
      if (out.length && ordered.length) ordered.shift()
      out.push(...ordered)
    }
    return out
  }
  if (node.type === IFC_TYPE.TRIMMED_CURVE) {
    const a0 = trimParam(node.Trim1) ?? 0
    const a1 = trimParam(node.Trim2) ?? 1
    const sense = (node.SenseAgreement as { value?: boolean } | boolean | undefined)
    const agree = typeof sense === 'boolean' ? sense : sense?.value !== false
    const basis = node.BasisCurve as Record<string, unknown> & { type?: number }
    if (basis?.type === IFC_TYPE.CIRCLE) return sampleCircle(basis, a0, a1, agree)
    if (basis?.type === IFC_TYPE.LINE) return sampleLine(basis, a0, a1)
    return curvePoints(basis)
  }
  if (node.type === IFC_TYPE.CIRCLE) return sampleCircle(node, 0, Math.PI * 2, true, 12)
  return []
}

export interface SweptDiskPath {
  points: Vec3[]
  radius: number
}

/** Rigid frame: columns x, y, z + translation t (IFC units). */
export interface Placement {
  x: Vec3
  y: Vec3
  z: Vec3
  t: Vec3
}

export const IDENTITY_PLACEMENT: Placement = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1], t: [0, 0, 0] }

function direction(node: unknown): Vec3 | null {
  return vec3((node as { DirectionRatios?: unknown } | undefined)?.DirectionRatios)
}

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

function crossV(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

export function axis2Placement(node: unknown): Placement {
  if (!node || typeof node !== 'object') return IDENTITY_PLACEMENT
  const rec = node as Record<string, unknown>
  const t = cartesian(rec.Location) ?? [0, 0, 0]
  const z = normalize(direction(rec.Axis) ?? [0, 0, 1])
  const ref = direction(rec.RefDirection) ?? (Math.abs(z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])
  const d = ref[0] * z[0] + ref[1] * z[1] + ref[2] * z[2]
  const x = normalize([ref[0] - d * z[0], ref[1] - d * z[1], ref[2] - d * z[2]])
  return { x, y: crossV(z, x), z, t }
}

export function applyPlacement(P: Placement, p: Vec3): Vec3 {
  return [
    P.x[0] * p[0] + P.y[0] * p[1] + P.z[0] * p[2] + P.t[0],
    P.x[1] * p[0] + P.y[1] * p[1] + P.z[1] * p[2] + P.t[1],
    P.x[2] * p[0] + P.y[2] * p[1] + P.z[2] * p[2] + P.t[2],
  ]
}

/** a ∘ b — apply b first, then a. */
export function composePlacement(a: Placement, b: Placement): Placement {
  const rot = (v: Vec3): Vec3 => [
    a.x[0] * v[0] + a.y[0] * v[1] + a.z[0] * v[2],
    a.x[1] * v[0] + a.y[1] * v[1] + a.z[1] * v[2],
    a.x[2] * v[0] + a.y[2] * v[1] + a.z[2] * v[2],
  ]
  return { x: rot(b.x), y: rot(b.y), z: rot(b.z), t: applyPlacement(a, b.t) }
}

/** IfcLocalPlacement chain (flattened GetLine) → world placement. */
export function localPlacement(node: unknown, depth = 0): Placement {
  if (!node || typeof node !== 'object' || depth > 16) return IDENTITY_PLACEMENT
  const rec = node as Record<string, unknown>
  const parent = rec.PlacementRelTo ? localPlacement(rec.PlacementRelTo, depth + 1) : IDENTITY_PLACEMENT
  return composePlacement(parent, axis2Placement(rec.RelativePlacement))
}

function mappingPlacement(item: Record<string, unknown>): Placement {
  const source = item.MappingSource as { MappingOrigin?: unknown } | undefined
  const origin = axis2Placement(source?.MappingOrigin)
  const target = item.MappingTarget as Record<string, unknown> | undefined
  if (!target) return origin
  const x = normalize(direction(target.Axis1) ?? [1, 0, 0])
  const y = normalize(direction(target.Axis2) ?? [0, 1, 0])
  const z = normalize(direction(target.Axis3) ?? crossV(x, y))
  const t = cartesian(target.LocalOrigin) ?? [0, 0, 0]
  return composePlacement({ x, y, z, t }, origin)
}

function asType(node: unknown): number | null {
  if (!node || typeof node !== 'object') return null
  const t = (node as { type?: unknown }).type
  return typeof t === 'number' ? t : null
}

/** Walks a flattened product; points come back in world IFC units when ObjectPlacement is present. */
export function collectSweptDisks(
  node: unknown,
  out: SweptDiskPath[] = [],
  depth = 0,
  transform: Placement = IDENTITY_PLACEMENT,
): SweptDiskPath[] {
  if (!node || depth > 12) return out
  if (Array.isArray(node)) {
    node.forEach(item => collectSweptDisks(item, out, depth + 1, transform))
    return out
  }
  if (typeof node !== 'object') return out
  const rec = node as Record<string, unknown>
  const type = asType(rec)
  if (type === IFC_TYPE.SWEPT_DISK) {
    const points = curvePoints(rec.Directrix).map(p => applyPlacement(transform, p))
    const radius = ifcNumeric(rec.Radius) ?? 6
    if (points.length >= 2) out.push({ points, radius })
    return out
  }
  if (type === IFC_TYPE.MAPPED_ITEM) {
    const next = composePlacement(transform, mappingPlacement(rec))
    collectSweptDisks((rec.MappingSource as { MappedRepresentation?: unknown } | undefined)?.MappedRepresentation, out, depth + 1, next)
    return out
  }
  const own = depth === 0 && rec.ObjectPlacement ? localPlacement(rec.ObjectPlacement) : transform
  if (rec.Representation) collectSweptDisks(rec.Representation, out, depth + 1, own)
  if (rec.Representations) collectSweptDisks(rec.Representations, out, depth + 1, own)
  if (rec.Items) collectSweptDisks(rec.Items, out, depth + 1, own)
  return out
}

/** Handle refs left unresolved by a flattened GetLine. */
export type LineResolver = (ref: unknown) => unknown

/** NURBS control grids (rows of points) of every B-spline face, in world IFC units. */
export function collectBsplineFaces(
  node: unknown,
  resolve: LineResolver,
  out: Vec3[][][] = [],
  depth = 0,
  transform: Placement = IDENTITY_PLACEMENT,
): Vec3[][][] {
  if (!node || depth > 14) return out
  if (Array.isArray(node)) {
    node.forEach(item => collectBsplineFaces(item, resolve, out, depth + 1, transform))
    return out
  }
  if (typeof node !== 'object') return out
  let rec = node as Record<string, unknown>
  if (typeof rec.value === 'number' && (rec.type === 5 || Object.keys(rec).length <= 2)) {
    const line = resolve(rec)
    if (!line || typeof line !== 'object') return out
    rec = line as Record<string, unknown>
  }
  if (Array.isArray(rec.ControlPointsList)) {
    const rows: Vec3[][] = []
    for (const row of rec.ControlPointsList as unknown[]) {
      if (!Array.isArray(row)) continue
      const pts: Vec3[] = []
      for (const raw of row) {
        const pt = raw && typeof raw === 'object' && (raw as { Coordinates?: unknown }).Coordinates ? raw : resolve(raw)
        const c = cartesian(pt)
        if (c) pts.push(applyPlacement(transform, c))
      }
      if (pts.length >= 2) rows.push(pts)
    }
    if (rows.length >= 2) out.push(rows)
    return out
  }
  if (asType(rec) === IFC_TYPE.MAPPED_ITEM) {
    const next = composePlacement(transform, mappingPlacement(rec))
    collectBsplineFaces((rec.MappingSource as { MappedRepresentation?: unknown } | undefined)?.MappedRepresentation, resolve, out, depth + 1, next)
    return out
  }
  const own = depth === 0 && rec.ObjectPlacement ? localPlacement(rec.ObjectPlacement) : transform
  for (const key of ['Representation', 'Representations', 'Items', 'Outer', 'CfsFaces', 'FaceSurface']) {
    if (rec[key]) collectBsplineFaces(rec[key], resolve, out, depth + 1, own)
  }
  return out
}

/** IFC world mm (Z-up) → viewer m (Y-up), relative to the site origin. */
export function ifcPointToViewer(p: Vec3, site: Vec3): Vec3 {
  return [
    (p[0] - site[0]) * IFC_TO_METERS,
    (p[2] - site[2]) * IFC_TO_METERS,
    -(p[1] - site[1]) * IFC_TO_METERS,
  ]
}

export function buildTubeMesh(pathPts: Vec3[], radius: number, radial = 5): { positions: Float32Array; indices: Uint32Array } | null {
  if (pathPts.length < 2 || radius <= 0) return null
  const rings = pathPts.length
  const positions = new Float32Array(rings * radial * 3)
  const indices: number[] = []
  for (let i = 0; i < rings; i++) {
    const p = pathPts[i]
    const next = pathPts[Math.min(i + 1, rings - 1)]
    const prev = pathPts[Math.max(i - 1, 0)]
    let tx = next[0] - prev[0]
    let ty = next[1] - prev[1]
    let tz = next[2] - prev[2]
    const tl = Math.hypot(tx, ty, tz) || 1
    tx /= tl
    ty /= tl
    tz /= tl
    let nx = 0
    let ny = 1
    let nz = 0
    if (Math.abs(ty) > 0.92) {
      nx = 1
      ny = 0
    }
    let bx = ty * nz - tz * ny
    let by = tz * nx - tx * nz
    let bz = tx * ny - ty * nx
    const bl = Math.hypot(bx, by, bz) || 1
    bx /= bl
    by /= bl
    bz /= bl
    nx = by * tz - bz * ty
    ny = bz * tx - bx * tz
    nz = bx * ty - by * tx
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2
      const c = Math.cos(a)
      const s = Math.sin(a)
      const o = (i * radial + k) * 3
      positions[o] = p[0] + radius * (nx * c + bx * s)
      positions[o + 1] = p[1] + radius * (ny * c + by * s)
      positions[o + 2] = p[2] + radius * (nz * c + bz * s)
    }
    if (i < rings - 1) {
      for (let k = 0; k < radial; k++) {
        const a = i * radial + k
        const b = i * radial + ((k + 1) % radial)
        const c = (i + 1) * radial + k
        const d = (i + 1) * radial + ((k + 1) % radial)
        indices.push(a, c, b, b, c, d)
      }
    }
  }
  return { positions, indices: new Uint32Array(indices) }
}

/** wasm NURBS/cylinders occasionally emit a handful of km-scale verts that explode the camera. */
export const MAX_VIEWER_RADIUS = 400

export function rejectFarVertices(
  positions: Float32Array,
  indices: Uint32Array,
  maxRadius = MAX_VIEWER_RADIUS,
): { positions: Float32Array; indices: Uint32Array } | null {
  const count = Math.floor(positions.length / 3)
  if (count < 3 || indices.length < 3) return null
  let far = 0
  for (let i = 0; i < count; i++) {
    if (Math.hypot(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]) > maxRadius) far += 1
  }
  if (far === 0) return { positions, indices }
  if (far >= count) return null
  const map = new Int32Array(count).fill(-1)
  const kept = new Float32Array((count - far) * 3)
  let w = 0
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3]
    const y = positions[i * 3 + 1]
    const z = positions[i * 3 + 2]
    if (Math.hypot(x, y, z) > maxRadius) continue
    map[i] = w
    kept[w * 3] = x
    kept[w * 3 + 1] = y
    kept[w * 3 + 2] = z
    w += 1
  }
  const next: number[] = []
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = map[indices[i]]
    const b = map[indices[i + 1]]
    const c = map[indices[i + 2]]
    if (a < 0 || b < 0 || c < 0) continue
    next.push(a, b, c)
  }
  if (next.length < 3 || w < 3) return null
  return { positions: kept.subarray(0, w * 3), indices: new Uint32Array(next) }
}

export function bboxCenter(positions: Float32Array): Vec3 | null {
  if (positions.length < 3) return null
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]
    const y = positions[i + 1]
    const z = positions[i + 2]
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (z < minZ) minZ = z
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
    if (z > maxZ) maxZ = z
  }
  if (!Number.isFinite(minX)) return null
  return [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2]
}

export function mergeTubeMeshes(
  parts: { positions: Float32Array; indices: Uint32Array }[],
): { positions: Float32Array; indices: Uint32Array } | null {
  if (!parts.length) return null
  if (parts.length === 1) return parts[0]
  let pc = 0
  let ic = 0
  for (const part of parts) {
    pc += part.positions.length
    ic += part.indices.length
  }
  const positions = new Float32Array(pc)
  const indices = new Uint32Array(ic)
  let po = 0
  let io = 0
  let base = 0
  for (const part of parts) {
    positions.set(part.positions, po)
    for (let i = 0; i < part.indices.length; i++) indices[io + i] = part.indices[i] + base
    po += part.positions.length
    io += part.indices.length
    base += part.positions.length / 3
  }
  return { positions, indices }
}
