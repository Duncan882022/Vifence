import {
  ShieldCheck, ShieldAlert, Camera, Gavel,
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
    icon: ShieldCheck,
    iconColor: 'text-green-400',
    iconBg: 'bg-green-500/10',
    accent: 'border-l-green-500/50',
    tip: 'Điểm tuân thủ PPE theo mức Cao / TB / Thấp — hover ℹ để xem cách tính',
  },
  {
    icon: ShieldAlert,
    iconColor: 'text-orange-400',
    iconBg: 'bg-orange-500/10',
    accent: 'border-l-orange-500/50',
    tip: 'Vi phạm an toàn phát hiện hôm nay',
  },
  {
    icon: Camera,
    iconColor: 'text-cyan-400',
    iconBg: 'bg-cyan-500/10',
    accent: 'border-l-cyan-500/50',
    tip: 'Camera AI giám sát đang hoạt động trên công trường',
  },
  {
    icon: Gavel,
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/10',
    accent: 'border-l-amber-500/50',
    tip: 'Quyết định xử phạt vi phạm an toàn — đã xử lý và chưa xử lý',
  },
] as const
