import {
  BookOpen, Users, AlertTriangle, ShieldCheck,
  type LucideIcon,
} from 'lucide-react'

export interface TrainingMetricMeta {
  icon: LucideIcon
  iconColor: string
  iconBg: string
  accent: string
  tip: string
}

export const TRAINING_METRIC_META: TrainingMetricMeta[] = [
  {
    icon: BookOpen,
    iconColor: 'text-green-400',
    iconBg: 'bg-green-500/10',
    accent: 'border-l-green-500/50',
    tip: 'Khoá học trong ngày',
  },
  {
    icon: Users,
    iconColor: 'text-sky-400',
    iconBg: 'bg-sky-500/10',
    accent: 'border-l-sky-500/50',
    tip: 'Học viên ghi nhận',
  },
  {
    icon: AlertTriangle,
    iconColor: 'text-orange-400',
    iconBg: 'bg-orange-500/10',
    accent: 'border-l-orange-500/50',
    tip: 'Ngoại lệ trong ngày',
  },
  {
    icon: ShieldCheck,
    iconColor: 'text-blue-400',
    iconBg: 'bg-blue-500/10',
    accent: 'border-l-blue-500/50',
    tip: 'Tỷ lệ tuân thủ',
  },
] as const
