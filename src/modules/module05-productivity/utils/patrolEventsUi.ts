import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, CheckCircle2, Clock3, ShieldAlert, Truck } from 'lucide-react'
import type { EventStatus, EventType } from '../data/patrolMockData'

export const PATROL_EVENT_TYPES: EventType[] = ['PPE_VIOLATION', 'MACHINE_STOPPED']

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
