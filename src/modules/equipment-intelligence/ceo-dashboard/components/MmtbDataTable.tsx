import { useMemo, useState } from 'react'
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel,
  getSortedRowModel, useReactTable, type ColumnDef, type SortingState,
} from '@tanstack/react-table'
import { Search, Download, Filter } from 'lucide-react'
import * as XLSX from 'xlsx'
import { Panel } from '@/components/common/PageLayout/PageLayout'
import { cn } from '@/utils/cn'
import type { EquipmentStatus, MmtbRow } from '../types'

const STATUS_BADGE: Record<EquipmentStatus, string> = {
  Working: 'bg-green-500/15 text-green-400 ring-1 ring-green-500/25',
  Standby: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/25',
  Breakdown: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/25',
  Stored: 'bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/25',
}

const PM_BADGE = {
  overdue: 'bg-red-500/10 text-red-400 border border-red-500/30',
  upcoming: 'bg-amber-500/10 text-amber-400 border border-amber-500/30',
  ok: 'bg-green-500/10 text-green-400 border border-green-500/30',
} as const

function healthColor(score: number) {
  if (score >= 70) return 'text-green-400'
  if (score >= 40) return 'text-amber-400'
  return 'text-red-400'
}

function utilGradient(pct: number): string {
  if (pct >= 70) return 'from-green-500 to-emerald-400'
  if (pct >= 40) return 'from-sky-500 to-cyan-400'
  return 'from-amber-500 to-yellow-400'
}

interface MmtbDataTableProps {
  data: MmtbRow[]
  search: string
  onSearchChange: (v: string) => void
  onRowClick: (row: MmtbRow) => void
}

export function MmtbDataTable({ data, search, onSearchChange, onRowClick }: MmtbDataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })

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
            {s}
          </span>
        )
      },
    },
    {
      accessorKey: 'healthScore',
      header: 'Health Score',
      cell: ({ getValue }) => {
        const v = getValue<number>()
        return (
          <span className={cn('font-bold tabular-nums text-[10px]', healthColor(v))}>
            {v} / 100
          </span>
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
      header: 'Utilization',
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
      accessorKey: 'mtbfHours',
      header: 'MTBF (h)',
      cell: ({ getValue }) => <span className="tabular-nums text-muted-foreground text-[10px]">{getValue<number>()}</span>,
    },
    {
      accessorKey: 'mttrHours',
      header: 'MTTR (h)',
      cell: ({ getValue }) => <span className="tabular-nums text-muted-foreground text-[10px]">{getValue<number>()}</span>,
    },
    {
      accessorKey: 'pmStatusLabel',
      header: 'PM Status',
      cell: ({ row }) => {
        const pm = row.original.pmStatus
        const cls = pm === 'overdue' ? PM_BADGE.overdue : pm === 'upcoming' ? PM_BADGE.upcoming : PM_BADGE.ok
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
      'Trạng thái': r.status,
      'Health Score': r.healthScore,
      'Giờ máy (h)': r.engineHours,
      'Utilization': `${r.utilizationPct}%`,
      'MTBF (h)': r.mtbfHours,
      'MTTR (h)': r.mttrHours,
      'PM Status': r.pmStatusLabel,
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

  return (
    <Panel title="Danh sách Đội máy" noPadding className="h-full min-h-0">
      <div className="flex flex-col h-full min-h-0">
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
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#060b14] border border-[#1e2433] text-[11px] text-muted-foreground hover:text-foreground hover:bg-[#1a2235] hover:border-[#2a3855] transition-colors whitespace-nowrap"
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
          <table className="w-full min-w-[960px] text-[10px]">
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

        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 border-t border-[#1e2433] shrink-0 bg-[#0b0f1a]/40">
          <span className="text-[10px] text-muted-foreground tabular-nums">
            Hiển thị {startRow}–{endRow} trong tổng số {total} máy
          </span>

          <div className="flex items-center gap-1.5">
            {pageNumbers.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => table.setPageIndex(p)}
                className={cn(
                  'min-w-[28px] h-7 rounded-lg text-[10px] font-bold tabular-nums px-1 transition-colors',
                  p === currentPage
                    ? 'bg-primary/20 text-primary border border-primary/30 shadow-[0_0_12px_rgba(34,197,94,0.15)]'
                    : 'text-muted-foreground hover:bg-[#1a2235] hover:text-foreground border border-transparent',
                )}
              >
                {p + 1}
              </button>
            ))}

            <select
              value={pagination.pageSize}
              onChange={e => setPagination(prev => ({ ...prev, pageSize: Number(e.target.value), pageIndex: 0 }))}
              className="ml-2 px-2 py-1 rounded-lg bg-[#060b14] border border-[#1e2433] text-[10px] text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/40"
            >
              {[10, 20, 50].map(n => <option key={n} value={n}>{n} / trang</option>)}
            </select>
          </div>
        </div>
      </div>
    </Panel>
  )
}
