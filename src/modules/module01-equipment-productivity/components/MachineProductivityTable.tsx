import { useMemo, useState } from 'react'
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel,
  getSortedRowModel, useReactTable, type ColumnDef, type SortingState,
} from '@tanstack/react-table'
import { AlertTriangle, Search } from 'lucide-react'
import { Panel } from '@/components/common/PageLayout/PageLayout'
import { EquipmentTablePagination } from '@/modules/equipment-intelligence/components/EquipmentTablePagination'
import { cn } from '@/utils/cn'
import type { Machine, MachineStatus, Project, Worksite, PileAssignment } from '../types'

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
          <span className={cn(
            'text-[10px] tabular-nums font-bold',
            v >= 70 ? 'text-green-400' : v >= 45 ? 'text-sky-400' : 'text-amber-400',
          )}>
            {v}%
          </span>
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

  const paginatedRows = table.getRowModel().rows

  const statusInsight = useMemo(() => {
    const working = machines.filter(m => m.status === 'working').length
    const idle = machines.filter(m => m.status === 'idle').length
    const breakdown = machines.filter(m => m.status === 'breakdown').length
    const stored = machines.filter(m => m.status === 'stored').length
    return [
      { label: 'Chạy', count: working, dot: 'bg-green-400', text: 'text-green-400' },
      { label: 'Chờ', count: idle, dot: 'bg-amber-400', text: 'text-amber-400' },
      { label: 'Hỏng', count: breakdown, dot: 'bg-red-400', text: 'text-red-400' },
      { label: 'Kho', count: stored, dot: 'bg-sky-400', text: 'text-sky-400' },
    ]
  }, [machines])

  const paginationFooter = (
    <EquipmentTablePagination
      startRow={startRow}
      endRow={endRow}
      total={total}
      pageSize={pagination.pageSize}
      onPageSizeChange={size => setPagination(prev => ({ ...prev, pageSize: size, pageIndex: 0 }))}
      pageNumbers={pageNumbers}
      currentPage={currentPage}
      onPageChange={p => table.setPageIndex(p)}
      onPrevious={() => table.previousPage()}
      onNext={() => table.nextPage()}
      canPrevious={table.getCanPreviousPage()}
      canNext={table.getCanNextPage()}
    />
  )

  return (
    <Panel title="Danh sách đội máy" noPadding className="h-full min-h-0">
      <div className="flex flex-col h-full min-h-0">
        <div className="flex flex-col gap-2 px-3 py-2.5 border-b border-[#1e2433] shrink-0 bg-[#0b0f1a]/40">
          <div className="relative w-full min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
            <input
              placeholder="Tìm mã máy, dự án, loại thiết bị..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#060b14] border border-[#1e2433] text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/30 transition-colors"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {statusInsight.map(item => (
              <span
                key={item.label}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-[#1e2433] bg-[#060b14] text-[9px]"
              >
                <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', item.dot)} />
                <span className={cn('font-bold tabular-nums', item.text)}>{item.count}</span>
                <span className="text-muted-foreground/55">{item.label}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Mobile cards */}
        <div className="lg:hidden flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
          {paginatedRows.map(row => {
            const r = row.original
            return (
              <div
                key={row.id}
                className="rounded-xl border border-[#1e2433] bg-[#060b14] px-3 py-3 hover:border-[#2a3855] transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {(r.fuelOver || r.currentPileCode === 'P-083' || r.currentPileCode === 'P-084') && (
                        <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                      )}
                      <p className="font-bold text-primary text-[11px]">{r.code}</p>
                    </div>
                    <p className="text-[10px] text-foreground/85 mt-0.5 truncate">{r.type}</p>
                    <p className="text-[9px] text-muted-foreground mt-1">
                      <span className="text-sky-400 font-semibold">{r.projectCode}</span>
                      {' / '}{r.worksiteCode}
                    </p>
                  </div>
                  <span className={cn('inline-flex px-2 py-0.5 rounded-lg text-[8px] font-bold shrink-0', STATUS_BADGE[r.status])}>
                    {STATUS_LABELS[r.status]}
                  </span>
                </div>
                <div className="mt-2.5 grid grid-cols-2 gap-2 text-[9px]">
                  <div>
                    <p className="text-muted-foreground/55">Cọc</p>
                    <p className="font-mono font-semibold text-violet-400 mt-0.5">{r.currentPileCode}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground/55">Sử dụng</p>
                    <p className={cn(
                      'font-bold tabular-nums mt-0.5',
                      r.utilizationPct >= 70 ? 'text-green-400' : r.utilizationPct >= 45 ? 'text-sky-400' : 'text-amber-400',
                    )}>
                      {r.utilizationPct}%
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground/55">Sản lượng</p>
                    <p className="tabular-nums font-semibold mt-0.5">{r.actualOutputToday}/{r.plannedOutputToday}m</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground/55">NL/giờ</p>
                    <p className={cn('tabular-nums font-semibold mt-0.5', r.fuelOver ? 'text-red-400' : 'text-amber-300/90')}>
                      {r.fuelLitresPerHour.toFixed(1)} lít
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Desktop table */}
        <div className="hidden lg:flex flex-1 min-h-0 overflow-y-auto overflow-x-auto">
          <table className="w-full min-w-[980px] xl:min-w-[1100px] text-[10px]">
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

        {paginationFooter}
      </div>
    </Panel>
  )
}
