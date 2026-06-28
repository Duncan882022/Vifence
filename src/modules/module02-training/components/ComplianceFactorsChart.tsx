import { useMemo } from 'react'
import { BookOpen, Users, AlertTriangle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/utils/cn'
import { IconTooltipBadge } from '@/components/common/IconTooltip/IconTooltip'
import {
  COMPLIANCE_FACTOR_COLORS,
  COMPLIANCE_WEIGHTS,
  type TrainingDayStats,
} from '../services/trainingKpi.service'

interface ComplianceFactorsChartProps {
  stats: TrainingDayStats
  className?: string
}

interface FactorSegment {
  key: string
  points: number
  color: string
}

interface FactorChip {
  key: string
  icon: LucideIcon
  points: number
  tip: string
  className: string
}

function formatFactorPercent(percent: number): string {
  return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(1)}%`
}

export function ComplianceFactorsChart({ stats, className }: ComplianceFactorsChartProps) {
  const total = stats.complianceScore

  const segments = useMemo<FactorSegment[]>(() => [
    { key: 'course', points: stats.compliancePartsDisplay.course, color: COMPLIANCE_FACTOR_COLORS.course },
    { key: 'attendance', points: stats.compliancePartsDisplay.attendance, color: COMPLIANCE_FACTOR_COLORS.attendance },
    { key: 'exception', points: stats.compliancePartsDisplay.exceptionClean, color: COMPLIANCE_FACTOR_COLORS.exception },
  ], [stats.compliancePartsDisplay])

  const chips = useMemo<FactorChip[]>(() => {
    const exceptionCleanRate = Math.max(0, 100 - stats.exceptionRate)
    const { course, attendance, exceptionClean } = stats.compliancePartsDisplay
    return [
      {
        key: 'course',
        icon: BookOpen,
        points: course,
        tip: `Lớp vận hành ${formatFactorPercent(stats.courseRunRate)} · trọng số ${COMPLIANCE_WEIGHTS.course * 100}% · đóng góp ${course} điểm`,
        className: 'bg-green-500/10 text-green-400',
      },
      {
        key: 'attendance',
        icon: Users,
        points: attendance,
        tip: `Tham gia ${formatFactorPercent(stats.attendanceRate)} · trọng số ${COMPLIANCE_WEIGHTS.attendance * 100}% · đóng góp ${attendance} điểm`,
        className: 'bg-cyan-500/10 text-cyan-400',
      },
      {
        key: 'exception',
        icon: AlertTriangle,
        points: exceptionClean,
        tip: `Không ngoại lệ ${formatFactorPercent(exceptionCleanRate)} · trọng số ${COMPLIANCE_WEIGHTS.exception * 100}% · đóng góp ${exceptionClean} điểm`,
        className: 'bg-orange-500/10 text-orange-400',
      },
    ]
  }, [stats])

  const active = segments.filter(s => s.points > 0)

  return (
    <div className={cn('w-full min-w-0 space-y-1', className)} aria-label={`Tuân thủ ${total} điểm`}>
      <div
        className="h-2.5 sm:h-2 w-full rounded-full bg-[#1e2433] overflow-hidden flex"
        role="img"
        title={`Tuân thủ ${total} điểm`}
      >
        {active.map((seg, i) => (
          <div
            key={seg.key}
            className={cn(
              'h-full shrink-0 transition-[width] duration-700 ease-out',
              i === 0 && 'rounded-l-full',
              i === active.length - 1 && 'rounded-r-full',
            )}
            style={{
              width: total > 0 ? `${(seg.points / total) * 100}%` : '0%',
              backgroundColor: seg.color,
            }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {chips.map(chip => (
          <IconTooltipBadge
            key={chip.key}
            icon={chip.icon}
            label={chip.tip}
            tip={chip.tip}
            value={chip.points}
            className={chip.className}
          />
        ))}
      </div>
    </div>
  )
}
