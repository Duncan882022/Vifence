import type {
  CameraDisplayState,
  InspectionSession,
  Issue,
  LiveAxis,
  RecordAxis,
  StageCode,
  StageProgress,
} from '../../workflow.types'

/** Giây đã ghi (trừ thời gian tạm dừng) — trùng mốc với video H1. */
export function sessionElapsedSec(session: InspectionSession, nowMs: number = Date.now()): number {
  const start = Date.parse(session.startedAt)
  const end = session.finishedAt ? Date.parse(session.finishedAt) : nowMs
  let paused = 0
  for (const p of session.pauses) {
    const from = Date.parse(p.from)
    const to = p.to ? Date.parse(p.to) : end
    paused += Math.max(0, Math.min(to, end) - from)
  }
  return Math.max(0, (end - start - paused) / 1000)
}

export function isPaused(session: InspectionSession): boolean {
  const last = session.pauses[session.pauses.length - 1]
  return Boolean(last && !last.to)
}

/** §8: hai trục độc lập live / record → nhãn hiển thị. Mất live không phải mất bản ghi. */
export function cameraDisplayState(live: LiveAxis, record: RecordAxis): CameraDisplayState {
  if (live === 'off' && record === 'off') return 'DISCONNECTED'
  if (live === 'connecting' && record === 'off') return 'CONNECTING'
  if (live === 'lost') return record === 'off' ? 'DISCONNECTED' : 'LIVE LOST / RECORDING LOCAL'
  if (live === 'live') return record === 'off' ? 'LIVE' : 'LIVE + RECORDING'
  return 'RECORDING'
}

export function sessionsFor(sessions: InspectionSession[], assetId: string, stage?: StageCode): InspectionSession[] {
  return sessions
    .filter(s => s.assetId === assetId && (!stage || s.stage === stage))
    .sort((a, b) => a.attempt - b.attempt)
}

export function latestSession(sessions: InspectionSession[], assetId: string, stage: StageCode): InspectionSession | undefined {
  const list = sessionsFor(sessions, assetId, stage)
  return list[list.length - 1]
}

export function isStagePassed(sessions: InspectionSession[], assetId: string, stage: StageCode): boolean {
  return latestSession(sessions, assetId, stage)?.signOff?.result === 'pass'
}

export function stageProgress(
  sessions: InspectionSession[],
  assetId: string,
  stage: StageCode,
  dependsOn: StageCode | null,
): StageProgress {
  const last = latestSession(sessions, assetId, stage)
  if (!last) {
    if (!dependsOn || isStagePassed(sessions, assetId, dependsOn)) return 'ready'
    return 'pending'
  }
  if (last.signOff) {
    if (last.signOff.result === 'pass') return 'pass'
    return last.signOff.result === 'reinspection' ? 'reinspection' : 'require_rectification'
  }
  if (last.status === 'in_progress' || last.status === 'paused') return 'in_progress'
  return 'in_review'
}

export function openIssues(issues: Issue[], assetId: string, stage?: StageCode): Issue[] {
  return issues.filter(i => i.assetId === assetId && i.status !== 'closed' && (!stage || i.stage === stage))
}

/** Đường dẫn tiếp theo cho phiên đang dở. */
export function sessionResumeStep(session: InspectionSession): 'live' | 'finish' | 'review' | 'report' {
  if (session.status === 'in_progress' || session.status === 'paused') return 'live'
  if (session.status === 'signed') return 'report'
  if (session.sync !== 'synced') return 'finish'
  return 'review'
}
