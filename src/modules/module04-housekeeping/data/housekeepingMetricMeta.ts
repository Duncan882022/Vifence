import {
  Sparkles, AlertTriangle, Clock, CheckCircle2,
  type LucideIcon,
} from 'lucide-react'

export interface HousekeepingMetricMeta {
  icon: LucideIcon
  iconColor: string
  iconBg: string
  accent: string
  tip: string
}

export const HOUSEKEEPING_METRIC_META: HousekeepingMetricMeta[] = [
  {
    icon: Sparkles,
    iconColor: 'text-teal-400',
    iconBg: 'bg-teal-500/10',
    accent: 'border-l-teal-500/50',
    tip: 'Tổng số sự cố',
  },
  {
    icon: AlertTriangle,
    iconColor: 'text-emerald-400',
    iconBg: 'bg-emerald-500/10',
    accent: 'border-l-emerald-500/50',
    tip: 'Sự cố mức cao',
  },
  {
    icon: Clock,
    iconColor: 'text-cyan-400',
    iconBg: 'bg-cyan-500/10',
    accent: 'border-l-cyan-500/50',
    tip: 'Chưa xử lý',
  },
  {
    icon: CheckCircle2,
    iconColor: 'text-green-400',
    iconBg: 'bg-green-500/10',
    accent: 'border-l-green-500/50',
    tip: 'Đã xử lý',
  },
] as const
