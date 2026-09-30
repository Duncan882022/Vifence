import { describe, expect, it } from 'vitest'
import { BOX_SECTION } from '../data/boxGirderSection'
import {
  anchorZone,
  boundsOf,
  buildInferredParts,
  cableCenterline,
  cableZone,
  girderOriginFromBounds,
  isBoxHoop,
  splitConcreteByZone,
  zoneOfBounds,
  zoneOfPoint,
  type CableAxis,
  type MeshData,
} from './girderModel'
import type { Vec3 } from './ifcSweptTube'

function quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3): MeshData {
  return { positions: new Float32Array([...a, ...b, ...c, ...d]), indices: new Uint32Array([0, 1, 2, 0, 2, 3]) }
}

function area(mesh: MeshData | null): number {
  if (!mesh) return 0
  let sum = 0
  const P = mesh.positions
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [i, j, k] = [mesh.indices[t] * 3, mesh.indices[t + 1] * 3, mesh.indices[t + 2] * 3]
    const u = [P[j] - P[i], P[j + 1] - P[i + 1], P[j + 2] - P[i + 2]]
    const v = [P[k] - P[i], P[k + 1] - P[i + 1], P[k + 2] - P[i + 2]]
    sum += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2
  }
  return sum
}

describe('girder frame + zones', () => {
  it('origin is soffit centre', () => {
    expect(girderOriginFromBounds([-6.3, 10, -16.3], [6.3, 13.032, 16.3])).toEqual([0, 10, 0])
  })

  it('zones follow the construction joints', () => {
    expect(zoneOfPoint(0, 0.1)).toBe('bottom')
    expect(zoneOfPoint(-2.9, 1.5)).toBe('web-left')
    expect(zoneOfPoint(2.9, 1.5)).toBe('web-right')
    expect(zoneOfPoint(5, 2.8)).toBe('deck')
  })

  it('a full-height closed hoop belongs to the bottom-slab cage', () => {
    expect(isBoxHoop([-3.37, 0.05, -7.5], [3.37, 2.96, 7.5])).toBe(true)
    expect(isBoxHoop([2.7, 0.3, 1], [3.1, 2.9, 1.02])).toBe(false)
    expect(zoneOfBounds([-2.5, 0.05, 1], [2.5, 2.9, 1.02])).toBe('bottom')
    expect(zoneOfBounds([2.7, 0.3, 1], [3.1, 2.3, 1.02])).toBe('web-right')
  })

  it('splits concrete at y = 0.6 / 2.42 and x = 0 without losing area', () => {
    const face = quad([-3, 0, 0], [3, 0, 0], [3, 3, 0], [-3, 3, 0])
    const parts = splitConcreteByZone(face)
    const total = Object.values(parts).reduce((s, m) => s + area(m), 0)
    expect(total).toBeCloseTo(18, 4)
    expect(area(parts.bottom)).toBeCloseTo(6 * BOX_SECTION.joint1, 4)
    expect(area(parts.deck)).toBeCloseTo(6 * (3 - BOX_SECTION.joint2), 4)
    expect(area(parts['web-left'])).toBeCloseTo(area(parts['web-right']), 4)
  })
})

describe('cable centerline', () => {
  /** Two half-tube faces of radius r around a draped axis, like the DUL NURBS surfaces. */
  function syntheticCable(r: number, axis: (z: number) => [number, number]): Vec3[][][] {
    const zs = Array.from({ length: 12 }, (_, i) => -15 + (30 * i) / 11)
    const face = (a0: number) => [0, 1, 2, 3, 4].map(k => {
      const a = a0 + (Math.PI * k) / 4
      return zs.map(z => {
        const [x, y] = axis(z)
        return [x + r * Math.cos(a), y + r * Math.sin(a), z] as Vec3
      })
    })
    return [face(0), face(Math.PI)]
  }

  it('recovers axis and radius from NURBS control rows', () => {
    const drape = (z: number): [number, number] => [-2.9, 0.4 + 0.004 * z * z]
    const line = cableCenterline(syntheticCable(0.045, drape))!
    expect(line.radius).toBeCloseTo(0.045, 3)
    const mid = line.points[Math.floor(line.points.length / 2)]
    expect(mid[0]).toBeCloseTo(-2.9, 2)
    expect(Math.abs(mid[1] - drape(mid[2])[1])).toBeLessThan(0.01)
    expect(cableZone(line.points)).toBe('web-left')
  })

  it('flat cables are bottom-slab cables', () => {
    const line = cableCenterline(syntheticCable(0.04, () => [0.8, 0.15]))!
    expect(cableZone(line.points)).toBe('bottom')
  })

  it('anchors take the zone of the nearest cable end', () => {
    const cables: CableAxis[] = [
      { id: 'b', points: [[1, 0.15, -16], [1, 0.15, 16]], radius: 0.04, zone: 'bottom', profile: '9T15.2' },
      { id: 'w', points: [[-2.9, 1.8, -16], [-2.9, 0.4, 0], [-2.9, 1.8, 16]], radius: 0.05, zone: 'web-left', profile: '18T15.2' },
    ]
    expect(anchorZone([-2.9, 1.75, 16.2], cables)).toEqual({ zone: 'web-left', cableId: 'w' })
    expect(anchorZone([1, 0.2, -16.2], cables)).toEqual({ zone: 'bottom', cableId: 'b' })
  })
})

describe('inferred parts', () => {
  const cables: CableAxis[] = [
    { id: 'dul-1', points: [[0.5, 0.15, -16], [0.5, 0.15, 16]], radius: 0.04, zone: 'bottom', profile: '9T15.2' },
  ]
  const parts = buildInferredParts(cables)

  it('adds deck / cantilever / bottom rebar, embeds and one duct per cable', () => {
    const ids = parts.map(p => p.id)
    for (const id of ['inf-deck-long-top', 'inf-cant-top', 'inf-bottom-long-bot', 'inf-bearing', 'inf-lifting', 'inf-drain', 'inf-duct-dul-1']) {
      expect(ids).toContain(id)
    }
    expect(parts.find(p => p.id === 'inf-duct-dul-1')?.style).toBe('ghost')
  })

  it('stays inside the girder envelope (starter bars and lifting loops may stick out of the deck)', () => {
    const halfL = BOX_SECTION.length / 2
    for (const part of parts) {
      const b = boundsOf(part.mesh.positions)!
      expect(Number.isFinite(b.min[0]), part.id).toBe(true)
      expect(b.min[0], part.id).toBeGreaterThanOrEqual(-BOX_SECTION.deckWidth / 2 - 1e-3)
      expect(b.max[0], part.id).toBeLessThanOrEqual(BOX_SECTION.deckWidth / 2 + 1e-3)
      expect(b.min[1], part.id).toBeGreaterThanOrEqual(-0.03)
      expect(b.max[1], part.id).toBeLessThanOrEqual(BOX_SECTION.height + 0.4)
      expect(Math.max(-b.min[2], b.max[2]), part.id).toBeLessThanOrEqual(halfL + 1e-3)
    }
  })

  it('every inferred part asks for the source drawing', () => {
    for (const part of parts) {
      expect(part.properties.some(p => p.provenance === 'required'), part.id).toBe(true)
    }
  })

  it('deck rebar is staged with the deck, bottom rebar with the bottom slab', () => {
    expect(parts.find(p => p.id === 'inf-deck-long-top')?.zone).toBe('deck')
    expect(parts.find(p => p.id === 'inf-bottom-long-bot')?.zone).toBe('bottom')
  })
})
