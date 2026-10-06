import type { BimObject, ObjectKind } from '../../types'
import type { InspectionComponent } from '../../workflow.types'

export interface ComponentBimSets {
  focusIds: string[]
  contextIds: string[]
  /** Tổng số thanh (thuộc tính `bars`) của cấu kiện focus — đối chiếu khối lượng IFC. */
  barCount: number
}

function inZones(o: BimObject, zones: readonly string[]): boolean {
  return Boolean(o.tags?.some(t => t.startsWith('zone-') && zones.includes(t.slice(5))))
}

/** §16 VIEW BIM: cô lập component của giai đoạn + bê tông cùng vùng làm nền. */
export function componentObjectSets(
  objects: BimObject[],
  component: InspectionComponent,
  stageKinds: readonly ObjectKind[],
): ComponentBimSets {
  const { zones, anyTags, noneTags } = component.bim
  const focusIds: string[] = []
  const contextIds: string[] = []
  let barCount = 0
  for (const o of objects) {
    if (!inZones(o, zones)) continue
    const tags = o.tags ?? []
    const tagOk = (!anyTags || anyTags.some(t => tags.includes(t))) && !(noneTags ?? []).some(t => tags.includes(t))
    if (stageKinds.includes(o.kind) && tagOk) {
      focusIds.push(o.id)
      barCount += Number(o.properties.find(p => p.key === 'bars')?.value ?? 0)
    } else if (o.kind === 'concrete') {
      contextIds.push(o.id)
    }
  }
  return { focusIds, contextIds, barCount }
}

export function mergeComponentSets(parts: ComponentBimSets[]): ComponentBimSets {
  const focus = new Set<string>()
  const context = new Set<string>()
  let barCount = 0
  for (const part of parts) {
    part.focusIds.forEach(id => focus.add(id))
    part.contextIds.forEach(id => context.add(id))
    barCount += part.barCount
  }
  for (const id of focus) context.delete(id)
  return { focusIds: [...focus], contextIds: [...context], barCount }
}
