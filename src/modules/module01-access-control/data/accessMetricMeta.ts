import {
  Users, Truck, Building2, AlertTriangle,
  type LucideIcon,
} from 'lucide-react'

export interface AccessMetricMeta {
  icon: LucideIcon
  iconColor: string
  iconBg: string
  accent: string
  tip: string
}

export const ACCESS_METRIC_META: AccessMetricMeta[] = [
  {
    icon: Users,
    iconColor: 'text-blue-400',
    iconBg: 'bg-blue-500/10',
    accent: 'border-l-blue-500/50',
    tip: 'Người trong công trường',
  },
  {
    icon: Truck,
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/10',
    accent: 'border-l-amber-500/50',
    tip: 'Xe ra vào hôm nay',
  },
  {
    icon: Building2,
    iconColor: 'text-green-400',
    iconBg: 'bg-green-500/10',
    accent: 'border-l-green-500/50',
    tip: 'Nhà thầu hiện diện',
  },
  {
    icon: AlertTriangle,
    iconColor: 'text-red-400',
    iconBg: 'bg-red-500/10',
    accent: 'border-l-red-500/50',
    tip: 'Ngoại lệ hôm nay',
  },
] as const
