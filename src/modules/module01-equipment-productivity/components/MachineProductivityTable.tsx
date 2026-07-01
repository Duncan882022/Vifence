import { useMemo, useState } from 'react'
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel,
  getSortedRowModel, useReactTable, type ColumnDef, type SortingState,
} from '@tanstack/react-table'
import { Search, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import * as XLSX from 'xlsx'
import { Panel } from '@/components/common/PageLayout/PageLayout'
import { cn } from '@/utils/cn'
import type { ProductivityMachine, MachineStatus, DispatchStatus } from '../types'

const STATUS_BADGE: Record<MachineStatus, string> = {
  Working:   'bg-green-500/15 text-green-400 ring-1 ring-green-500/25',
  Standby:   'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/25',
  Breakdown: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/25',
}

const DISPATCH_BADGE: Record<DispatchStatus, string> = {
  'On-time': 'bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/25',
  'Delayed': 'bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/25',
  'Pending': 'bg-slate-500/15 text-slate-400 ring-1 ring-slate-500/25',
}

const STATUS_LABELS: Record<MachineStatus, string> = {
  Working: 'Hoạt động',
  Standby: 'Chờ việc',
  Breakdown: 'Hỏng máy',
}

const DISPATCH_LABELS: Record<DispatchStatus, string> = {
  'On-time': 'Đúng hạn',
  'Delayed': 'Trễ',
  'Pending': 'Chờ',
}

function utilGradient(pct: number): string {
  if (pct >= 70) return 'from-green-500 to-emerald-400'
  if (pct >= 45) return 'from-sky-500 to-cyan-400'
  return 'from-amber-500 to-yellow-400'
}

interface Props {
  data: ProductivityMachine[]
  search: string
  onSearchChange: (v: string) => void
}

export function MachineProductivityTable({ data, search, onSearchChange }: Props) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })

  const columns = useMemo<ColumnDef<ProductivityMachine>[]>(() => [
    {
      accessorKey: 'machineCode',
      header: 'Mã máy',
      cell: ({ getValue }) => (
        <span className="font-bold text-primary hover:text-primary/80 transition-colors cursor-pointer">
          {getValue<string>()}
        </span>
      ),
    },
    {
      accessorKey: 'equipmentType',
      header: 'Loại thiết bị',
      cell: ({ getValue }) => <span className="text-foreground text-[10px]">{getValue<string>()}</span>,
    },
    {
      accessorKey: 'projectLocation',
      header: 'Dự án / Vị trí',
      cell: ({ getValue }) => <span className="text-muted-foreground text-[10px]">{getValue<string>()}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Trạng thái',
      cell: ({ getValue }) => {
        const s = getValue<MachineStatus>()
        return (
          <span className={cn('inline-flex px-2 py-0.5 rounded-md text-[9px] font-bold', STATUS_BADGE[s])}>
            {STATUS_LABELS[s]}
          </span>
        )
      },
    },
    {
      accessorKey: 'workingHours',
      header: 'Giờ hoạt động (h)',
      cell: ({ getValue }) => (
        <span className="tabular-nums text-green-400 font-semibold text-[10px]">
          {getValue<number>().toLocaleString('vi-VN')}
        </span>
      ),
    },
    {
      accessorKey: 'idleHours',
      header: 'Giờ chờ việc (h)',
      cell: ({ getValue }) => (
        <span className="tabular-nums text-amber-400/80 text-[10px]">
          {getValue<number>().toLocaleString('vi-VN')}
        </span>
      ),
    },
    {
      accessorKey: 'downtimeHours',
      header: 'Giờ dừng máy (h)',
      cell: ({ getValue }) => (
        <span className="tabular-nums text-red-400/80 text-[10px]">
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
              v >= 70 ? 'text-green-400' : v >= 45 ? 'text-sky-400' : 'text-amber-400',
            )}>
              {v}%
            </span>
          </div>
        )
      },
    },
    {
      accessorKey: 'outputPerHour',
      header: 'Năng suất (m/giờ)',
      cell: ({ getValue }) => (
        <span className="tabular-nums text-violet-400 font-semibold text-[10px]">
          {getValue<number>().toFixed(1)}
        </span>
      ),
    },
    {
      accessorKey: 'fuelLitresPerHour',
      header: 'Nhiên liệu (lít/giờ)',
      cell: ({ getValue }) => (
        <span className="tabular-nums text-amber-300/90 text-[10px]">
          {getValue<number>().toFixed(1)}
        </span>
      ),
    },
    {
      accessorKey: 'fuelCostVndPerHour',
      header: 'Chi phí NL (K/giờ)',
      cell: ({ getValue }) => (
        <span className="tabular-nums text-muted-foreground text-[10px]">
          {(getValue<number>() / 1000).toFixed(0)}K
        </span>
      ),
    },
    {
      accessorKey: 'dispatchStatus',
      header: 'Dispatch',
      cell: ({ getValue }) => {
        const d = getValue<DispatchStatus>()
        return (
          <span className={cn('inline-flex px-2 py-0.5 rounded-md text-[9px] font-semibold', DISPATCH_BADGE[d])}>
            {DISPATCH_LABELS[d]}
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
      'Trạng thái': STATUS_LABELS[r.status],
      'Giờ hoạt động (h)': r.workingHours,
      'Giờ chờ việc (h)': r.idleHours,
      'Giờ dừng máy (h)': r.downtimeHours,
      'Utilization (%)': r.utilizationPct,
      'Năng suất (m/giờ)': r.outputPerHour,
      'Nhiên liệu (lít/giờ)': r.fuelLitresPerHour,
      'Chi phí NL (VND/giờ)': r.fuelCostVndPerHour,
      'Dispatch': DISPATCH_LABELS[r.dispatchStatus],
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Năng suất máy')
    XLSX.writeFile(wb, 'nang-suat-thiet-bi.xlsx')
  }

  const pageNumbers = useMemo(() => {
    const max = 5
    if (pageCount <= max) return Array.from({ length: pageCount }, (_, i) => i)
    const start = Math.max(0, Math.min(currentPage - 2, pageCount - max))
    return Array.from({ length: max }, (_, i) => start + i)
  }, [pageCount, currentPage])

  return (
    <Panel title="Danh sách Thiết bị — Năng suất vận hành" noPadding className="h-full min-h-0">
      <div className="flex flex-col h-full min-h-0">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-2 px-3 py-2.5 border-b border-[#1e2433] shrink-0 bg-[#0b0f1a]/40">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
            <input
              placeholder="Tìm kiếm máy, dự án, loại thiết bị..."
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#060b14] border border-[#1e2433] text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/30 transition-colors"
            />
          </div>
          <button
            type="button"
            onClick={exportExcel}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90 shadow-[0_2px_12px_rgba(34,197,94,0.25)] transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Xuất Excel
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
          <table className="w-full min-w-[1100px] text-[10px]">
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
                  className={cn(
                    'border-b border-[#1e2433]/50 transition-colors cursor-pointer',
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

        {/* Pagination */}
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
              className="flex items-center justify-center w-7 h-7 rounded-lg border border-[#1e2433] text-muted-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:enabled:bg-[#1a2235] hover:enabled:text-foreground"
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
                    ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
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
              className="flex items-center justify-center w-7 h-7 rounded-lg border border-[#1e2433] text-muted-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:enabled:bg-[#1a2235] hover:enabled:text-foreground"
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
