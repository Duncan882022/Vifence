import { useMemo, useState } from 'react'
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel,
  getSortedRowModel, useReactTable, type ColumnDef, type SortingState,
} from '@tanstack/react-table'
import { Search, Download, Filter, ChevronLeft, ChevronRight, Maximize2, Minimize2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import { Panel } from '@/components/common/PageLayout/PageLayout'
import { cn } from '@/utils/cn'
import type { EquipmentStatus, MmtbRow } from '../types'

const STATUS_BADGE: Record<EquipmentStatus, string> = {
  Working:   'bg-green-500/15 text-green-400 ring-1 ring-green-500/25',
  Standby:   'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/25',
  Breakdown: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/25',
  Stored:    'bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/25',
}

const STATUS_VI: Record<EquipmentStatus, string> = {
  Working:   'Đang hoạt động',
  Standby:   'Chờ việc',
  Breakdown: 'Hỏng hóc',
  Stored:    'Lưu kho',
}

const PM_BADGE: Record<'on_time' | 'upcoming' | 'overdue', string> = {
  overdue:  'bg-red-500/10 text-red-400 border border-red-500/30',
  upcoming: 'bg-amber-500/10 text-amber-400 border border-amber-500/30',
  on_time:  'bg-green-500/10 text-green-400 border border-green-500/30',
} as const


function utilGradient(pct: number): string {
  if (pct >= 70) return 'from-green-500 to-emerald-400'
  if (pct >= 40) return 'from-sky-500 to-cyan-400'
  return 'from-amber-500 to-yellow-400'
}

function availColor(pct: number): string {
  if (pct >= 70) return 'text-green-400'
  if (pct >= 50) return 'text-amber-400'
  return 'text-red-400'
}

function availBarColor(pct: number): string {
  if (pct >= 70) return 'bg-green-500'
  if (pct >= 50) return 'bg-amber-400'
  return 'bg-red-500'
}

interface InsightChip {
  label: string
  count: number
  dotColor: string
  textColor: string
}

interface MmtbDataTableProps {
  data: MmtbRow[]
  search: string
  onSearchChange: (v: string) => void
  onRowClick: (row: MmtbRow) => void
  expanded?: boolean
  onToggle?: () => void
}

export function MmtbDataTable({ data, search, onSearchChange, onRowClick, expanded = false, onToggle }: MmtbDataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })

  const insight = useMemo<InsightChip[]>(() => {
    const working   = data.filter(d => d.status === 'Working').length
    const standby   = data.filter(d => d.status === 'Standby').length
    const breakdown = data.filter(d => d.status === 'Breakdown').length
    const stored    = data.filter(d => d.status === 'Stored').length
    return [
      { label: 'Đang chạy',      count: working,   dotColor: 'bg-green-400', textColor: 'text-green-400' },
      { label: 'Chờ việc',       count: standby,   dotColor: 'bg-amber-400', textColor: 'text-amber-400' },
      { label: 'Dừng kỹ thuật',  count: breakdown, dotColor: 'bg-red-400',   textColor: 'text-red-400'   },
      { label: 'Mất tín hiệu',   count: stored,    dotColor: 'bg-sky-400',   textColor: 'text-sky-400'   },
    ]
  }, [data])

  const columns = useMemo<ColumnDef<MmtbRow>[]>(() => [
    {
      accessorKey: 'machineCode',
      header: 'Mã máy',
      cell: ({ getValue }) => (
        <span className="font-bold text-primary hover:text-primary/80 transition-colors">
          {getValue<string>()}
        </span>
      ),
    },
    {
      accessorKey: 'equipmentType',
      header: 'Loại thiết bị',
      cell: ({ getValue }) => <span className="text-foreground">{getValue<string>()}</span>,
    },
    {
      accessorKey: 'projectLocation',
      header: 'Dự án / Vị trí',
      cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Trạng thái',
      cell: ({ getValue }) => {
        const s = getValue<EquipmentStatus>()
        return (
          <span className={cn('inline-flex px-2 py-0.5 rounded-md text-[9px] font-bold', STATUS_BADGE[s])}>
            {STATUS_VI[s]}
          </span>
        )
      },
    },
    {
      accessorKey: 'healthScore',
      header: 'Sức khỏe',
      cell: ({ getValue }) => {
        const v = getValue<number>()
        const r = 10
        const circ = 2 * Math.PI * r
        const dash = circ * (v / 100)
        const colorMap = v >= 70 ? '#4ade80' : v >= 40 ? '#fbbf24' : '#f87171'
        return (
          <div className="flex items-center gap-1.5">
            <svg width="28" height="28" viewBox="0 0 28 28" className="shrink-0 -rotate-90">
              <circle cx="14" cy="14" r={r} fill="none" stroke="#1e2433" strokeWidth="3" />
              <circle
                cx="14" cy="14" r={r}
                fill="none"
                stroke={colorMap}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${dash} ${circ}`}
                style={{ filter: `drop-shadow(0 0 3px ${colorMap}88)` }}
              />
            </svg>
            <span className="font-bold tabular-nums text-[10px]" style={{ color: colorMap }}>
              {v}%
            </span>
          </div>
        )
      },
    },
    {
      accessorKey: 'engineHours',
      header: 'Giờ máy (h)',
      cell: ({ getValue }) => (
        <span className="tabular-nums text-foreground font-medium">
          {getValue<number>().toLocaleString('vi-VN')}
        </span>
      ),
    },
    {
      accessorKey: 'utilizationPct',
      header: 'Sử dụng',
      cell: ({ getValue }) => {
        const v = getValue<number>()
        return (
          <div className="flex items-center gap-2 min-w-[90px]">
            <div className="flex-1 h-2 rounded-full bg-[#1e2433] overflow-hidden">
              <div
                className={cn('h-full rounded-full bg-gradient-to-r', utilGradient(v))}
                style={{ width: `${v}%` }}
              />
            </div>
            <span className={cn(
              'text-[10px] tabular-nums w-8 text-right font-bold',
              v >= 70 ? 'text-green-400' : v >= 40 ? 'text-sky-400' : 'text-amber-400',
            )}>
              {v}%
            </span>
          </div>
        )
      },
    },
    {
      accessorKey: 'availabilityPct',
      header: 'Khả dụng',
      cell: ({ getValue }) => {
        const v = getValue<number | undefined>() ?? 0
        return (
          <div className="flex items-center gap-2 min-w-[90px]">
            <div className="flex-1 h-2 rounded-full bg-[#1e2433] overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', availBarColor(v))}
                style={{ width: `${Math.min(v, 100)}%` }}
              />
            </div>
            <span className={cn('text-[10px] tabular-nums w-10 text-right font-bold', availColor(v))}>
              {v.toFixed(1)}%
            </span>
          </div>
        )
      },
    },
    {
      accessorKey: 'mtbfHours',
      header: 'Giờ TB không hỏng (h)',
      cell: ({ getValue }) => <span className="tabular-nums text-muted-foreground text-[10px]">{getValue<number>()}h</span>,
    },
    {
      accessorKey: 'mttrHours',
      header: 'Giờ sửa TB',
      cell: ({ getValue }) => <span className="tabular-nums text-muted-foreground text-[10px]">{getValue<number>()}h</span>,
    },
    {
      accessorKey: 'pmStatusLabel',
      header: 'Tình trạng BĐ',
      cell: ({ row }) => {
        const pm = row.original.pmStatus
        const cls = PM_BADGE[pm]
        return (
          <span className={cn('inline-flex px-2 py-0.5 rounded-md text-[9px] font-semibold', cls)}>
            {row.original.pmStatusLabel}
          </span>
        )
      },
    },
  ], [])

  const table = useReactTable({
    data,
    columns,
    state: { sorting, pagination, globalFilter: search },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: 'includesString',
  })

  const pageCount = table.getPageCount() || 1
  const currentPage = pagination.pageIndex
  const total = table.getFilteredRowModel().rows.length
  const startRow = total === 0 ? 0 : currentPage * pagination.pageSize + 1
  const endRow = Math.min(startRow + pagination.pageSize - 1, total)

  const exportExcel = () => {
    const rows = data.map(r => ({
      'Mã máy': r.machineCode,
      'Loại thiết bị': r.equipmentType,
      'Dự án / Vị trí': r.projectLocation,
      'Trạng thái': STATUS_VI[r.status],
      'Sức khỏe (%)': r.healthScore,
      'Giờ máy (h)': r.engineHours,
      'Sử dụng (%)': `${r.utilizationPct}%`,
      'Khả dụng (%)': r.availabilityPct != null ? `${r.availabilityPct.toFixed(1)}%` : '',
      'Giờ TB không hỏng (h)': r.mtbfHours,
      'Giờ sửa TB (h)': r.mttrHours,
      'Tình trạng BĐ': r.pmStatusLabel,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'MMTB')
    XLSX.writeFile(wb, 'mmtb-danh-sach.xlsx')
  }

  const pageNumbers = useMemo(() => {
    const max = 5
    if (pageCount <= max) return Array.from({ length: pageCount }, (_, i) => i)
    const start = Math.max(0, Math.min(currentPage - 2, pageCount - max))
    return Array.from({ length: max }, (_, i) => start + i)
  }, [pageCount, currentPage])

  /** Insight summary bar — always visible in both open and collapsed states */
  const insightBar = (
    <div className="flex items-center gap-1 flex-wrap px-3 py-1.5 bg-[#060b14]/60 border-b border-[#1e2433] shrink-0">
      {insight.map(chip => (
        <div
          key={chip.label}
          className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#0d1117] border border-[#1e2433]"
        >
          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', chip.dotColor)} />
          <span className="text-[9px] text-muted-foreground">{chip.label}</span>
          <span className={cn('text-[9px] font-bold tabular-nums', chip.textColor)}>{chip.count}</span>
        </div>
      ))}
    </div>
  )

  const headerRight = onToggle ? (
    <button
      type="button"
      onClick={onToggle}
      className="p-1 rounded hover:bg-[#1a2235] text-muted-foreground hover:text-foreground transition-colors"
      aria-label={expanded ? 'Thu nhỏ danh sách đội máy' : 'Phóng to danh sách đội máy'}
      title={expanded ? 'Thu nhỏ' : 'Phóng to'}
    >
      {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
    </button>
  ) : undefined

  return (
    <Panel title="Danh sách Đội máy" noPadding className="h-full min-h-0" headerRight={headerRight}>
      <div className="flex flex-col h-full min-h-0">
        {insightBar}

        <div className="flex flex-col sm:flex-row gap-2 px-3 py-2.5 border-b border-[#1e2433] shrink-0 bg-[#0b0f1a]/40">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
            <input
              placeholder="Tìm kiếm máy, dự án, vị trí..."
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#060b14] border border-[#1e2433] text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/30 transition-colors"
            />
          </div>
          <button
            type="button"
            title="Bộ lọc nâng cao — chưa triển khai"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#060b14] border border-[#1e2433] text-[11px] text-muted-foreground hover:text-foreground hover:bg-[#1a2235] hover:border-[#2a3855] transition-colors whitespace-nowrap opacity-60 cursor-not-allowed"
            disabled
          >
            <Filter className="w-3.5 h-3.5" />
            Bộ lọc
          </button>
          <button
            type="button"
            onClick={exportExcel}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90 shadow-[0_2px_12px_rgba(34,197,94,0.25)] transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Xuất Excel
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
          <table className="w-full min-w-[1060px] text-[10px]">
            <thead className="sticky top-0 z-10">
              {table.getHeaderGroups().map(hg => (
                <tr key={hg.id} className="bg-[#0b0f1a]/95 backdrop-blur-sm border-b border-[#1e2433]">
                  {hg.headers.map(h => (
                    <th
                      key={h.id}
                      className="px-3 py-2.5 text-left whitespace-nowrap cursor-pointer hover:text-foreground transition-colors select-none text-[9px] font-bold text-muted-foreground uppercase tracking-wider"
                      onClick={h.column.getToggleSortingHandler()}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {h.column.getIsSorted() === 'asc' && ' ↑'}
                      {h.column.getIsSorted() === 'desc' && ' ↓'}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row, i) => (
                <tr
                  key={row.id}
                  onClick={() => onRowClick(row.original)}
                  className={cn(
                    'cursor-pointer border-b border-[#1e2433]/50 transition-colors',
                    i % 2 === 0 ? 'bg-[#0d1117]/40' : 'bg-transparent',
                    'hover:bg-[#1a2235]/60',
                  )}
                >
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-3 py-2.5 whitespace-nowrap">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-[#1e2433] shrink-0 bg-[#0b0f1a]/40">
          <span className="text-[10px] text-muted-foreground/70 tabular-nums whitespace-nowrap">
            Hiển thị <span className="text-foreground/80 font-medium">{startRow}–{endRow}</span> / <span className="text-foreground/80 font-medium">{total}</span> thiết bị
          </span>

          <div className="flex items-center gap-1">
            <select
              value={pagination.pageSize}
              onChange={e => setPagination(prev => ({ ...prev, pageSize: Number(e.target.value), pageIndex: 0 }))}
              className="mr-1.5 px-2 py-1 rounded-lg bg-[#060b14] border border-[#1e2433] text-[10px] text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/40 appearance-none"
            >
              {[10, 20, 50].map(n => <option key={n} value={n}>{n} / trang</option>)}
            </select>

            <button
              type="button"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="flex items-center justify-center w-7 h-7 rounded-lg border border-[#1e2433] text-muted-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:enabled:bg-[#1a2235] hover:enabled:text-foreground hover:enabled:border-[#2a3855]"
              aria-label="Trang trước"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            {pageNumbers.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => table.setPageIndex(p)}
                className={cn(
                  'min-w-[28px] h-7 rounded-lg text-[10px] font-bold tabular-nums px-1.5 transition-colors',
                  p === currentPage
                    ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40 shadow-[0_0_10px_rgba(14,165,233,0.15)]'
                    : 'text-muted-foreground hover:bg-[#1a2235] hover:text-foreground border border-transparent hover:border-[#1e2433]',
                )}
              >
                {p + 1}
              </button>
            ))}

            <button
              type="button"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="flex items-center justify-center w-7 h-7 rounded-lg border border-[#1e2433] text-muted-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:enabled:bg-[#1a2235] hover:enabled:text-foreground hover:enabled:border-[#2a3855]"
              aria-label="Trang sau"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </Panel>
  )
}
