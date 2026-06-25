import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Download, CalendarRange } from 'lucide-react'
import { PageLayout, Panel } from '@/components/common/PageLayout/PageLayout'
import { KPICard } from '@/components/common/KPICard/KPICard'
import { cn } from '@/utils/cn'
import { useTrainingCourseStore } from '@/store/trainingCourse.store'
import {
  buildTrainingReport,
  exportTrainingReportCsv,
  getAllTrainingCourses,
  groupLabel,
} from '../services/trainingReport.service'
import type { KPIData } from '@/types/api'

import type { TrainingReportRow } from '../services/trainingReport.service'

const DEFAULT_FROM = '2026-06-17'
const DEFAULT_TO = '2026-06-24'

const GROUP_DOT: Record<string, string> = {
  upcoming: 'bg-blue-400',
  active: 'bg-green-400',
  completed: 'bg-gray-400',
}

function ReportTableRow({ row }: { row: TrainingReportRow }) {
  return (
    <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_72px_72px_72px_80px] gap-x-2 items-center px-3 py-2.5 hover:bg-[#1a2235]/30 transition-colors">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-foreground truncate">{row.title}</p>
        <p className="text-[9px] text-muted-foreground/60 truncate">{row.zone}</p>
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-foreground tabular-nums">{row.sessionDate}</p>
        <p className="text-[9px] text-muted-foreground/70 tabular-nums">
          {row.startTime} – {row.endTime}
        </p>
      </div>
      <p className="text-[10px] tabular-nums text-foreground">
        {row.group === 'upcoming' ? '—' : `${row.present}/${row.total}`}
      </p>
      <p className={cn(
        'text-[10px] tabular-nums font-medium',
        row.exceptions > 0 ? 'text-orange-400' : 'text-muted-foreground/50',
      )}>
        {row.group === 'upcoming' ? '—' : row.exceptions}
      </p>
      <p className={cn(
        'text-[10px] tabular-nums font-semibold',
        row.group === 'upcoming'
          ? 'text-muted-foreground/40'
          : row.attendanceRate >= 75 ? 'text-green-400' : 'text-red-400',
      )}>
        {row.group === 'upcoming' ? '—' : `${row.attendanceRate}%`}
      </p>
      <span className="inline-flex items-center gap-1 text-[9px] font-bold text-muted-foreground">
        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', GROUP_DOT[row.group])} />
        {groupLabel(row.group)}
      </span>
    </div>
  )
}

export function ExecutiveReportPage() {
  const customCourses = useTrainingCourseStore(s => s.customCourses)
  const [fromDate, setFromDate] = useState(DEFAULT_FROM)
  const [toDate, setToDate] = useState(DEFAULT_TO)

  const allCourses = useMemo(
    () => getAllTrainingCourses(customCourses),
    [customCourses],
  )

  const report = useMemo(
    () => buildTrainingReport(allCourses, fromDate, toDate),
    [allCourses, fromDate, toDate],
  )

  const kpis: KPIData[] = [
    {
      label: 'Ca đào tạo',
      value: report.courseCount,
      unit: 'ca',
      detail: `${fromDate.split('-').reverse().join('/')} – ${toDate.split('-').reverse().join('/')}`,
    },
    {
      label: 'Học viên ghi nhận',
      value: report.recorded,
      unit: 'người',
      detail: report.attendeeSlots > 0 ? `Trên ${report.attendeeSlots} đăng ký ca đã chạy` : 'Chưa có ca đã chạy',
    },
    {
      label: 'Ngoại lệ',
      value: report.exceptions,
      unit: 'người',
      detail: report.attendeeSlots > 0
        ? `${Math.round((report.exceptions / report.attendeeSlots) * 1000) / 10}% trên ca đã chạy`
        : undefined,
      higherIsBetter: false,
    },
    {
      label: 'Tỷ lệ tuân thủ',
      value: report.complianceRate,
      unit: '%',
      detail: report.attendeeSlots > 0
        ? `${report.recorded}/${report.attendeeSlots} học viên`
        : 'Chưa có ca đã chạy',
    },
  ]

  const handleExport = () => {
    exportTrainingReportCsv(report, fromDate, toDate)
  }

  return (
    <PageLayout>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
        <Link
          to="/module02"
          className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Về giám sát
        </Link>

        <button
          type="button"
          onClick={handleExport}
          disabled={report.rows.length === 0}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          <Download className="w-3.5 h-3.5" />
          Xuất báo cáo
        </button>
      </div>

      <Panel title="Khoảng thời gian" className="shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <label className="flex-1 space-y-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Từ ngày
            </span>
            <input
              type="date"
              value={fromDate}
              max={toDate}
              onChange={e => setFromDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#0b0f1a] border border-[#1e2433] text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          </label>
          <label className="flex-1 space-y-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Đến ngày
            </span>
            <input
              type="date"
              value={toDate}
              min={fromDate}
              onChange={e => setToDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#0b0f1a] border border-[#1e2433] text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          </label>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground pb-2">
            <CalendarRange className="w-3.5 h-3.5 shrink-0" />
            {report.rows.length} ca trong khoảng đã chọn
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 shrink-0">
        {kpis.map((kpi, i) => (
          <KPICard key={i} data={kpi} />
        ))}
      </div>

      <Panel title="Thống kê theo ca học" noPadding className="flex-1 min-h-[360px] flex flex-col">
        {report.rows.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <p className="text-sm text-muted-foreground">Không có ca học trong khoảng thời gian này</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block flex-1 min-h-0 flex flex-col">
              <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_72px_72px_72px_80px] gap-x-2 px-3 py-2 border-b border-[#1e2433] shrink-0 bg-[#0a0e1a]">
                {['Khoá học', 'Thời gian', 'Có mặt', 'Ngoại lệ', 'Tuân thủ', 'Trạng thái'].map(h => (
                  <span key={h} className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">
                    {h}
                  </span>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-[#1e2433]">
                {report.rows.map(row => (
                  <ReportTableRow key={row.id} row={row} />
                ))}
              </div>
            </div>

            {/* Mobile cards */}
            <div className="lg:hidden flex-1 overflow-y-auto divide-y divide-[#1e2433]">
              {report.rows.map(row => (
                <div key={row.id} className="px-3 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-foreground">{row.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{row.zone}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold text-muted-foreground shrink-0">
                      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', GROUP_DOT[row.group])} />
                      {groupLabel(row.group)}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground tabular-nums">
                    {row.sessionDate} · {row.startTime} – {row.endTime}
                  </p>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div>
                      <p className="text-[8px] text-muted-foreground/50">Có mặt</p>
                      <p className="text-[10px] font-semibold tabular-nums">
                        {row.group === 'upcoming' ? '—' : `${row.present}/${row.total}`}
                      </p>
                    </div>
                    <div>
                      <p className="text-[8px] text-muted-foreground/50">Ngoại lệ</p>
                      <p className={cn(
                        'text-[10px] font-semibold tabular-nums',
                        row.exceptions > 0 ? 'text-orange-400' : 'text-muted-foreground',
                      )}>
                        {row.group === 'upcoming' ? '—' : row.exceptions}
                      </p>
                    </div>
                    <div>
                      <p className="text-[8px] text-muted-foreground/50">Tuân thủ</p>
                      <p className={cn(
                        'text-[10px] font-semibold tabular-nums',
                        row.group === 'upcoming'
                          ? 'text-muted-foreground/40'
                          : row.attendanceRate >= 75 ? 'text-green-400' : 'text-red-400',
                      )}>
                        {row.group === 'upcoming' ? '—' : `${row.attendanceRate}%`}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Panel>
    </PageLayout>
  )
}
