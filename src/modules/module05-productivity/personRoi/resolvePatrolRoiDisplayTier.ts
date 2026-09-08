import type { PersonRoiTier } from './types'
import { resolvePatrolTier } from '../utils/resolvePatrolTier'
import type { PatrolTierSnapshot } from '../types/patrolTierSnapshot'
import { PATROL_OBJECT_FACE_SNAPSHOT_SCORE } from '../utils/patrolDayObjectFilter'

/** Hồ sơ nhân sự bản nháp (tk-* đã commit person) — cam kể cả quay lưng. */
export function patrolLiveRoiDraftProfile(profileStatus?: string | null): boolean {
  return (profileStatus ?? '').trim() === 'draft'
}

/** Cam live ROI: mặt đủ mạnh trên frame hiện tại để nhận diện lại sau. */
export function patrolLiveRoiStrongFaceNow(input: {
  faceEligible?: boolean
  snapshotScore?: number
  tierSnapshot?: PatrolTierSnapshot | null
}): boolean {
  const faceEligible = input.faceEligible ?? input.tierSnapshot?.face_eligible ?? false
  const snapshotScore = input.snapshotScore ?? input.tierSnapshot?.snapshot_score ?? 0
  return Boolean(faceEligible) && snapshotScore >= PATROL_OBJECT_FACE_SNAPSHOT_SCORE
}

/**
 * Quy tắc cam live ROI — không tô cam cho mọi tk-* ẩn danh trên lưng:
 * 1) hồ sơ draft, hoặc 2) mặt rõ frame này (≥ ngưỡng snapshot).
 */
export function patrolLiveRoiQualifiesOrange(input: {
  profileStatus?: string | null
  faceEligible?: boolean
  snapshotScore?: number
  tierSnapshot?: PatrolTierSnapshot | null
}): boolean {
  const profileStatus = input.profileStatus ?? input.tierSnapshot?.profile_status
  if (patrolLiveRoiDraftProfile(profileStatus)) return true
  return patrolLiveRoiStrongFaceNow(input)
}

/**
 * Tier hiển thị trên ROI live — xanh gallery; cam chỉ draft hoặc mặt mạnh; còn lại xám.
 */
export function resolvePatrolRoiDisplayTier(
  tier: PersonRoiTier,
  opts?: {
    faceEligible?: boolean
    workerId?: string | null
    promotedFrom?: string[]
    profileStatus?: string | null
    snapshotScore?: number
    tierSnapshot?: PatrolTierSnapshot | null
  },
): PersonRoiTier {
  const base = resolvePatrolTier({
    tierSnapshot: opts?.tierSnapshot ?? undefined,
    tier,
    workerId: opts?.workerId,
    promotedFrom: opts?.promotedFrom,
    faceEligible: opts?.faceEligible,
    snapshotScore: opts?.snapshotScore ?? opts?.tierSnapshot?.snapshot_score,
    surface: 'live-roi',
  })

  if (base === 'identity') return 'identity'

  if (patrolLiveRoiQualifiesOrange(opts ?? {})) return 'person'

  return 'object'
}
