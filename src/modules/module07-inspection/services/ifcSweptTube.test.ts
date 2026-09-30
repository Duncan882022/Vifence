import { describe, expect, it } from 'vitest'
import { IFC_TO_METERS } from './ifcFirstPaint'
import {
  IDENTITY_PLACEMENT,
  IFC_TYPE,
  applyPlacement,
  axis2Placement,
  bboxCenter,
  buildTubeMesh,
  collectSweptDisks,
  composePlacement,
  curvePoints,
  ifcNumeric,
  ifcPointToViewer,
  mergeTubeMeshes,
  rejectFarVertices,
} from './ifcSweptTube'

describe('ifcNumeric', () => {
  it('reads web-ifc measure wrappers', () => {
    expect(ifcNumeric(6)).toBe(6)
    expect(ifcNumeric({ value: 12 })).toBe(12)
    expect(ifcNumeric({ _representationValue: 36 })).toBe(36)
  })
})

describe('curvePoints', () => {
  it('walks a polyline', () => {
    const pts = curvePoints({
      type: IFC_TYPE.POLYLINE,
      Points: [
        { Coordinates: [{ _representationValue: 0 }, { _representationValue: 0 }, { _representationValue: 0 }] },
        { Coordinates: [{ _representationValue: 1000 }, { _representationValue: 0 }, { _representationValue: 0 }] },
      ],
    })
    expect(pts).toEqual([[0, 0, 0], [1000, 0, 0]])
  })

  it('samples a trimmed circle in degrees (the GetCurveWithParameters case)', () => {
    const pts = curvePoints({
      type: IFC_TYPE.TRIMMED_CURVE,
      BasisCurve: {
        type: IFC_TYPE.CIRCLE,
        Position: {
          Location: { Coordinates: [0, 0, 0] },
          Axis: { DirectionRatios: [0, 0, 1] },
          RefDirection: { DirectionRatios: [1, 0, 0] },
        },
        Radius: { _representationValue: 36 },
      },
      Trim1: [{ _representationValue: 270 }],
      Trim2: [{ _representationValue: 360 }],
      SenseAgreement: true,
    })
    expect(pts.length).toBeGreaterThan(4)
    expect(pts[0][0]).toBeCloseTo(0, 5)
    expect(pts[0][1]).toBeCloseTo(-36, 5)
    expect(pts[pts.length - 1][0]).toBeCloseTo(36, 5)
    expect(pts[pts.length - 1][1]).toBeCloseTo(0, 5)
  })

  it('joins composite curve segments', () => {
    const pts = curvePoints({
      type: IFC_TYPE.COMPOSITE_CURVE,
      Segments: [
        {
          SameSense: true,
          ParentCurve: {
            type: IFC_TYPE.POLYLINE,
            Points: [
              { Coordinates: [0, 0, 0] },
              { Coordinates: [10, 0, 0] },
            ],
          },
        },
        {
          SameSense: true,
          ParentCurve: {
            type: IFC_TYPE.POLYLINE,
            Points: [
              { Coordinates: [10, 0, 0] },
              { Coordinates: [10, 5, 0] },
            ],
          },
        },
      ],
    })
    expect(pts).toEqual([[0, 0, 0], [10, 0, 0], [10, 5, 0]])
  })
})

describe('collectSweptDisks + tubes', () => {
  it('finds SweptDiskSolid in a reinforcing bar representation', () => {
    const disks = collectSweptDisks({
      Representation: {
        Representations: [{
          Items: [{
            type: IFC_TYPE.SWEPT_DISK,
            Radius: { _representationValue: 6 },
            Directrix: {
              type: IFC_TYPE.POLYLINE,
              Points: [
                { Coordinates: [0, 0, 0] },
                { Coordinates: [100, 0, 0] },
              ],
            },
          }],
        }],
      },
    })
    expect(disks).toHaveLength(1)
    expect(disks[0].radius).toBe(6)
    const tube = buildTubeMesh(disks[0].points, disks[0].radius, 5)
    expect(tube).not.toBeNull()
    expect(tube!.indices.length).toBeGreaterThan(0)
  })

  it('merges several disks into one mesh', () => {
    const a = buildTubeMesh([[0, 0, 0], [10, 0, 0]], 2, 4)!
    const b = buildTubeMesh([[0, 5, 0], [10, 5, 0]], 2, 4)!
    const merged = mergeTubeMeshes([a, b])
    expect(merged!.positions.length).toBe(a.positions.length + b.positions.length)
  })
})

describe('placements', () => {
  const at = (x: number, y: number, z: number) => ({ Coordinates: [x, y, z] })

  it('applies ObjectPlacement chain to swept-disk points', () => {
    const disks = collectSweptDisks({
      ObjectPlacement: {
        PlacementRelTo: { RelativePlacement: { Location: at(1000, 0, 0) } },
        RelativePlacement: {
          Location: at(0, 500, 0),
          Axis: { DirectionRatios: [0, 0, 1] },
          RefDirection: { DirectionRatios: [0, 1, 0] },
        },
      },
      Representation: {
        Representations: [{
          Items: [{
            type: IFC_TYPE.SWEPT_DISK,
            Radius: 4,
            Directrix: { type: IFC_TYPE.POLYLINE, Points: [at(0, 0, 0), at(100, 0, 0)] },
          }],
        }],
      },
    })
    expect(disks).toHaveLength(1)
    expect(disks[0].points[0]).toEqual([1000, 500, 0])
    const end = disks[0].points[1]
    expect(end[0]).toBeCloseTo(1000)
    expect(end[1]).toBeCloseTo(600)
  })

  it('composes a then b with b applied first', () => {
    const shift = { ...IDENTITY_PLACEMENT, t: [10, 0, 0] as [number, number, number] }
    const rot = axis2Placement({ Location: at(0, 0, 0), RefDirection: { DirectionRatios: [0, 1, 0] } })
    const p = applyPlacement(composePlacement(shift, rot), [1, 0, 0])
    expect(p[0]).toBeCloseTo(10)
    expect(p[1]).toBeCloseTo(1)
  })

  it('maps site-relative IFC mm to Y-up viewer metres', () => {
    const site: [number, number, number] = [523057972, 2476126628, 585242]
    const v = ifcPointToViewer([site[0] + 2000, site[1] + 3000, site[2] + 1500], site)
    expect(v[0]).toBeCloseTo(2)
    expect(v[1]).toBeCloseTo(1.5)
    expect(v[2]).toBeCloseTo(-3)
    expect(IFC_TO_METERS).toBe(0.001)
  })

  it('bboxCenter is the midpoint of the AABB', () => {
    expect(bboxCenter(new Float32Array([0, 0, 0, 10, 4, 2]))).toEqual([5, 2, 1])
  })

  it('drops kilometre-scale NURBS outliers without shrinking the 32m girder', () => {
    const positions = new Float32Array([
      0, 0, 0,
      12, 0, 0,
      12, 32, 0,
      0, 32, 0,
      14000, -13000, -12000,
    ])
    const indices = new Uint32Array([0, 1, 2, 0, 2, 3, 0, 1, 4])
    const clean = rejectFarVertices(positions, indices, 200)
    expect(clean).not.toBeNull()
    expect(clean!.positions.length / 3).toBe(4)
    expect(clean!.indices.length).toBe(6)
    const center = bboxCenter(clean!.positions)!
    expect(center[0]).toBeCloseTo(6)
    expect(center[1]).toBeCloseTo(16)
  })
})
