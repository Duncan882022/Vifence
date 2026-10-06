import type {
  AiVerdict,
  CameraDisplayState,
  CriterionStatus,
  DocumentKind,
  DocumentStatus,
  EvidenceType,
  IssueStatus,
  ReadinessState,
  SignOffResult,
  SourceKind,
  StageProgress,
  SyncState,
  VerificationMethod,
  VisualContext,
} from '../../workflow.types'

interface Token {
  label: string
  className: string
}

export const CRITERION_STATUS_META: Record<CriterionStatus, Token> = {
  not_checked: { label: 'Chưa chấm', className: 'bg-gray-500/10 text-gray-400 border-gray-500/25' },
  pass: { label: 'Đạt', className: 'bg-green-500/10 text-green-400 border-green-500/30' },
  fail: { label: 'Không đạt', className: 'bg-red-500/10 text-red-400 border-red-500/30' },
  review: { label: 'Cần xem', className: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  na: { label: 'Không áp dụng', className: 'bg-slate-500/10 text-slate-400 border-slate-500/25' },
}

export const CRITERION_STATUS_ORDER: CriterionStatus[] = ['pass', 'fail', 'na']

export const AI_VERDICT_META: Record<AiVerdict, Token> = {
  pass_candidate: { label: 'Đạt (gợi ý)', className: 'bg-green-500/10 text-green-400 border-green-500/30' },
  review: { label: 'Cần xem', className: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  not_confirmed: { label: 'Chưa xác nhận', className: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  possible_deviation: { label: 'Có thể lệch', className: 'bg-red-500/10 text-red-400 border-red-500/30' },
}

export const SYNC_META: Record<SyncState, Token> = {
  pending: { label: 'PENDING UPLOAD', className: 'bg-gray-500/10 text-gray-400 border-gray-500/25' },
  syncing: { label: 'SYNCING', className: 'bg-sky-500/10 text-sky-400 border-sky-500/30' },
  synced: { label: 'SYNCED', className: 'bg-green-500/10 text-green-400 border-green-500/30' },
  failed: { label: 'UPLOAD FAILED', className: 'bg-red-500/10 text-red-400 border-red-500/30' },
}

export const CAMERA_STATE_META: Record<CameraDisplayState, Token & { pulse: boolean }> = {
  CONNECTING: { label: 'CONNECTING', className: 'bg-gray-500/20 text-gray-300 border-gray-500/30', pulse: true },
  LIVE: { label: '● LIVE', className: 'bg-sky-500/20 text-sky-300 border-sky-500/40', pulse: false },
  RECORDING: { label: 'REC', className: 'bg-red-500/20 text-red-300 border-red-500/40', pulse: true },
  'LIVE + RECORDING': { label: '● LIVE · REC', className: 'bg-red-500/20 text-red-300 border-red-500/40', pulse: true },
  'LIVE LOST / RECORDING LOCAL': { label: 'LIVE LOST · REC LOCAL', className: 'bg-amber-500/20 text-amber-300 border-amber-500/40', pulse: true },
  DISCONNECTED: { label: 'DISCONNECTED', className: 'bg-red-500/10 text-red-400 border-red-500/30', pulse: false },
}

export const ISSUE_STATUS_META: Record<IssueStatus, Token> = {
  open: { label: 'Mở', className: 'bg-red-500/10 text-red-400 border-red-500/30' },
  rectified: { label: 'Đã sửa', className: 'bg-sky-500/10 text-sky-400 border-sky-500/30' },
  waiting_reinspection: { label: 'Chờ nghiệm thu lại', className: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  closed: { label: 'Đóng', className: 'bg-green-500/10 text-green-400 border-green-500/30' },
}

export const ISSUE_FLOW: IssueStatus[] = ['open', 'rectified', 'waiting_reinspection', 'closed']

export const SIGNOFF_META: Record<SignOffResult, Token> = {
  pass: { label: 'Đạt', className: 'bg-green-500/10 text-green-400 border-green-500/30' },
  require_rectification: { label: 'Yêu cầu khắc phục', className: 'bg-red-500/10 text-red-400 border-red-500/30' },
  reinspection: { label: 'Nghiệm thu lại', className: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
}

export const STAGE_PROGRESS_META: Record<StageProgress, Token> = {
  pending: { label: 'Chưa tới', className: 'bg-gray-500/10 text-gray-400 border-gray-500/25' },
  ready: { label: 'Chờ', className: 'bg-sky-500/10 text-sky-400 border-sky-500/30' },
  in_progress: { label: 'Đang làm', className: 'bg-sky-500/10 text-sky-300 border-sky-500/40' },
  in_review: { label: 'Chờ ký', className: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  pass: { label: 'Đạt', className: 'bg-green-500/10 text-green-400 border-green-500/30' },
  require_rectification: { label: 'Không đạt', className: 'bg-red-500/10 text-red-400 border-red-500/30' },
  reinspection: { label: 'Nghiệm thu lại', className: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
}

export const SOURCE_META: Record<SourceKind, Token> = {
  IFC: { label: 'IFC', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  AFC: { label: 'AFC', className: 'bg-sky-500/10 text-sky-400 border-sky-500/30' },
  BPTC: { label: 'BPTC', className: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30' },
  ITP: { label: 'ITP', className: 'bg-violet-500/10 text-violet-300 border-violet-500/30' },
  MOCK: { label: 'MOCK', className: 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/40 border-dashed' },
  MANUAL: { label: 'MANUAL', className: 'bg-slate-500/10 text-slate-300 border-slate-500/30' },
}

export const READINESS_META: Record<ReadinessState, Token> = {
  ok: { label: 'OK', className: 'text-green-400' },
  warn: { label: 'CẢNH BÁO', className: 'text-amber-400' },
  block: { label: 'CHẶN', className: 'text-red-400' },
}

export const DOC_STATUS_META: Record<DocumentStatus, Token> = {
  approved: { label: 'Đã duyệt', className: 'bg-green-500/10 text-green-400 border-green-500/30' },
  pending: { label: 'Chờ duyệt', className: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  missing: { label: 'Thiếu', className: 'bg-red-500/10 text-red-400 border-red-500/30' },
}

export const DOC_KIND_LABEL: Record<DocumentKind, string> = {
  AFC: 'Bản vẽ AFC',
  BBS: 'Thống kê thép (BBS)',
  BIM: 'Mô hình BIM',
  BPTC: 'Biện pháp thi công',
  ITP: 'ITP',
  TEMPLATE: 'Mẫu checklist',
  TEST: 'Thí nghiệm',
  MATERIAL: 'Vật liệu',
  MEASUREMENT: 'Đo đạc / kiểm định',
}

export const VERIFICATION_METHOD_META: Record<VerificationMethod, Token> = {
  VIDEO_AI: { label: 'VIDEO AI', className: 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30' },
  VISUAL_MANUAL: { label: 'QUAN SÁT', className: 'bg-sky-500/10 text-sky-300 border-sky-500/30' },
  MEASUREMENT: { label: 'ĐO', className: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
  BIM_COMPARE: { label: 'ĐỐI CHIẾU BIM', className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' },
  SURVEY: { label: 'TRẮC ĐẠC', className: 'bg-orange-500/10 text-orange-300 border-orange-500/30' },
  LAB_TEST: { label: 'THÍ NGHIỆM', className: 'bg-red-500/10 text-red-300 border-red-500/30' },
  DOCUMENT_CHECK: { label: 'HỒ SƠ', className: 'bg-violet-500/10 text-violet-300 border-violet-500/30' },
  COMBINATION: { label: 'KẾT HỢP', className: 'bg-slate-500/10 text-slate-300 border-slate-500/30' },
}

export const VISUAL_CONTEXT_LABEL: Record<VisualContext, string> = {
  REBAR: 'Cốt thép',
  CONCRETE: 'Bê tông',
  FORMWORK: 'Ván khuôn',
  PT_DUCT: 'Ống gen / cáp DƯL',
  ANCHOR: 'Neo',
  EMBEDDED_ITEM: 'Chi tiết chôn sẵn',
  STRUCTURAL_STEEL: 'Kết cấu thép',
  SURFACE: 'Bề mặt',
  UNKNOWN: 'Chưa xác định',
}

export const EVIDENCE_TYPE_LABEL: Record<EvidenceType, string> = {
  video: 'Video H1',
  snapshot: 'Snapshot',
  voice: 'Ghi âm',
  measurement: 'Đo đạc',
  test: 'Thí nghiệm',
  ai: 'AI',
  document: 'Tài liệu',
}
