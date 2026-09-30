import type { InspectionStageId, ObjectKind } from '../types'

/** Kind from IFC class/name; stage is only a fallback — the worker re-stages by position in the box. */
export function classifyIfc(ifcClass: string, name: string): { kind: ObjectKind; stage: InspectionStageId } {
  const typeName = ifcClass.toUpperCase()
  const compact = name.toLowerCase().replace(/[\s_\-]/g, '')

  if (typeName.includes('TENDONANCHOR') || /dauneo|anchor|neo(chu|bi)?dong/.test(compact)) {
    return { kind: 'anchor', stage: 'gd2' }
  }
  if (
    typeName.includes('TENDON')
    || /dulcable|sgcdulcable|sgcdul[^a-z]|strand/.test(compact)
  ) {
    return { kind: 'dul', stage: 'gd2' }
  }
  if (typeName.includes('REINFORCING') || compact.startsWith('rebarbar') || compact.startsWith('rebar')) {
    return { kind: 'rebar', stage: 'gd2' }
  }
  if (typeName.includes('PLATE') || typeName.includes('DISCRETEACCESSORY') || /embed|insert|bearing|thepcho/.test(compact)) {
    return { kind: 'embed', stage: 'gd3' }
  }
  return { kind: 'concrete', stage: 'gd1' }
}

export function parseRebarDia(name: string): string | null {
  const match = name.match(/:D(\d+)/i) ?? name.match(/\bD(\d+)\b/)
  return match ? `D${match[1]}` : null
}

export function parseCableProfile(name: string): string | null {
  const match = name.match(/(\d+T15(?:\.2)?)/i)
  return match ? match[1].toUpperCase() : null
}

export function shortIfcName(name: string): string {
  const parts = name.split(':').map(part => part.trim()).filter(Boolean)
  if (parts.length >= 3) return `${parts[0]} · ${parts[1]}`
  return name
}
