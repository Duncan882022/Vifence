import { useMemo, useState } from 'react'
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel,
  getSortedRowModel, useReactTable, type ColumnDef, type SortingState,
} from '@tanstack/react-table'
import { Search, Download, Filter } from 'lucide-react'
import * as XLSX from 'xlsx'
import { Input } from '@/components/ui/input'
import { GlassCard } from './GlassCard'
import { cn } from '@/utils/cn'
import type { EquipmentStatus, MmtbRow } from '../types'

const STATUS_BADGE: Record<EquipmentStatus, string> = {
  Working: 'ecc-badge-working',
  Standby: 'ecc-badge-standby',
  Breakdown: 'ecc-badge-breakdown',
  Stored: 'ecc-badge-stored',
}

function healthColor(score: number) {
  if (score >= 70) return 'text-emerald-400'
  if (score >= 40) return 'text-amber-400'
  return 'text-red-400'
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
      header: 'MÃ MÁY',
      cell: ({ getValue }) => (
        <span className="font-semibold text-sky-300 hover:text-sky-200 transition-colors">
          {getValue<string>()}
        </span>
      ),
    },
    {
      accessorKey: 'equipmentType',
      header: 'LOẠI THIẾT BỊ',
      cell: ({ getValue }) => <span className="text-slate-300">{getValue<string>()}</span>,
    },
    {
      accessorKey: 'projectLocation',
      header: 'DỰ ÁN / VỊ TRÍ',
      cell: ({ getValue }) => <span className="text-slate-400">{getValue<string>()}</span>,
    },
    {
      accessorKey: 'status',
      header: 'TRẠNG THÁI',
      cell: ({ getValue }) => {
        const s = getValue<EquipmentStatus>()
        return (
          <span className={cn('inline-flex px-2 py-0.5 rounded text-[10px] font-semibold', STATUS_BADGE[s])}>
            {s}
          </span>
        )
      },
    },
    {
      accessorKey: 'healthScore',
      header: 'HEALTH SCORE',
      cell: ({ getValue }) => {
        const v = getValue<number>()
        return (
          <span className={cn('font-bold tabular-nums text-[11px]', healthColor(v))}>
            {v} / 100
          </span>
        )
      },
    },
    {
      accessorKey: 'engineHours',
      header: 'GIỜ MÁY (h)',
      cell: ({ getValue }) => (
        <span className="tabular-nums text-slate-300">
          {getValue<number>().toLocaleString('vi-VN')}
        </span>
      ),
    },
    {
      accessorKey: 'utilizationPct',
      header: 'UTILIZATION',
      cell: ({ getValue }) => {
        const v = getValue<number>()
        return (
          <div className="flex items-center gap-2 min-w-[80px]">
            <div className="flex-1 h-1 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${v}%` }} />
            </div>
            <span className="text-[10px] tabular-nums text-emerald-400 w-7 text-right">{v}%</span>
          </div>
        )
      },
    },
    {
      accessorKey: 'mtbfHours',
      header: 'MTBF (h)',
      cell: ({ getValue }) => <span className="tabular-nums text-slate-400 text-[11px]">{getValue<number>()}</span>,
    },
    {
      accessorKey: 'mttrHours',
      header: 'MTTR (h)',
      cell: ({ getValue }) => <span className="tabular-nums text-slate-400 text-[11px]">{getValue<number>()}</span>,
    },
    {
      accessorKey: 'pmStatusLabel',
      header: 'PM STATUS',
      cell: ({ row }) => {
        const pm = row.original.pmStatus
        const cls = pm === 'overdue'
          ? 'ecc-pm-outline-red'
          : pm === 'upcoming'
            ? 'ecc-pm-outline-amber'
            : 'ecc-pm-outline-green'
        return (
          <span className={cn('inline-flex px-2 py-0.5 rounded text-[9px] font-medium', cls)}>
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
  const startRow = currentPage * pagination.pageSize + 1
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
    <GlassCard title="DANH SÁCH MMTB" className="overflow-hidden" delay={0.4} noPadding>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2 px-4 pt-1 pb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" strokeWidth={1.75} />
          <Input
            placeholder="Tìm kiếm máy, dự án, vị trí..."
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            className="pl-9 h-9 bg-slate-900/60 border-white/10 text-[12px] placeholder:text-slate-600 focus:border-emerald-500/40"
          />
        </div>
        <button
          type="button"
          className="ecc-control flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors whitespace-nowrap"
        >
          <Filter className="w-3.5 h-3.5" strokeWidth={1.75} />
          Bộ lọc
        </button>
        <button
          type="button"
          onClick={exportExcel}
          className="ecc-control flex items-center gap-2 px-3 py-2 hover:bg-emerald-500/10 hover:border-emerald-500/30 hover:text-emerald-400 transition-colors whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
          Xuất excel
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border-t border-white/[0.06]">
        <table className="w-full min-w-[960px] text-[11px]">
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id} className="ecc-table-head border-b border-white/[0.06]">
                {hg.headers.map(h => (
                  <th
                    key={h.id}
                    className="px-3 py-2.5 text-left whitespace-nowrap cursor-pointer hover:text-slate-400 transition-colors select-none"
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
            {table.getRowModel().rows.map((row, idx) => (
              <tr
                key={row.id}
                onClick={() => onRowClick(row.original)}
                className={cn(
                  'ecc-table-row border-b border-white/[0.04] cursor-pointer transition-colors',
                  idx % 2 === 0 ? '' : 'bg-white/[0.015]',
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

      {/* Pagination footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-white/[0.06]">
        <span className="text-[11px] text-slate-500">
          Hiển thị {startRow} - {endRow} trong tổng số {total} máy
        </span>

        <div className="flex items-center gap-1.5">
          {pageNumbers.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => table.setPageIndex(p)}
              className={cn(
                'min-w-[28px] h-7 rounded text-[11px] font-semibold tabular-nums px-1 transition-colors',
                p === currentPage
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-500 hover:bg-white/5 hover:text-slate-300',
              )}
            >
              {p + 1}
            </button>
          ))}

          <div className="ml-2 flex items-center gap-1.5">
            <select
              value={pagination.pageSize}
              onChange={e => setPagination(p => ({ ...p, pageSize: Number(e.target.value), pageIndex: 0 }))}
              className="ecc-control px-2 py-1 text-[10px] text-slate-300 cursor-pointer"
            >
              {[10, 20, 50].map(n => <option key={n} value={n}>{n} / trang</option>)}
            </select>
          </div>
        </div>
      </div>
    </GlassCard>
  )
}
