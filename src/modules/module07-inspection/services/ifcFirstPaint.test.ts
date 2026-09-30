import { describe, expect, it } from 'vitest'
import {
  FIRST_PAINT,
  IFC_TO_METERS,
  patchIfc2x2Schema,
  shouldReadRebarLine,
  uniqueExpressIds,
  workspaceIsLoading,
} from './ifcFirstPaint'

describe('workspaceIsLoading', () => {
  it('idle/ready/error are not a blocking overlay', () => {
    expect(workspaceIsLoading('idle')).toBe(false)
    expect(workspaceIsLoading('ready')).toBe(false)
    expect(workspaceIsLoading('error')).toBe(false)
  })

  it('ifc/parse/stage keep the overlay', () => {
    expect(workspaceIsLoading('ifc')).toBe(true)
    expect(workspaceIsLoading('parse')).toBe(true)
    expect(workspaceIsLoading('stage')).toBe(true)
  })
})

describe('first-paint budget', () => {
  it('names the full SUON cage, not just the first 64 bars', () => {
    expect(FIRST_PAINT.maxNamedRebar).toBeGreaterThanOrEqual(370)
    expect(shouldReadRebarLine(0)).toBe(true)
    expect(shouldReadRebarLine(1999)).toBe(true)
    expect(shouldReadRebarLine(2000)).toBe(false)
  })

  it('draws every bar of a SUON rebar set (up to 283 per product)', () => {
    expect(FIRST_PAINT.maxDisksPerProduct).toBeGreaterThanOrEqual(283)
  })

  it('IFC lengths are millimetres', () => {
    expect(IFC_TO_METERS).toBe(0.001)
  })
})

describe('IFC helpers', () => {
  it('dedupes express IDs across type queries', () => {
    expect(uniqueExpressIds([[1, 2, 2], [2, 3]])).toEqual([1, 2, 3])
  })

  it('patches IFC2X2_FINAL header to IFC2X3', () => {
    const raw = new TextEncoder().encode("ISO-10303-21;HEADER;FILE_SCHEMA(('IFC2X2_FINAL'));ENDSEC;")
    const patched = new TextDecoder().decode(patchIfc2x2Schema(raw))
    expect(patched).toContain("FILE_SCHEMA(('IFC2X3'))")
    expect(patched).not.toContain('IFC2X2_FINAL')
  })

  it('patches CRLF Revit headers before web-ifc OpenModel', () => {
    const raw = new TextEncoder().encode("FILE_SCHEMA(('IFC2X2_FINAL'));\r\nENDSEC;\r\nDATA;")
    const patched = new TextDecoder('latin1').decode(patchIfc2x2Schema(raw))
    expect(patched).toContain("FILE_SCHEMA(('IFC2X3'))")
    expect(patched).not.toMatch(/IFC2X2_FINAL/i)
    expect(patched).toContain('\r\nENDSEC;')
  })

  it('leaves IFC4 header unchanged', () => {
    const raw = new TextEncoder().encode("FILE_SCHEMA(('IFC4'))")
    expect(patchIfc2x2Schema(raw)).toBe(raw)
  })
})
