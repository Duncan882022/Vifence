import { useMemo, useState } from 'react'
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel,
  getSortedRowModel, useReactTable, type ColumnDef, type SortingState,
} from '@tanstack/react-table'
import { Search, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import * as XLSX from 'xlsx'
import { motion } from 'framer-motion'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { GlassCard } from './GlassCard'
import { cn } from '@/utils/cn'
import type { EquipmentStatus, MmtbRow } from '../types'

const STATUS_STYLE: Record<EquipmentStatus, string> = {
  Working: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  Standby: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  Breakdown: 'bg-red-500/15 text-red-300 border-red-500/30',
  Stored: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
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
    { accessorKey: 'machineCode', header: 'Mã máy', cell: ({ getValue }) => <span className="font-semibold text-sky-300">{getValue<string>()}</span> },
    { accessorKey: 'equipmentType', header: 'Loại thiết bị' },
    { accessorKey: 'projectLocation', header: 'Dự án / Vị trí' },
    {
      accessorKey: 'status',
      header: 'Trạng thái',
      cell: ({ getValue }) => {
        const s = getValue<EquipmentStatus>()
        return <span className={cn('px-2 py-0.5 rounded-md border text-[10px] font-semibold', STATUS_STYLE[s])}>{s}</span>
      },
    },
    {
      accessorKey: 'healthScore',
      header: 'Health Score',
      cell: ({ getValue }) => {
        const v = getValue<number>()
        return <span className={cn('font-bold tabular-nums', healthColor(v))}>{v}/100</span>
      },
    },
    { accessorKey: 'engineHours', header: 'Giờ máy (h)', cell: ({ getValue }) => getValue<number>().toLocaleString('vi-VN') },
    {
      accessorKey: 'utilizationPct',
      header: 'Utilization',
      cell: ({ getValue }) => {
        const v = getValue<number>()
        return (
          <div className="flex items-center gap-2 min-w-[80px]">
            <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-emerald-500/70 rounded-full" style={{ width: `${v}%` }} />
            </div>
            <span className="text-[10px] tabular-nums text-slate-400">{v}%</span>
          </div>
        )
      },
    },
    { accessorKey: 'mtbfHours', header: 'MTBF (h)' },
    { accessorKey: 'mttrHours', header: 'MTTR (h)' },
    { accessorKey: 'mttfHours', header: 'MTTF (h)', cell: ({ getValue }) => getValue<number>().toLocaleString('vi-VN') },
    {
      accessorKey: 'pmStatusLabel',
      header: 'PM Status',
      cell: ({ row }) => {
        const pm = row.original.pmStatus
        const cls = pm === 'overdue' ? 'text-red-400 border-red-500/30' : pm === 'upcoming' ? 'text-amber-400 border-amber-500/30' : 'text-emerald-400 border-emerald-500/30'
        return <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded border border-current/30', cls)}>{row.original.pmStatusLabel}</span>
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
      'MTTF (h)': r.mttfHours,
      'PM Status': r.pmStatusLabel,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'MMTB')
    XLSX.writeFile(wb, 'mmtb-danh-sach.xlsx')
  }

  return (
    <GlassCard title="Danh sách MMTB" className="overflow-hidden" delay={0.2}>
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <Input
            placeholder="Tìm mã máy, loại thiết bị, dự án..."
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={exportExcel}>
          <Download className="w-3.5 h-3.5" />
          Xuất Excel
        </Button>
      </div>

      <div className="overflow-x-auto -mx-1 rounded-lg border border-white/10">
        <table className="w-full min-w-[900px] text-[11px]">
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id} className="border-b border-white/10 bg-white/[0.03]">
                {hg.headers.map(h => (
                  <th
                    key={h.id}
                    className="px-3 py-2.5 text-left text-[9px] font-bold uppercase tracking-wider text-slate-500 cursor-pointer hover:text-slate-300 whitespace-nowrap"
                    onClick={h.column.getToggleSortingHandler()}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <motion.tr
                key={row.id}
                layout
                onClick={() => onRowClick(row.original)}
                className="border-b border-white/5 hover:bg-white/[0.04] cursor-pointer transition-colors"
              >
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="px-3 py-2.5 text-slate-300 whitespace-nowrap">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 text-[10px] text-slate-500">
        <span>{data.length} máy · trang {pagination.pageIndex + 1}/{table.getPageCount() || 1}</span>
        <div className="flex items-center gap-2">
          <select
            value={pagination.pageSize}
            onChange={e => setPagination(p => ({ ...p, pageSize: Number(e.target.value), pageIndex: 0 }))}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-slate-300"
          >
            {[10, 20, 50].map(n => <option key={n} value={n}>{n} / trang</option>)}
          </select>
          <Button variant="ghost" size="icon" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </GlassCard>
  )
}
