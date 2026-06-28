import {
  ShieldAlert, AlertTriangle, AlertCircle, Shield,
  type LucideIcon,
} from 'lucide-react'

export interface SafetyMetricMeta {
  icon: LucideIcon
  iconColor: string
  iconBg: string
  accent: string
  tip: string
}

export const SAFETY_METRIC_META: SafetyMetricMeta[] = [
  {
    icon: ShieldAlert,
    iconColor: 'text-blue-400',
    iconBg: 'bg-blue-500/10',
    accent: 'border-l-blue-500/50',
    tip: 'Tổng số vi phạm',
  },
  {
    icon: AlertTriangle,
    iconColor: 'text-red-400',
    iconBg: 'bg-red-500/10',
    accent: 'border-l-red-500/50',
    tip: 'Mức cao',
  },
  {
    icon: AlertCircle,
    iconColor: 'text-orange-400',
    iconBg: 'bg-orange-500/10',
    accent: 'border-l-orange-500/50',
    tip: 'Mức trung bình',
  },
  {
    icon: Shield,
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/10',
    accent: 'border-l-amber-500/50',
    tip: 'Mức thấp',
  },
] as const
