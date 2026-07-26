import { useState } from 'react'
import { ChevronDown, ChevronUp, Filter, Lock, Search, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/utils/cn'
import type {
  AlertSeverity,
  EventSubjectType,
  ResponsibleUnitType,
  SafetyDashboardFilters,
  SafetyGroupId,
  ViolationStatus,
} from '../../types/safety.types'
import { SAFETY_GROUPS } from '../../data/safetyGroups'
import { SAFETY_SCENARIOS, getScenariosForGroup } from '../../data/safetyScenarios'
import { DEVICE_TYPE_LABELS } from '../../data/monitoringDevices'
import { STATUS_LABELS } from '../../data/monitoringDevices'
import { getContractorOptions, getAllSafetyRecords } from '../../services/safetyDashboard.service'
import { EVENT_SUBJECT_LABELS, RESPONSIBLE_UNIT_LABELS } from '../../utils/eventSubject'
import { SAFETY_ZONES } from '../../data/safetyZones'

interface SafetyFilterBarProps {
  filters: SafetyDashboardFilters
  onChange: (filters: SafetyDashboardFilters) => void
  showTrial?: () => void
}

const selectClass = 'h-7 text-[10px] bg-[#0b0f1a] border border-[#1e2433] rounded px-2 text-foreground min-w-0'

const SOURCE_OPTIONS = [
  'FIXED_CAMERA', 'PTZ_CAMERA', 'DRONE', 'BODY_CAMERA', 'MOBILE', 'RADAR', 'GPS_IVI',
] as const

const STATUS_OPTIONS: ViolationStatus[] = [
  'DETECTED', 'PENDING_VERIFICATION', 'CONFIRMED', 'ASSIGNED',
  'IN_PROGRESS', 'PENDING_RECHECK', 'CLOSED', 'OVERDUE',
]

export function SafetyFilterBar({ filters, onChange, showTrial }: SafetyFilterBarProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const contractors = getContractorOptions(getAllSafetyRecords())
  const scenarios = filters.groupId
    ? getScenariosForGroup(filters.groupId)
    : SAFETY_SCENARIOS

  const set = (patch: Partial<SafetyDashboardFilters>) => onChange({ ...filters, ...patch })

  return (
    <div className="shrink-0 border-b border-[#1e2433]/60 pb-2 mb-2">
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <Filter className="w-3 h-3 text-muted-foreground shrink-0" aria-hidden />

        <select
          value={filters.zoneId ?? ''}
          onChange={e => set({ zoneId: e.target.value || null })}
          className={cn(selectClass, 'max-w-[130px]')}
          aria-label="Khu vực"
        >
          <option value="">Khu vực</option>
          {SAFETY_ZONES.map(z => (
            <option key={z.id} value={z.id}>{z.id.replace('ZONE-', '')} · {z.name}</option>
          ))}
        </select>

        <select
          value={filters.groupId ?? ''}
          onChange={e => set({
            groupId: (e.target.value || null) as SafetyGroupId | null,
            scenarioId: null,
          })}
          className={cn(selectClass, 'max-w-[110px]')}
          aria-label="Nhóm an toàn"
        >
          <option value="">Nhóm an toàn</option>
          {SAFETY_GROUPS.map(g => (
            <option key={g.id} value={g.id}>{g.id} · {g.name}</option>
          ))}
        </select>

        <select
          value={filters.scenarioId ?? ''}
          onChange={e => set({ scenarioId: e.target.value || null })}
          className={cn(selectClass, 'max-w-[160px]')}
          aria-label="Kịch bản"
        >
          <option value="">Kịch bản</option>
          {scenarios.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <select
          value={filters.status ?? 'OPEN'}
          onChange={e => set({ status: (e.target.value || null) as SafetyDashboardFilters['status'] })}
          className={selectClass}
          aria-label="Trạng thái"
        >
          <option value="OPEN">Chưa đóng</option>
          <option value="CLOSED">Đã đóng</option>
          <option value="">Tất cả</option>
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>

        <select
          value={filters.dateRange ?? 'today'}
          onChange={e => set({ dateRange: e.target.value as SafetyDashboardFilters['dateRange'] })}
          className={selectClass}
          aria-label="Thời gian"
        >
          <option value="today">Hôm nay</option>
          <option value="week">7 ngày</option>
          <option value="month">30 ngày</option>
        </select>

        <div className="relative flex-1 min-w-[120px] max-w-[200px]">
          <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={filters.searchQuery ?? ''}
            onChange={e => set({ searchQuery: e.target.value || undefined })}
            placeholder="Tìm kiếm..."
            className={cn(selectClass, 'w-full pl-7 pr-2')}
            aria-label="Tìm kiếm"
          />
        </div>

        <button
          type="button"
          onClick={() => setAdvancedOpen(o => !o)}
          className={cn(
            selectClass, 'inline-flex items-center gap-1 px-2 shrink-0',
            advancedOpen && 'border-primary text-primary',
          )}
        >
          <SlidersHorizontal className="w-3 h-3" />
          Bộ lọc nâng cao
          {advancedOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        <button
          type="button"
          onClick={showTrial}
          className={cn(selectClass, 'inline-flex items-center gap-1 text-muted-foreground shrink-0')}
        >
          <Lock className="w-2.5 h-2.5" />
          Dự án
        </button>
      </div>

      {/* Bộ lọc nâng cao */}
      {advancedOpen && (
        <div className="rounded-lg border border-[#1e2433] bg-[#0a0e17] p-2.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <div>
            <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Đối tượng sự kiện</p>
            <select
              value={filters.eventSubjectType ?? ''}
              onChange={e => set({ eventSubjectType: (e.target.value || null) as EventSubjectType | null })}
              className={cn(selectClass, 'w-full')}
            >
              <option value="">Tất cả</option>
              {(Object.entries(EVENT_SUBJECT_LABELS) as [EventSubjectType, string][]).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Nguồn phát hiện</p>
            <select
              value={filters.deviceType ?? ''}
              onChange={e => set({ deviceType: (e.target.value || null) as SafetyDashboardFilters['deviceType'] })}
              className={cn(selectClass, 'w-full')}
            >
              <option value="">Tất cả</option>
              {SOURCE_OPTIONS.map(d => (
                <option key={d} value={d}>{DEVICE_TYPE_LABELS[d]}</option>
              ))}
            </select>
          </div>

          <div>
            <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Đơn vị chịu trách nhiệm</p>
            <select
              value={filters.responsibleUnit ?? ''}
              onChange={e => set({ responsibleUnit: (e.target.value || null) as ResponsibleUnitType | null })}
              className={cn(selectClass, 'w-full')}
            >
              <option value="">Tất cả</option>
              {(Object.entries(RESPONSIBLE_UNIT_LABELS) as [ResponsibleUnitType, string][]).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
            <select
              value={filters.contractorId ?? ''}
              onChange={e => set({ contractorId: e.target.value || null })}
              className={cn(selectClass, 'w-full mt-1')}
            >
              <option value="">Nhà thầu cụ thể</option>
              {contractors.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Mức cảnh báo</p>
            <select
              value={filters.severity ?? ''}
              onChange={e => set({ severity: (e.target.value || null) as AlertSeverity | null })}
              className={cn(selectClass, 'w-full')}
            >
              <option value="">Tất cả</option>
              <option value="WARNING">Cảnh báo</option>
              <option value="VIOLATION">Vi phạm</option>
              <option value="CRITICAL">Khẩn cấp</option>
            </select>
            <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground mb-1 mt-2">Trạng thái chi tiết</p>
            <select
              value={filters.advancedStatus ?? ''}
              onChange={e => set({ advancedStatus: (e.target.value || null) as ViolationStatus | null })}
              className={cn(selectClass, 'w-full')}
            >
              <option value="">Theo bộ lọc chính</option>
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}
