import { useMemo, useState } from 'react'
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel,
  getSortedRowModel, useReactTable, type ColumnDef, type SortingState,
} from '@tanstack/react-table'
import { AlertTriangle, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { Panel } from '@/components/common/PageLayout/PageLayout'
import { cn } from '@/utils/cn'
import type { Machine, MachineStatus, DispatchStatus, Project, Worksite, PileAssignment } from '../types'

const STATUS_BADGE: Record<MachineStatus, string> = {
  working:   'bg-green-500/15 text-green-400 ring-1 ring-green-500/25',
  idle:      'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/25',
  breakdown: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/25',
  stored:    'bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/25',
}

const STATUS_LABELS: Record<MachineStatus, string> = {
  working:   'Đang hoạt động',
  idle:      'Chờ việc',
  breakdown: 'Hỏng hóc',
  stored:    'Lưu kho',
}

const DISPATCH_BADGE: Record<DispatchStatus, string> = {
  'on-time': 'bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/25',
  'delayed': 'bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/25',
  'pending': 'bg-slate-500/15 text-slate-400 ring-1 ring-slate-500/25',
}

const DISPATCH_LABELS: Record<DispatchStatus, string> = {
  'on-time': 'Đúng hạn',
  'delayed': 'Trễ',
  'pending': 'Chờ',
}

function utilGradient(p: number): string {
  if (p >= 70) return 'from-green-500 to-emerald-400'
  if (p >= 45) return 'from-sky-500 to-cyan-400'
  return 'from-amber-500 to-yellow-400'
}

interface RowData extends Machine {
  projectCode: string
  worksiteCode: string
  currentPileCode: string
  pileActualH: number | undefined
  pilePlannedH: number | undefined
  fuelOver: boolean
}

interface Props {
  machines: Machine[]
  projects: Project[]
  worksites: Worksite[]
  piles: PileAssignment[]
}

export function MachineProductivityTable({ machines, projects, worksites, piles }: Props) {
  const [search, setSearch] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })

  const projectMap = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects])
  const worksiteMap = useMemo(() => new Map(worksites.map(w => [w.id, w])), [worksites])
  const pileMap = useMemo(() => new Map(piles.map(p => [p.id, p])), [piles])
  const machinePileMap = useMemo(() => {
    const m = new Map<string, PileAssignment>()
    for (const pile of piles) {
      if (!m.has(pile.machineId)) m.set(pile.machineId, pile)
    }
    return m
  }, [piles])

  const data = useMemo<RowData[]>(() => machines.map(m => {
    const proj = projectMap.get(m.projectId)
    const ws = worksiteMap.get(m.worksiteId)
    const currentPileId = m.currentPileId
    const currentPile = currentPileId ? pileMap.get(currentPileId) : machinePileMap.get(m.id)
    return {
      ...m,
      projectCode: proj?.code ?? m.projectId,
      worksiteCode: ws?.code ?? m.worksiteId,
      currentPileCode: currentPile?.pileCode ?? '—',
      pileActualH: currentPile?.actualDurationH,
      pilePlannedH: currentPile?.plannedDurationH,
      fuelOver: m.fuelLitresPerHour > m.fuelBaselineLitresPerHour,
    }
  }), [machines, projectMap, worksiteMap, pileMap, machinePileMap])

  const columns = useMemo<ColumnDef<RowData>[]>(() => [
    {
      accessorKey: 'code', header: 'Mã máy',
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          {(row.original.fuelOver || row.original.currentPileCode === 'P-083' || row.original.currentPileCode === 'P-084') && (
            <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
          )}
          <span className="font-bold text-primary text-[10px] hover:text-primary/80 cursor-pointer">
            {row.original.code}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'type', header: 'Loại thiết bị',
      cell: ({ getValue }) => <span className="text-foreground text-[10px]">{getValue<string>()}</span>,
    },
    {
      id: 'project', header: 'Dự án / Khu',
      accessorFn: (row) => `${row.projectCode} / ${row.worksiteCode}`,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-[10px]">
          <span className="text-sky-400 font-semibold">{row.original.projectCode}</span>
          {' / '}
          {row.original.worksiteCode}
        </span>
      ),
    },
    {
      accessorKey: 'status', header: 'Trạng thái',
      cell: ({ getValue }) => {
        const s = getValue<MachineStatus>()
        return <span className={cn('inline-flex px-2 py-0.5 rounded-md text-[9px] font-bold', STATUS_BADGE[s])}>{STATUS_LABELS[s]}</span>
      },
    },
    {
      accessorKey: 'currentPileCode', header: 'Cọc đang thi công',
      cell: ({ getValue }) => {
        const v = getValue<string>()
        return (
          <span className={cn('text-[10px] font-mono', v === '—' ? 'text-muted-foreground/40' : 'text-violet-400 font-semibold')}>
            {v}
          </span>
        )
      },
    },
    {
      id: 'pileKpi', header: 'KPI cọc',
      accessorFn: (row) => row.pileActualH ?? 0,
      cell: ({ row }) => {
        const actual = row.original.pileActualH
        const planned = row.original.pilePlannedH
        if (!planned) return <span className="text-muted-foreground/40 text-[10px]">—</span>
        const ratio = actual !== undefined ? actual / planned : null
        const over = ratio !== null && ratio > 1
        return (
          <span className={cn('text-[10px] tabular-nums font-semibold', over ? 'text-red-400' : 'text-green-400')}>
            {actual !== undefined ? `${actual.toFixed(1)}h` : '—'}/{planned.toFixed(1)}h
          </span>
        )
      },
    },
    {
      accessorKey: 'utilizationPct', header: 'Sử dụng',
      cell: ({ getValue }) => {
        const v = getValue<number>()
        return (
          <div className="flex items-center gap-1.5 min-w-[80px]">
            <div className="flex-1 h-1.5 rounded-full bg-[#1e2433] overflow-hidden">
              <div className={cn('h-full rounded-full bg-gradient-to-r', utilGradient(v))} style={{ width: `${v}%` }} />
            </div>
            <span className={cn('text-[10px] tabular-nums w-8 text-right font-bold',
              v >= 70 ? 'text-green-400' : v >= 45 ? 'text-sky-400' : 'text-amber-400',
            )}>{v}%</span>
          </div>
        )
      },
    },
    {
      id: 'output', header: 'Sản lượng hôm nay',
      accessorFn: (row) => row.actualOutputToday,
      cell: ({ row }) => {
        const actual = row.original.actualOutputToday
        const planned = row.original.plannedOutputToday
        const completionPct = planned > 0 ? Math.round((actual / planned) * 100) : 0
        return (
          <div className="flex flex-col">
            <span className="text-[10px] tabular-nums text-foreground/90 font-semibold">
              {actual}/{planned} m
            </span>
            <span className={cn('text-[8px] tabular-nums', completionPct >= 100 ? 'text-green-400' : completionPct >= 80 ? 'text-sky-400' : 'text-amber-400')}>
              {completionPct}% KH
            </span>
          </div>
        )
      },
    },
    {
      accessorKey: 'fuelLitresPerHour', header: 'NL/giờ',
      cell: ({ row }) => {
        const actual = row.original.fuelLitresPerHour
        const base = row.original.fuelBaselineLitresPerHour
        const over = actual > base
        const variance = Math.round(((actual - base) / base) * 1000) / 10
        return (
          <div className="flex items-center gap-1">
            <span className={cn('text-[10px] tabular-nums font-semibold', over ? 'text-red-400' : 'text-amber-300/90')}>
              {actual.toFixed(1)} lít
            </span>
            {over && (
              <span className="text-[8px] text-red-400 font-bold">+{variance}%</span>
            )}
          </div>
        )
      },
    },
  ], [])

  const table = useReactTable({
    data, columns,
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

  const pageNumbers = useMemo(() => {
    const max = 5
    if (pageCount <= max) return Array.from({ length: pageCount }, (_, i) => i)
    const start = Math.max(0, Math.min(currentPage - 2, pageCount - max))
    return Array.from({ length: max }, (_, i) => start + i)
  }, [pageCount, currentPage])

  return (
    <Panel title="Danh sách Đội máy" noPadding className="h-full min-h-0">
      <div className="flex flex-col h-full min-h-0">
        {/* Toolbar */}
        <div className="flex gap-2 px-3 py-2.5 border-b border-[#1e2433] shrink-0 bg-[#0b0f1a]/40">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
            <input
              placeholder="Tìm mã máy, dự án, loại thiết bị..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#060b14] border border-[#1e2433] text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/30 transition-colors"
            />
          </div>
          <div className="flex items-center gap-2 text-[9px] text-muted-foreground/60">
            <span className="w-2 h-2 rounded-full bg-green-400" /> Đang hoạt động
            <span className="w-2 h-2 rounded-full bg-amber-400" /> Chờ việc
            <span className="w-2 h-2 rounded-full bg-red-400" /> Hỏng hóc
            <span className="w-2 h-2 rounded-full bg-sky-400" /> Lưu kho
          </div>
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
                      onClick={h.column.getToggleSortingHandler()}
                      className="px-3 py-2.5 text-left whitespace-nowrap cursor-pointer hover:text-foreground transition-colors select-none text-[9px] font-bold text-muted-foreground uppercase tracking-wider"
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
                    row.original.fuelOver && 'hover:bg-red-500/5',
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
              type="button" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}
              className="flex items-center justify-center w-7 h-7 rounded-lg border border-[#1e2433] text-muted-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:enabled:bg-[#1a2235] hover:enabled:text-foreground"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            {pageNumbers.map(p => (
              <button
                key={p} type="button" onClick={() => table.setPageIndex(p)}
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
              type="button" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}
              className="flex items-center justify-center w-7 h-7 rounded-lg border border-[#1e2433] text-muted-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:enabled:bg-[#1a2235] hover:enabled:text-foreground"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </Panel>
  )
}
