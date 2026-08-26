/**
 * Module 05 — nhãn sự kiện nhân lực theo vòng đời:
 *   Đối tượng (chưa đủ định danh) → Người (mã tạm ổn định, re-id) → Định danh (có Tên + Đơn vị)
 */
import type { LucideIcon } from 'lucide-react'
import { LayoutGrid, UserCheck, UserRound, Users } from 'lucide-react'
import type { PatrolEvent } from '../data/patrolMockData'
import { getPatrolManualIdentity, isPatrolManuallyIdentified, getPatrolManualIdentityForSgc } from '../services/patrolManualIdentity.service'
import { isVerifiedWorkerLabel } from './workforceHeatmapUi'
import { PATROL_TIER_TOKENS } from './patrolTierTokens'
import {
  isPatrolGalleryWorkerId,
  resolvePatrolCanonicalEntityKey,
  resolvePatrolEventSgcKey,
  resolvePatrolProfileEntityKey,
} from './patrolIdentityEntity'

/** 3 giai đoạn nhận diện người — dùng cho tab panel sự kiện và KPI. */
export type PatrolPersonStage = 'object' | 'person' | 'profile'

export const PATROL_PERSON_STAGE_META: Record<PatrolPersonStage, {
  label: string
  icon: LucideIcon
  color: string
  badge: string
  borderAccent: string
  tooltip: string
}> = {
  object: { ...PATROL_TIER_TOKENS.object, icon: UserRound },
  person: { ...PATROL_TIER_TOKENS.person, icon: Users },
  // `profile` là tên cũ của tầng thứ ba trong panel; token dùng chung với ROI.
  profile: { ...PATROL_TIER_TOKENS.identity, icon: UserCheck },
}

export const PATROL_EVENTS_TAB_META: Record<'all' | 'object' | 'person' | 'identity', {
  label: string
  icon: LucideIcon
  color: string
  inactiveColor: string
}> = {
  all: {
    label: 'Tất cả',
    icon: LayoutGrid,
    color: 'text-primary',
    inactiveColor: 'text-muted-foreground',
  },
  object: {
    label: 'Đối tượng',
    icon: PATROL_PERSON_STAGE_META.object.icon,
    color: PATROL_PERSON_STAGE_META.object.color,
    inactiveColor: 'text-slate-500',
  },
  person: {
    label: 'Người',
    icon: PATROL_PERSON_STAGE_META.person.icon,
    color: PATROL_PERSON_STAGE_META.person.color,
    inactiveColor: 'text-sky-500/70',
  },
  identity: {
    label: 'Định danh',
    icon: PATROL_PERSON_STAGE_META.profile.icon,
    color: PATROL_PERSON_STAGE_META.profile.color,
    inactiveColor: 'text-violet-500/70',
  },
}

/** Icon/badge card sự kiện — theo giai đoạn tab, không dùng chung「Nhân lực」. */
export function resolvePatrolEventDisplayMeta(event: PatrolEvent): {
  label: string
  icon: LucideIcon
  color: string
  badge: string
  borderAccent: string
  tooltip: string
} {
  if (event.type === 'IDENTITY_VERIFIED') {
    return PATROL_PERSON_STAGE_META.profile
  }
  if (event.type === 'PERSON_DETECTED') {
    return PATROL_PERSON_STAGE_META[resolvePatrolPersonStage(event)]
  }
  return {
    label: event.type,
    icon: Users,
    color: 'text-sky-400',
    badge: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
    borderAccent: 'border-l-sky-400',
    tooltip: event.type,
  }
}

export function isPatrolSgcWorkerId(id?: string | null): boolean {
  return Boolean(id && /^sgc-/i.test(id.trim()))
}

export function isPatrolObjectId(id?: string | null): boolean {
  return Boolean(id && /^obj-/i.test(id.trim()))
}

export function isPatrolPersId(id?: string | null): boolean {
  return Boolean(id && /^pers-/i.test(id.trim()))
}

export function isPatrolIdenId(id?: string | null): boolean {
  return Boolean(id && /^iden-/i.test(id.trim()))
}

/**
 * Phân loại giai đoạn nhận diện của một sự kiện PERSON_DETECTED:
 * - profile: khớp thư viện mặt hoặc đã gán Tên + Đơn vị thủ công → ROI hiện tên
 * - person:  đã đủ mặt để nhận diện (có mã sgc) nhưng chưa có trong thư viện
 * - object:  quay lưng / không thấy mặt, chỉ đủ đầu + 1/3 thân trên
 */
export function resolvePatrolPersonStage(event: PatrolEvent): PatrolPersonStage {
  // Server đã chốt tầng thì tin server. Suy lại ở đây chỉ đúng khi mã và
  // localStorage cùng khớp, mà đó là hai nguồn có thể lệch nhau.
  if (event.stage) return event.stage

  const objectId = event.objectId?.trim() ?? ''
  const trackWorkerId = event.trackWorkerId?.trim() ?? ''

  // Định danh — gallery hoặc gán thủ công trực tiếp lên sgc (không kéo từ OBJ dùng chung)
  if (resolvePatrolProfileEntityKey(event)) return 'profile'
  if (trackWorkerId && getPatrolManualIdentityForSgc(trackWorkerId)) return 'profile'
  if (objectId && isPatrolManuallyIdentified(objectId) && !isPatrolSgcWorkerId(trackWorkerId)) return 'profile'
  if (isPatrolGalleryWorkerId(objectId) || isPatrolGalleryWorkerId(trackWorkerId)) return 'profile'
  // Chỉ coi label là định danh khi đã có manual/gallery — không dùng hex event id

  // Tab Người — mã pers-* (SQLite) hoặc sgc-* (live legacy).
  if (isPatrolPersId(objectId)) return 'person'
  if (isPatrolSgcWorkerId(objectId)) return 'person'
  if (isPatrolSgcWorkerId(trackWorkerId)) return 'person'
  if (isPatrolIdenId(objectId)) return 'profile'

  return 'object'
}

/** Tiêu đề card theo giai đoạn. */
export function patrolWorkforceEventTitle(
  type: PatrolEvent['type'],
  objectId?: string | null,
  objectLabel?: string | null,
  trackWorkerId?: string | null,
): string {
  if (type === 'IDENTITY_VERIFIED') return 'Định danh'
  if (type === 'PERSON_DETECTED') {
    const profileKey = resolvePatrolProfileEntityKey({ objectId, trackWorkerId, objectLabel })
    if (profileKey) {
      const manual = getPatrolManualIdentity(objectId ?? '') ?? getPatrolManualIdentity(trackWorkerId ?? '')
      if (manual?.workerName) return manual.workerName
      if (isVerifiedWorkerLabel(objectLabel ?? '')) return objectLabel!.trim()
      return 'Định danh'
    }
    if (isPatrolSgcWorkerId(objectId) || isPatrolSgcWorkerId(trackWorkerId)) return 'Người'
    if (isPatrolPersId(objectId) || isPatrolPersId(trackWorkerId)) return 'Người'
    return 'Đối tượng'
  }
  return ''
}

/** Dòng phụ — sgc master; OBJ hiển thị phụ khi có. */
export function patrolWorkforceEventSubjectId(
  objectId?: string | null,
  trackWorkerId?: string | null,
): string {
  const oid = objectId?.trim() ?? ''
  const track = trackWorkerId?.trim() ?? ''
  const sgc = isPatrolSgcWorkerId(track)
    ? track
    : isPatrolSgcWorkerId(oid)
      ? oid
      : ''
  const obj = isPatrolObjectId(oid) ? oid : ''

  if (sgc && obj) return `${sgc} · ${obj}`
  if (sgc) return sgc
  if (obj) return obj
  if (track) return track
  return oid || '—'
}

export function formatPatrolPersonDetectedEvent(event: PatrolEvent): PatrolEvent {
  if (event.type !== 'PERSON_DETECTED') return event

  const trackWorkerId = isPatrolSgcWorkerId(event.trackWorkerId)
    ? event.trackWorkerId
    : isPatrolSgcWorkerId(event.objectId)
      ? event.objectId
      : undefined
  const title = patrolWorkforceEventTitle(
    event.type,
    event.objectId,
    event.objectLabel,
    trackWorkerId,
  )
  const subjectId = patrolWorkforceEventSubjectId(event.objectId, trackWorkerId)

  return {
    ...event,
    trackWorkerId,
    violationLabel: title,
    objectLabel: subjectId,
  }
}

/** Khóa master dedup — pers day card > profile worker > sgc > OBJ. */
export function patrolEventMasterEntityKey(event: PatrolEvent): string {
  const fromDayCard = event.id.match(/^pers:(.+)$/i)?.[1]?.trim()
  if (fromDayCard) return fromDayCard.toLowerCase()
  return resolvePatrolCanonicalEntityKey(event)
}

/** Subject id tra lịch sử xuất hiện (popup) — ưu tiên pers/obj từ SQLite day cards. */
export function resolvePatrolAppearanceSubjectId(event: PatrolEvent): string {
  const fromDayCard = event.id.match(/^(?:pers|obj):(.+)$/i)?.[1]?.trim()
  if (fromDayCard) return fromDayCard

  const objectId = event.objectId?.trim() ?? ''
  if (isPatrolPersId(objectId) || isPatrolObjectId(objectId)) return objectId

  const sgc = resolvePatrolEventSgcKey(event)
  if (sgc) return sgc

  const key = patrolEventMasterEntityKey(event)
  if (key.startsWith('EV:')) {
    const track = event.trackWorkerId?.trim()
    if (track && isPatrolSgcWorkerId(track)) return track.toUpperCase()
    if (objectId && isPatrolSgcWorkerId(objectId)) return objectId.toUpperCase()
    if (objectId && isPatrolGalleryWorkerId(objectId)) return objectId.toUpperCase()
    return objectId || track || event.id
  }
  return key
}

/** @deprecated Dùng `resolvePatrolAppearanceSubjectId`. */
export function patrolEventAppearanceMasterId(event: PatrolEvent): string {
  return resolvePatrolAppearanceSubjectId(event)
}

/** Gộp list — giữ snapshot mới nhất theo master key. */
export function dedupePatrolEventsByMasterEntity(events: PatrolEvent[]): PatrolEvent[] {
  const byKey = new Map<string, PatrolEvent>()
  for (const event of events) {
    const key = patrolEventMasterEntityKey(event)
    const prev = byKey.get(key)
    if (
      !prev
      || new Date(event.lockedAt).getTime() > new Date(prev.lockedAt).getTime()
    ) {
      byKey.set(key, event)
    }
  }
  return [...byKey.values()].sort(
    (a, b) => new Date(b.lockedAt).getTime() - new Date(a.lockedAt).getTime(),
  )
}

export type PatrolEventsTabKey = 'all' | 'object' | 'person' | 'identity'

function hasPatrolSnapshot(event: PatrolEvent): boolean {
  return Boolean(event.snapshotUrl?.trim())
}

function matchesPatrolEventsTab(event: PatrolEvent, tab: PatrolEventsTabKey): boolean {
  if (!hasPatrolSnapshot(event)) return false
  if (tab === 'all') {
    return event.type === 'PERSON_DETECTED' || event.type === 'IDENTITY_VERIFIED'
  }
  if (tab === 'identity') {
    return event.type === 'PERSON_DETECTED' && resolvePatrolPersonStage(event) === 'profile'
  }
  if (event.type !== 'PERSON_DETECTED') return false
  return resolvePatrolPersonStage(event) === tab
}

/** Đếm unique entity theo tab — không đếm raw event rows. */
export function countUniquePatrolTabEntities(
  events: PatrolEvent[],
  tab: PatrolEventsTabKey,
): number {
  const keys = new Set<string>()
  for (const event of events) {
    if (!matchesPatrolEventsTab(event, tab)) continue
    keys.add(patrolEventMasterEntityKey(event))
  }
  return keys.size
}

/** Mọi khóa alias có thể tra lịch sử (sgc + OBJ). */
export function patrolEventIdentityKeys(event: PatrolEvent): string[] {
  const keys = new Set<string>()
  if (event.objectId?.trim()) keys.add(event.objectId.trim())
  if (event.trackWorkerId?.trim()) keys.add(event.trackWorkerId.trim())
  return [...keys]
}
