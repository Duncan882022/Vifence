import type {
  BimObject,
  CompletenessItem,
  InspectionAsset,
  InspectionChecklistItem,
  InspectionStageId,
  ObjectKind,
  ObjectOrigin,
} from '../types'
import { DAM_HOP_CHECKLISTS } from '../data/inspectionChecklists'
import { INSPECTION_ASSETS } from '../data/inspectionProject'
import { INSPECTION_PACKAGES } from './inspectionNav'

/** Checklist → BIM binding cap; the girder has ~2k objects so this is effectively "all". */
const BIND_CAP = 2500

export function packageAssets(): InspectionAsset[] {
  return INSPECTION_ASSETS.filter(a => INSPECTION_PACKAGES.some(pkg => pkg.assetId === a.id))
}

export function checklistsForAsset(assetId: string): InspectionChecklistItem[] {
  return DAM_HOP_CHECKLISTS.filter(c => c.assetId === assetId)
}

export function objectOrigin(object: BimObject): ObjectOrigin {
  return object.source === 'inferred' || object.provenance === 'inferred' ? 'inferred' : 'extracted'
}

/** `pattern` "a+b" requires every tag; plain "a" requires one. */
export function tagMatches(tags: readonly string[] | undefined, pattern: string): boolean {
  if (!tags?.length) return false
  return pattern.split('+').every(t => tags.includes(t))
}

function matchesItem(item: InspectionChecklistItem, object: BimObject): boolean {
  if (item.matchTags?.some(p => tagMatches(object.tags, p))) return true
  return Boolean(item.matchKinds?.includes(object.kind) && object.stage === item.stage)
}

const KIND_PLAN: { kind: ObjectKind; stage: InspectionStageId; title: string }[] = [
  { kind: 'concrete', stage: 'gd1', title: 'Kiểm tra hình học bê tông' },
  { kind: 'rebar', stage: 'gd1', title: 'Kiểm tra cốt thép' },
  { kind: 'dul', stage: 'gd2', title: 'Kiểm tra bó DƯL' },
  { kind: 'anchor', stage: 'gd3', title: 'Hold point neo' },
  { kind: 'embed', stage: 'gd3', title: 'Kiểm tra chi tiết chôn sẵn' },
]

/** Fallback plan for assets without an authored ITP. */
export function generateChecklistsFromObjects(assetId: string, objects: BimObject[]): InspectionChecklistItem[] {
  return KIND_PLAN.flatMap(plan => {
    const group = objects.filter(o => o.kind === plan.kind)
    if (group.length === 0) return []
    const dias = [...new Set(group.map(o => o.properties.find(p => p.key === 'dia')?.value).filter((v): v is string => Boolean(v)))]
    const profiles = [...new Set(group.map(o => o.properties.find(p => p.key === 'profile')?.value).filter((v): v is string => Boolean(v)))]
    const title = plan.kind === 'rebar' && dias.length
      ? `Kiểm tra cốt thép ${dias.join(' / ')}`
      : plan.kind === 'dul' && profiles.length
        ? `Kiểm tra bó DƯL ${profiles.join(' / ')}`
        : plan.kind === 'concrete'
          ? `Kiểm tra hình học ${group[0].name}`
          : plan.title
    return [{
      id: `cl-ifc-${assetId}-${plan.kind}`,
      assetId,
      stage: plan.stage,
      title,
      objectIds: group.map(o => o.id).slice(0, BIND_CAP),
      matchKinds: [plan.kind],
      designValue: dias[0] ?? profiles[0] ?? group[0].name,
      designProvenance: 'extracted',
      tolerance: null,
      toleranceProvenance: 'required',
      sourceProvenance: 'extracted',
      status: 'pending',
    }]
  })
}

export function planChecklistsFor(assetId: string, objects: BimObject[]): InspectionChecklistItem[] {
  const authored = checklistsForAsset(assetId)
  if (authored.length > 0) return bindChecklistsToObjects(authored, objects)
  return generateChecklistsFromObjects(assetId, objects)
}

export function filterObjects(
  objects: BimObject[],
  stage: InspectionStageId | 'all',
  kinds: ObjectKind[],
  origins: ObjectOrigin[] = [],
): BimObject[] {
  return objects.filter(o =>
    (stage === 'all' || o.stage === stage)
    && (kinds.length === 0 || kinds.includes(o.kind))
    && (origins.length === 0 || origins.includes(objectOrigin(o))),
  )
}

export function checklistsForObjects(
  items: InspectionChecklistItem[],
  objectIds: string[],
  stage: InspectionStageId | 'all',
): InspectionChecklistItem[] {
  return items.filter(item => {
    if (stage !== 'all' && item.stage !== stage) return false
    if (objectIds.length === 0) return true
    return item.objectIds.some(id => objectIds.includes(id))
  })
}

export function relatedChecklists(
  items: InspectionChecklistItem[],
  objectId: string,
  object?: BimObject,
): InspectionChecklistItem[] {
  return items.filter(item => item.objectIds.includes(objectId) || (object ? matchesItem(item, object) : false))
}

export function bindChecklistsToObjects(
  items: InspectionChecklistItem[],
  objects: BimObject[],
): InspectionChecklistItem[] {
  return items.map(item => {
    if (!item.matchTags?.length && !item.matchKinds?.length) {
      const live = item.objectIds.filter(id => objects.some(o => o.id === id))
      return { ...item, objectIds: live }
    }
    const matched = objects.filter(o => matchesItem(item, o)).map(o => o.id)
    return { ...item, objectIds: matched.slice(0, BIND_CAP) }
  })
}

export function countByKind(objects: BimObject[]): Record<ObjectKind, number> {
  const counts: Record<ObjectKind, number> = { concrete: 0, rebar: 0, dul: 0, anchor: 0, embed: 0 }
  for (const o of objects) counts[o.kind] += 1
  return counts
}

export function countByOrigin(objects: BimObject[]): Record<ObjectOrigin, number> {
  const counts: Record<ObjectOrigin, number> = { extracted: 0, inferred: 0 }
  for (const o of objects) counts[objectOrigin(o)] += 1
  return counts
}

export function countByStage(objects: BimObject[], stage: InspectionStageId): number {
  return objects.filter(o => o.stage === stage).length
}

export function emptyKindHint(fileLabel: string, counts: Record<ObjectKind, number>, kinds: ObjectKind[]): string | null {
  if (kinds.length === 0) return null
  const missing = kinds.filter(kind => counts[kind] === 0)
  if (!missing.length) return null
  const labels = missing.map(kind => ({ concrete: 'Concrete', rebar: 'Rebar', dul: 'DƯL', anchor: 'Anchor', embed: 'Embed' }[kind]))
  return `${fileLabel} không chứa ${labels.join(', ')}.`
}

function checklistLabel(item: InspectionChecklistItem): string {
  return item.code ? `${item.code} ${item.title}` : item.title
}

/** Plan gaps: checklists thiếu thông số / dung sai + thuộc tính "Cần bổ sung" gộp theo loại. */
export function missingPlanGaps(objects: BimObject[], items: InspectionChecklistItem[]): { count: number; labels: string[] } {
  const fromCl = items
    .filter(c => c.status === 'missing' || c.designProvenance === 'required' || (c.toleranceProvenance === 'required' && !c.tolerance))
    .map(c => (c.designProvenance === 'required' && c.designValue
      ? `${c.designValue} — ${checklistLabel(c)}`
      : `Dung sai — ${checklistLabel(c)}`))
  const propCounts = new Map<string, number>()
  for (const o of objects) {
    for (const p of o.properties) {
      if (p.provenance === 'required' && (p.value == null || p.value === '')) {
        propCounts.set(p.label, (propCounts.get(p.label) ?? 0) + 1)
      }
    }
  }
  const fromProps = [...propCounts].map(([label, n]) => `${label} (${n} cấu kiện)`)
  const labels = [...new Set([...fromCl, ...fromProps])]
  return { count: labels.length, labels }
}

export function missingRequiredCount(objects: BimObject[], items: InspectionChecklistItem[]): number {
  return missingPlanGaps(objects, items).count
}

export function computeCompleteness(objects: BimObject[], items: InspectionChecklistItem[]): CompletenessItem[] {
  const codes = (list: InspectionChecklistItem[]) => list.map(c => c.code ?? c.title).join(', ')
  const designMissing = items.filter(c => c.designProvenance === 'required')
  const toleranceProposed = items.filter(c => c.toleranceProvenance === 'inferred')
  const toleranceMissing = items.filter(c => c.toleranceProvenance === 'required' && !c.tolerance)
  const holdOpen = items.filter(c => c.checkType === 'HP' && c.status !== 'pass')
  const inferred = objects.filter(o => objectOrigin(o) === 'inferred')
  const unbound = items.filter(c => (c.matchTags?.length || c.matchKinds?.length) && c.objectIds.length === 0)

  return [
    { id: 'geom', label: 'Hình học BIM (DUL + SUON gộp)', ok: objects.some(o => o.kind === 'concrete') },
    { id: 'stage', label: 'Gắn giai đoạn theo vị trí (đáy / sườn / mặt)', ok: objects.length > 0 && objects.every(o => Boolean(o.stage)) },
    {
      id: 'bind',
      label: unbound.length === 0 ? 'Checklist gắn cấu kiện BIM' : `${unbound.length} checklist chưa gắn cấu kiện`,
      ok: unbound.length === 0,
      detail: unbound.length ? codes(unbound) : undefined,
    },
    {
      id: 'inferred',
      label: inferred.length === 0 ? 'Không có cấu kiện nội suy' : `${inferred.length} cấu kiện Đề xuất cần xác nhận`,
      ok: inferred.length === 0,
      detail: inferred.length ? 'Thép bản mặt / cánh hẫng / bản đáy, chi tiết chôn sẵn, ống gen nội suy — đối chiếu bản vẽ AFC' : undefined,
    },
    {
      id: 'design',
      label: designMissing.length === 0 ? 'Thông số thiết kế' : `Thiếu thông số thiết kế · ${designMissing.length} checklist`,
      ok: designMissing.length === 0,
      detail: designMissing.length ? designMissing.map(c => `${c.code} ${c.designValue}`).join(' · ') : undefined,
    },
    {
      id: 'criteria',
      label: toleranceMissing.length
        ? `Thiếu dung sai · ${toleranceMissing.length} checklist`
        : `Dung sai Đề xuất chờ TVGS duyệt · ${toleranceProposed.length}`,
      ok: toleranceMissing.length === 0 && toleranceProposed.length === 0,
      detail: toleranceMissing.length ? codes(toleranceMissing) : toleranceProposed.length ? 'Theo TCVN 4453 / 22TCN 247 / AASHTO — cần chỉ dẫn kỹ thuật dự án' : undefined,
    },
    {
      id: 'hold',
      label: holdOpen.length === 0 ? 'Hold point đã ký' : `Hold point chưa ký · ${holdOpen.length}`,
      ok: holdOpen.length === 0,
      detail: holdOpen.length ? codes(holdOpen) : undefined,
    },
    { id: 'afc', label: 'Thiếu bản vẽ AFC', ok: false, detail: 'Chưa gắn bản vẽ AFC cho Inspection Plan' },
  ]
}

export function centerKpis(assets: InspectionAsset[] = INSPECTION_ASSETS) {
  const waiting = assets.filter(a => Object.values(a.stages).includes('waiting') || Object.values(a.stages).includes('draft')).length
  const inReview = assets.filter(a => Object.values(a.stages).includes('review')).length
  const done = assets.filter(a => Object.values(a.stages).every(s => s === 'confirmed')).length
  const fail = assets.filter(a => Object.values(a.stages).includes('fail')).length

  return {
    totalComponents: assets.length,
    waiting,
    inProgress: inReview,
    done,
    fail,
    assets,
  }
}

export function findAsset(id: string): InspectionAsset | undefined {
  return INSPECTION_ASSETS.find(a => a.id === id)
}
