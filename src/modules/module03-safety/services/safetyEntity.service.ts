import type { SafetyViolation, SafetyViolatorRank } from '@/types/safety'
import { SAFETY_VIOLATIONS } from '../data/safetyViolations'

export interface SafetyWorkerProfile {
  workerId: string
  name: string
  employeeCode?: string
  contractorName?: string
  teamName?: string
  role: string
  site: string
  phone?: string
}

export interface SafetyWorkerSummary {
  profile: SafetyWorkerProfile
  violations: SafetyViolation[]
  totalViolations: number
  pendingCount: number
  lastViolationAt?: string
}

export interface SafetyContractorSummary {
  name: string
  violations: SafetyViolation[]
  totalViolations: number
  pendingCount: number
  workerCount: number
  topViolators: SafetyViolatorRank[]
}

const DEFAULT_SITE = 'OCP1 · Hạ Long Xanh'

const ROLE_BY_TEAM: Record<string, string> = {
  'Giàn giáo': 'Thợ giàn giáo',
  'Cọc nhồi': 'Công nhân cọc nhồi',
  'PCCC': 'Công nhân PCCC',
  'Cơ điện': 'Thợ cơ điện',
  'Thi công': 'Công nhân thi công',
  'Vận hành': 'Nhân viên vận hành',
  'Logistics': 'Nhân viên kho vật tư',
  'Toolbox': 'Công nhân thi công',
  'Máy hạng nặng': 'Vận hành máy hạng nặng',
  'An toàn đầu ca': 'Nhân viên an toàn',
}

const WORKER_PHONES: Record<string, string> = {
  'w-001': '0901 234 567',
  'w-002': '0912 345 678',
  'w-019': '0923 456 789',
  'w-005': '0934 567 890',
}

function inferRole(teamName?: string): string {
  if (!teamName) return 'Công nhân thi công'
  const key = Object.keys(ROLE_BY_TEAM).find(prefix => teamName.includes(prefix))
  return key ? ROLE_BY_TEAM[key] : 'Công nhân thi công'
}


export function getViolationsByWorker(
  workerIdOrName: string,
  violations: SafetyViolation[] = SAFETY_VIOLATIONS,
): SafetyViolation[] {
  return violations
    .filter(v =>
      v.workerId === workerIdOrName
      || v.workerName === workerIdOrName,
    )
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

export function getViolationsByContractor(
  contractorName: string,
  violations: SafetyViolation[] = SAFETY_VIOLATIONS,
): SafetyViolation[] {
  return violations
    .filter(v => v.contractorName === contractorName)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

export function buildWorkerProfile(
  workerIdOrName: string,
  violations: SafetyViolation[] = SAFETY_VIOLATIONS,
): SafetyWorkerProfile | null {
  const workerViolations = getViolationsByWorker(workerIdOrName, violations)
  const first = workerViolations[0]
  if (!first?.workerName) return null

  const workerId = first.workerId ?? workerIdOrName

  return {
    workerId,
    name: first.workerName,
    employeeCode: first.employeeCode,
    contractorName: first.contractorName,
    teamName: first.teamName,
    role: inferRole(first.teamName),
    site: DEFAULT_SITE,
    phone: WORKER_PHONES[workerId],
  }
}

export function getWorkerSummary(
  workerIdOrName: string,
  violations: SafetyViolation[] = SAFETY_VIOLATIONS,
): SafetyWorkerSummary | null {
  const profile = buildWorkerProfile(workerIdOrName, violations)
  if (!profile) return null

  const workerViolations = getViolationsByWorker(workerIdOrName, violations)

  return {
    profile,
    violations: workerViolations,
    totalViolations: workerViolations.length,
    pendingCount: workerViolations.filter(v => v.status === 'pending').length,
    lastViolationAt: workerViolations[0]?.timestamp,
  }
}

export function getContractorSummary(
  contractorName: string,
  violations: SafetyViolation[] = SAFETY_VIOLATIONS,
): SafetyContractorSummary {
  const contractorViolations = getViolationsByContractor(contractorName, violations)
  const workerMap = new Map<string, SafetyViolatorRank>()

  for (const v of contractorViolations) {
    const name = v.workerName ?? 'Không rõ'
    const existing = workerMap.get(name)
    if (existing) {
      existing.count += 1
    } else {
      workerMap.set(name, {
        name,
        contractorName: v.contractorName,
        teamName: v.teamName,
        count: 1,
      })
    }
  }

  return {
    name: contractorName,
    violations: contractorViolations,
    totalViolations: contractorViolations.length,
    pendingCount: contractorViolations.filter(v => v.status === 'pending').length,
    workerCount: workerMap.size,
    topViolators: [...workerMap.values()].sort((a, b) => b.count - a.count).slice(0, 5),
  }
}

export function resolveWorkerClickTarget(v: SafetyViolation): string | null {
  if (v.workerId) return v.workerId
  if (v.workerName) return v.workerName
  return null
}
