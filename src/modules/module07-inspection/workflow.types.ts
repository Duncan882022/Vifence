import type { GirderZone, ObjectKind } from './types'

/** Nguồn gốc dữ liệu — §31. `MOCK` không bao giờ được coi là `IFC`. */
export type SourceKind = 'IFC' | 'AFC' | 'BPTC' | 'ITP' | 'MOCK' | 'MANUAL'

export interface SourceRef {
  kind: SourceKind
  ref: string
}

export type StageCode = 'GD01' | 'GD02' | 'GD03' | 'GD04'

export type ComponentId =
  | 'bottom'
  | 'web-left'
  | 'web-right'
  | 'deck'
  | 'diaphragm'
  | 'cable-bottom'
  | 'cable-web'
  | 'anchors'

export interface ComponentBimLink {
  zones: GirderZone[]
  /** Chỉ lấy object có ít nhất 1 tag này (bỏ trống = mọi object của zone+kind). */
  anyTags?: string[]
  /** Loại trừ object có tag này. */
  noneTags?: string[]
}

export interface InspectionComponent {
  id: ComponentId
  label: string
  labelEn: string
  bim: ComponentBimLink
}

export type CriterionGroup = 'quantity' | 'quality'
export type CriterionMethod = 'camera' | 'measurement' | 'test' | 'document'

export interface CriterionDef {
  id: string
  stage: StageCode
  component: ComponentId
  group: CriterionGroup
  code: string
  title: string
  design: string
  designValue?: number
  unit?: string
  tolerance: string
  source: SourceRef
  mandatory: boolean
  evidenceRequired: boolean
  method: CriterionMethod
  /** AI phân tích được từ video H1. */
  aiCapable: boolean
}

export type DocumentKind = 'AFC' | 'BBS' | 'BIM' | 'BPTC' | 'ITP' | 'TEMPLATE' | 'TEST' | 'MATERIAL' | 'MEASUREMENT'
export type DocumentStatus = 'approved' | 'pending' | 'missing'

export interface InspectionDocument {
  id: string
  kind: DocumentKind
  code: string
  title: string
  revision: string
  status: DocumentStatus
  source: SourceKind
  stage?: StageCode
  date: string
}

/** Phương pháp xác minh yêu cầu — Brief §6. */
export type VerificationMethod =
  | 'VIDEO_AI'
  | 'VISUAL_MANUAL'
  | 'MEASUREMENT'
  | 'BIM_COMPARE'
  | 'SURVEY'
  | 'LAB_TEST'
  | 'DOCUMENT_CHECK'
  | 'COMBINATION'

/** Ngữ cảnh hình ảnh AI dùng để chọn bộ cảnh báo. */
export type VisualContext =
  | 'REBAR'
  | 'CONCRETE'
  | 'FORMWORK'
  | 'PT_DUCT'
  | 'ANCHOR'
  | 'EMBEDDED_ITEM'
  | 'STRUCTURAL_STEEL'
  | 'SURFACE'
  | 'UNKNOWN'

/** Bộ từ vựng cảnh báo cố định — AI không được tạo loại mới. */
export type AiWarningType =
  | 'SURFACE_ANOMALY'
  | 'POSSIBLE_HONEYCOMB'
  | 'VISIBLE_CRACK'
  | 'POSSIBLE_VOID'
  | 'POSSIBLE_EXPOSED_REBAR'
  | 'EDGE_DAMAGE'
  | 'POSSIBLE_MISSING_ITEM'
  | 'LOW_DENSITY_PATTERN'
  | 'UNEVEN_SPACING'
  | 'SIZE_INCONSISTENCY'
  | 'POSITION_ANOMALY'
  | 'ALIGNMENT_ANOMALY'
  | 'DEFORMATION'
  | 'CONTAMINATION'
  | 'FOREIGN_OBJECT'
  | 'INCOMPLETE_VISUAL_EVIDENCE'
  | 'UNCLEAR_VIEW'
  | 'UNCLASSIFIED_ANOMALY'

export type RequirementGroup = 'material' | 'quantity' | 'geometry' | 'detailing' | 'quality' | 'embedded'
export type RequirementSourceType = 'AFC' | 'BIM' | 'BBS' | 'ITP' | 'BPTC' | 'SPEC' | 'STANDARD' | 'MATERIAL' | 'CONFIG'
export type AiSupportLevel = 'WARNING_ONLY' | 'NONE'

/**
 * Yêu cầu nghiệm thu lấy từ hồ sơ được duyệt. `value` chỉ có khi nguồn thật (IFC);
 * nguồn MOCK / chưa cấu hình → UI hiển thị `genericText`, không tự đặt con số.
 */
export interface InspectionRequirement {
  id: string
  assetType: string
  stage: StageCode
  component: ComponentId
  group: RequirementGroup
  title: string
  value?: string
  unit?: string
  tolerance?: string
  genericText: string
  method: VerificationMethod
  attentionNote?: string
  sourceType: RequirementSourceType
  sourceKind: SourceKind
  sourceDocument: string
  sourceRevision: string
  sourceReference: string
  aiSupport: AiSupportLevel
  priority: 'high' | 'normal'
}

export interface BriefOutsideCheck {
  item: string
  method: VerificationMethod
  detail: string
}

export interface BriefReference {
  type: RequirementSourceType
  code: string
  revision: string
  note: string
  sourceKind: SourceKind
  configured: boolean
}

export interface InspectionBrief {
  id: string
  version: string
  assetId: string
  stage: StageCode
  component: ComponentId
  visualContext: VisualContext
  drawing: string
  requirements: InspectionRequirement[]
  attention: string[]
  outsideVideo: BriefOutsideCheck[]
  references: BriefReference[]
  aiSupport: string[]
  aiLimits: string
  /** Brief → AI Attention Context: loại cảnh báo AI ưu tiên theo dõi. */
  aiFocus: AiWarningType[]
}

/** Dấu vết Inspector đã xem Brief trước khi nghiệm thu component. */
export interface BriefAck {
  briefId: string
  version: string
  component: ComponentId
  requirementIds: string[]
  viewedAt: string
  by: string
}

export type ReadinessMode = 'block' | 'warn'

export interface ReadinessRule {
  id: string
  label: string
  mode: ReadinessMode
  /** Chứng từ bắt buộc (id trong `InspectionDocument`). */
  documentId?: string
}

export interface StageDef {
  id: StageCode
  code: string
  label: string
  labelEn: string
  order: number
  dependsOn: StageCode | null
  components: ComponentId[]
  holdPoints: ReadinessRule[]
  requiredDocs: ReadinessRule[]
  checklistRevision: string
  /** Loại cấu kiện BIM cô lập khi VIEW BIM ở giai đoạn này. */
  bimKinds: ObjectKind[]
}

export interface ProjectRecord {
  id: string
  code: string
  name: string
  owner: string
}

export interface StructureRecord {
  id: string
  projectId: string
  code: string
  name: string
  kind: string
}

export interface AssetRecord {
  id: string
  structureId: string
  code: string
  name: string
  type: string
  qrId: string
  location: string
  stages: StageCode[]
  bim: { label: string; revision: string; files: string[] }
  afc: { code: string; revision: string }
  bbs: { code: string; revision: string }
  bptc: { code: string; revision: string }
  itp: { code: string; revision: string }
}

export type ReadinessState = 'ok' | 'warn' | 'block'

export interface ReadinessCheck {
  id: string
  label: string
  state: ReadinessState
  detail: string
}

export type CriterionStatus = 'not_checked' | 'pass' | 'fail' | 'review' | 'na'

export interface CriterionResult {
  status: CriterionStatus
  observed?: string
  comment?: string
  updatedAt: string
  videoTs?: number
}

export type LiveAxis = 'connecting' | 'live' | 'lost' | 'off'
export type RecordAxis = 'off' | 'recording' | 'local'
export type CameraDisplayState =
  | 'CONNECTING'
  | 'LIVE'
  | 'RECORDING'
  | 'LIVE + RECORDING'
  | 'LIVE LOST / RECORDING LOCAL'
  | 'DISCONNECTED'

export type SyncState = 'pending' | 'syncing' | 'synced' | 'failed'

export type SessionStatus = 'in_progress' | 'paused' | 'closed' | 'in_review' | 'signed'

export interface RevisionSnapshot {
  afc: string
  bim: string
  checklist: string
  itp: string
  bptc: string
  lockedAt: string
}

export interface Inspector {
  id: string
  name: string
  role: 'inspector' | 'senior_inspector'
}

export interface PauseSpan {
  from: string
  to?: string
}

export type VideoSource = 'cms-capture' | 'mediamtx' | 'none'

export interface SessionVideo {
  source: VideoSource
  blobKey?: string
  mime?: string
  url?: string
  durationSec: number
  sizeBytes?: number
}

export type AiVerdict = 'pass_candidate' | 'review' | 'not_confirmed' | 'possible_deviation'

export interface AiFinding {
  id: string
  criterionId: string
  component: ComponentId
  group: CriterionGroup
  verdict: AiVerdict
  design: string
  observed: string
  summary: string
  confidence: number
  videoFrom: number
  videoTo: number
  /** Số lượng chưa xác nhận / vùng cần review. */
  count?: number
}

export type ReviewAction = 'accept' | 'reject' | 'override'

export interface ReviewDecision {
  findingId: string
  action: ReviewAction
  finalStatus: CriterionStatus
  comment: string
  by: string
  at: string
}

export type SignOffResult = 'pass' | 'require_rectification' | 'reinspection'

export interface SignOff {
  result: SignOffResult
  inspector: Inspector
  at: string
  signatureDataUrl: string
  revision: string
  note: string
  sessionId: string
}

export interface FinishOverride {
  reason: string
  by: string
  at: string
  openItems: number
}

export interface InspectionSession {
  id: string
  assetId: string
  stage: StageCode
  attempt: number
  inspector: Inspector
  helmetId: string
  simulatedH1: boolean
  status: SessionStatus
  qr: { value: string; method: 'camera' | 'manual'; verifiedAt: string }
  revisions: RevisionSnapshot
  startedAt: string
  finishedAt?: string
  pauses: PauseSpan[]
  results: Record<string, CriterionResult>
  sync: SyncState
  syncProgress: number
  video?: SessionVideo
  finishOverride?: FinishOverride
  ai?: { status: 'running' | 'done'; findings: AiFinding[]; finishedAt?: string }
  reviews: Record<string, ReviewDecision>
  signOff?: SignOff
  previousSessionId?: string
  /** Component Inspector chọn khi đọc Brief — tab mở đầu tiên khi live. */
  focusComponent?: ComponentId
  briefs?: BriefAck[]
  /** Bản ghi seed để dựng lịch sử — không có video/evidence thật. */
  seeded?: boolean
}

export type EvidenceType = 'video' | 'snapshot' | 'voice' | 'measurement' | 'test' | 'ai' | 'document'

export interface EvidenceContext {
  projectId: string
  structureId: string
  assetId: string
  stage: StageCode
  component?: ComponentId
  criterionId?: string
  sessionId: string
  helmetId: string
  timestamp: string
  videoTs: number
}

export interface Evidence {
  id: string
  type: EvidenceType
  label: string
  ctx: EvidenceContext
  blobKey?: string
  mime?: string
  durationSec?: number
  value?: string
  unit?: string
  note?: string
  transcript?: string
  /** Khoảng video liên quan (giây, tính từ đầu phiên). */
  videoTo?: number
}

export type IssueStatus = 'open' | 'rectified' | 'waiting_reinspection' | 'closed'

export interface IssueHistoryEntry {
  status: IssueStatus
  at: string
  by: string
  note: string
}

export interface Issue {
  id: string
  assetId: string
  stage: StageCode
  component: ComponentId
  criterionId: string
  sessionId: string
  design: string
  observed: string
  snapshotId?: string
  videoTs: number
  comment: string
  responsible: string
  status: IssueStatus
  history: IssueHistoryEntry[]
  closedBySessionId?: string
}

export type AuditAction =
  | 'session.start'
  | 'session.pause'
  | 'session.resume'
  | 'session.finish'
  | 'session.finish_override'
  | 'brief.view'
  | 'qr.verify'
  | 'qr.mismatch'
  | 'h1.simulated'
  | 'criterion.set'
  | 'evidence.add'
  | 'sync.done'
  | 'sync.failed'
  | 'ai.done'
  | 'review.decision'
  | 'review.comment'
  | 'issue.create'
  | 'issue.status'
  | 'signoff'

export interface AuditEvent {
  id: string
  at: string
  by: string
  assetId: string
  sessionId?: string
  action: AuditAction
  detail: string
}

export type StageProgress = 'pending' | 'ready' | 'in_progress' | 'in_review' | 'pass' | 'require_rectification' | 'reinspection'
