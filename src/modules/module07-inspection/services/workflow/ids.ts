import { STAGES } from '../../data/workflow/hnqnProject'
import type { StageCode } from '../../workflow.types'

const pad = (n: number, width: number) => String(n).padStart(width, '0')

/** `INS-S002-G02-0001` */
export function sessionIdFor(assetCode: string, stage: StageCode, attempt: number): string {
  return `INS-${assetCode}-G${pad(STAGES[stage].order, 2)}-${pad(attempt, 4)}`
}

/** `ISSUE-S002-001` */
export function issueIdFor(assetCode: string, seq: number): string {
  return `ISSUE-${assetCode}-${pad(seq, 3)}`
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  return `${pad(Math.floor(s / 3600), 2)}:${pad(Math.floor((s % 3600) / 60), 2)}:${pad(s % 60, 2)}`
}
