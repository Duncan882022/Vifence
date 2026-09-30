export type PlanStatus = 'DRAFT' | 'REVIEW' | 'APPROVED' | 'PUBLISHED'
export type InspectionStageId = 'gd1' | 'gd2' | 'gd3'
export type ObjectKind = 'concrete' | 'rebar' | 'dul' | 'anchor' | 'embed'
export type IfcSourceId = 'dul' | 'suon'
export type Provenance = 'extracted' | 'inferred' | 'required'
/** IFC = đọc từ file · Đề xuất = cấu kiện nội suy. */
export type ObjectOrigin = 'extracted' | 'inferred'
export type StageStatus = 'confirmed' | 'review' | 'waiting' | 'draft' | 'fail'
export type ChecklistStatus = 'pass' | 'fail' | 'pending' | 'missing'
/** KT kiểm tra kỹ thuật · HP hold point (dừng chờ TVGS ký) · QA hồ sơ / thí nghiệm. */
export type ChecklistType = 'KT' | 'HP' | 'QA'
export type GirderZone = 'bottom' | 'web-left' | 'web-right' | 'deck'

export interface InspectionProject {
  id: string
  name: string
  code: string
  bimModel: string
  ifcVersion: string
  afcRevision: string | null
  planVersion: string
  planStatus: PlanStatus
}

export interface InspectionAsset {
  id: string
  code: string
  name: string
  type: string
  location: string
  ifcFile: string
  completenessPct: number
  stages: Record<InspectionStageId, StageStatus>
}

export interface BimObject {
  id: string
  ifcGuid: string
  ifcClass: string
  name: string
  kind: ObjectKind
  stage: InspectionStageId
  assetId: string
  parentId: string | null
  provenance: Provenance
  source: IfcSourceId | 'mock' | 'inferred'
  tags?: string[]
  properties: BimProperty[]
}

export interface BimProperty {
  key: string
  label: string
  value: string | null
  unit?: string
  provenance: Provenance
}

export interface InspectionChecklistItem {
  id: string
  assetId: string
  stage: InspectionStageId
  code?: string
  checkType?: ChecklistType
  title: string
  objectIds: string[]
  matchKinds?: ObjectKind[]
  /** Bind to BIM objects carrying any of these tags (wins over matchKinds). */
  matchTags?: string[]
  method?: string
  reference?: string
  designValue: string | null
  designProvenance: Provenance
  tolerance: string | null
  toleranceProvenance: Provenance
  sourceProvenance: Provenance
  status: ChecklistStatus
}

export interface CompletenessItem {
  id: string
  label: string
  ok: boolean
  detail?: string
}

export const STAGE_META: Record<InspectionStageId, { name: string; short: string; hint: string }> = {
  gd1: { name: 'GĐ1 · Bản đáy', short: 'GĐ1 · Bản đáy', hint: 'Ván khuôn đáy, thép + cáp bản đáy, gối' },
  gd2: { name: 'GĐ2 · 2 sườn', short: 'GĐ2 · 2 sườn', hint: 'Thép sườn, ống gen + cáp sườn, neo' },
  gd3: { name: 'GĐ3 · Bản mặt', short: 'GĐ3 · Bản mặt', hint: 'Bản mặt + cánh hẫng, căng kéo, bơm vữa' },
}

export const ZONE_META: Record<GirderZone, { label: string; stage: InspectionStageId }> = {
  bottom: { label: 'Bản đáy', stage: 'gd1' },
  'web-left': { label: 'Sườn trái', stage: 'gd2' },
  'web-right': { label: 'Sườn phải', stage: 'gd2' },
  deck: { label: 'Bản mặt + cánh hẫng', stage: 'gd3' },
}

export const CHECK_TYPE_META: Record<ChecklistType, { label: string; tip: string; className: string }> = {
  KT: { label: 'KT', tip: 'Kiểm tra kỹ thuật tại hiện trường', className: 'bg-sky-500/10 text-sky-400 border-sky-500/25' },
  HP: { label: 'HP', tip: 'Hold point – dừng thi công chờ TVGS ký', className: 'bg-red-500/10 text-red-400 border-red-500/25' },
  QA: { label: 'QA', tip: 'Hồ sơ chất lượng / thí nghiệm', className: 'bg-purple-500/10 text-purple-400 border-purple-500/25' },
}

export const KIND_META: Record<ObjectKind, { label: string; color: string }> = {
  concrete: { label: 'Concrete', color: '#94a3b8' },
  rebar: { label: 'Rebar', color: '#fb923c' },
  dul: { label: 'DƯL', color: '#38bdf8' },
  anchor: { label: 'Anchor', color: '#c4b5fd' },
  embed: { label: 'Embed', color: '#34d399' },
}

export const IFC_SOURCE_META: Record<IfcSourceId, { label: string; file: string; url: string }> = {
  dul: { label: 'DUL', file: 'DUL.ifc', url: `${import.meta.env.BASE_URL}inspection/models/DUL.ifc` },
  suon: { label: 'SUON', file: 'SUON.ifc', url: `${import.meta.env.BASE_URL}inspection/models/SUON.ifc` },
}

/** SUON first: its DamHop is the clean copy; DUL's shared-GUID DamHop is skipped. */
export const MERGED_IFC_SOURCES: IfcSourceId[] = ['suon', 'dul']

export const PROVENANCE_META: Record<Provenance, { label: string; tip: string; className: string }> = {
  extracted: {
    label: 'IFC',
    tip: 'Dữ liệu đọc trực tiếp từ BIM',
    className: 'bg-green-500/10 text-green-400 border-green-500/25',
  },
  inferred: {
    label: 'Đề xuất',
    tip: 'Hệ thống suy luận – cần xác nhận',
    className: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
  },
  required: {
    label: 'Cần bổ sung',
    tip: 'Chưa có dữ liệu nguồn',
    className: 'bg-red-500/10 text-red-400 border-red-500/25',
  },
}

export const PLAN_STATUS_META: Record<PlanStatus, { label: string; className: string }> = {
  DRAFT: { label: 'DRAFT', className: 'bg-gray-500/15 text-gray-400 border-gray-500/25' },
  REVIEW: { label: 'REVIEW', className: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
  APPROVED: { label: 'APPROVED', className: 'bg-green-500/15 text-green-400 border-green-500/25' },
  PUBLISHED: { label: 'PUBLISHED', className: 'bg-sky-500/15 text-sky-400 border-sky-500/25' },
}

export const STAGE_STATUS_META: Record<StageStatus, { label: string; className: string }> = {
  confirmed: { label: '✓ Confirmed', className: 'text-green-400' },
  review: { label: 'REVIEW', className: 'text-amber-400' },
  waiting: { label: 'WAITING', className: 'text-muted-foreground' },
  draft: { label: 'Draft', className: 'text-sky-400' },
  fail: { label: 'Không đạt', className: 'text-red-400' },
}
