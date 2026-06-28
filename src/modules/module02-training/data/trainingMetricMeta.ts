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
    tip: 'Tổng lớp trong ngày · % kế hoạch = (tổng − huỷ) / tổng',
  },
  {
    icon: Users,
    iconColor: 'text-cyan-400',
    iconBg: 'bg-cyan-500/10',
    accent: 'border-l-cyan-500/50',
    tip: 'Học viên đã ghi nhận điểm danh',
  },
  {
    icon: AlertTriangle,
    iconColor: 'text-orange-400',
    iconBg: 'bg-orange-500/10',
    accent: 'border-l-orange-500/50',
    tip: 'Học viên có ngoại lệ điểm danh',
  },
  {
    icon: ShieldCheck,
    iconColor: 'text-green-400',
    iconBg: 'bg-green-500/10',
    accent: 'border-l-green-500/50',
    tip: 'Tuân thủ = 35% lớp vận hành + 40% tham gia + 25% (100% − ngoại lệ)',
  },
] as const
