import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ShieldAlert,
  Truck,
  Users,
  UserCheck,
  Activity,
  TrendingUp,
  Flame,
} from 'lucide-react'
import type { EventStatus, EventType } from '../data/patrolMockData'

export const PATROL_EVENT_TYPES: EventType[] = [
  'PPE_VIOLATION',
  'PERSON_DETECTED',
  'MACHINE_STOPPED',
  'POPULATION_OBSERVED',
  'POPULATION_CHANGE',
  'HIGH_DENSITY',
  'IDENTITY_VERIFIED',
]

export const WORKFORCE_EVENT_TYPES: EventType[] = [
  'POPULATION_OBSERVED',
  'POPULATION_CHANGE',
  'HIGH_DENSITY',
  'IDENTITY_VERIFIED',
]

export const PATROL_TYPE_META: Record<EventType, {
  id: string
  label: string
  icon: LucideIcon
  color: string
  badge: string
  borderAccent: string
  tooltip: string
}> = {
  PPE_VIOLATION: {
    id: 'PPE',
    label: 'PPE',
    icon: ShieldAlert,
    color: 'text-red-400',
    badge: 'bg-red-500/10 text-red-400 border-red-500/30',
    borderAccent: 'border-l-red-400',
    tooltip: 'Vi phạm PPE',
  },
  MACHINE_STOPPED: {
    id: 'MACHINE',
    label: 'Máy dừng',
    icon: Truck,
    color: 'text-amber-400',
    badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    borderAccent: 'border-l-amber-400',
    tooltip: 'Máy dừng >5 giây',
  },
  PERSON_DETECTED: {
    id: 'PERS',
    label: 'Nhân lực',
    icon: Users,
    color: 'text-sky-400',
    badge: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
    borderAccent: 'border-l-sky-400',
    tooltip: 'Quét nhân lực — snapshot ROI + mã workerId',
  },
  POPULATION_OBSERVED: {
    id: 'POP',
    label: 'Nhân lực',
    icon: Activity,
    color: 'text-emerald-400',
    badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    borderAccent: 'border-l-emerald-400',
    tooltip: 'Quan sát nhân lực (S_obs cao)',
  },
  POPULATION_CHANGE: {
    id: 'ΔPOP',
    label: 'Thay đổi',
    icon: TrendingUp,
    color: 'text-lime-400',
    badge: 'bg-lime-500/10 text-lime-400 border-lime-500/30',
    borderAccent: 'border-l-lime-400',
    tooltip: 'Thay đổi dân số quan sát đáng kể',
  },
  HIGH_DENSITY: {
    id: 'DENSE',
    label: 'Mật độ',
    icon: Flame,
    color: 'text-orange-400',
    badge: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
    borderAccent: 'border-l-orange-400',
    tooltip: 'Mật độ nhân lực cao',
  },
  IDENTITY_VERIFIED: {
    id: 'ID',
    label: 'Định danh',
    icon: UserCheck,
    color: 'text-violet-400',
    badge: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
    borderAccent: 'border-l-violet-400',
    tooltip: 'Đã xác minh danh tính (Face)',
  },
}

export function getPatrolEventStatusDisplay(status: EventStatus): {
  label: string
  badgeClassName: string
  icon: LucideIcon
} {
  switch (status) {
    case 'LOCKED':
      return {
        label: 'Ghi nhận',
        badgeClassName: 'bg-red-400/10 text-red-400 border-red-400/30',
        icon: AlertTriangle,
      }
    case 'ENDED':
      return {
        label: 'Đã kết thúc',
        badgeClassName: 'bg-slate-700/80 text-slate-300 border-slate-600/50',
        icon: CheckCircle2,
      }
    case 'PENDING':
      return {
        label: 'Chờ xác nhận',
        badgeClassName: 'bg-amber-400/10 text-amber-400 border-amber-400/30',
        icon: Clock3,
      }
    default:
      return {
        label: 'Phát hiện',
        badgeClassName: 'bg-sky-400/10 text-sky-400 border-sky-400/30',
        icon: Clock3,
      }
  }
}

export function shouldShowPatrolStatusBadge(status: EventStatus): boolean {
  return status === 'LOCKED' || status === 'ENDED' || status === 'PENDING'
}

export function getPatrolEventPlace(cameraName: string, zoneName: string): string {
  return `${cameraName} · ${zoneName}`
}
