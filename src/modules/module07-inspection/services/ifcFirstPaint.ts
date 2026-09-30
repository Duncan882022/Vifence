/** Both DUL.ifc and SUON.ifc are millimetre Revit exports. */
export const IFC_TO_METERS = 0.001

export const FIRST_PAINT = {
  maxNamedRebar: 2000,
  maxPlacedGeometries: 64,
  /** SUON rebar sets carry up to 283 bars in one IfcReinforcingBar. */
  maxDisksPerProduct: 400,
}

export type WorkspaceLoadPhase = 'idle' | 'ifc' | 'parse' | 'stage' | 'ready' | 'error'

export function workspaceIsLoading(phase: WorkspaceLoadPhase): boolean {
  return phase === 'ifc' || phase === 'parse' || phase === 'stage'
}

export function shouldReadRebarLine(index: number): boolean {
  return index < FIRST_PAINT.maxNamedRebar
}

export function uniqueExpressIds(groups: number[][]): number[] {
  const seen = new Set<number>()
  const out: number[] = []
  for (const group of groups) {
    for (const id of group) {
      if (seen.has(id)) continue
      seen.add(id)
      out.push(id)
    }
  }
  return out
}

export function patchIfc2x2Schema(buffer: Uint8Array): Uint8Array {
  const headLen = Math.min(buffer.length, 8192)
  const head = new TextDecoder('latin1').decode(buffer.subarray(0, headLen))
  if (!/IFC2X2_FINAL/i.test(head)) return buffer
  const patchedHead = head.replace(/IFC2X2_FINAL/gi, 'IFC2X3')
  const encoded = new Uint8Array(patchedHead.length)
  for (let i = 0; i < patchedHead.length; i++) encoded[i] = patchedHead.charCodeAt(i) & 0xff
  const out = new Uint8Array(encoded.length + buffer.length - headLen)
  out.set(encoded)
  out.set(buffer.subarray(headLen), encoded.length)
  return out
}
