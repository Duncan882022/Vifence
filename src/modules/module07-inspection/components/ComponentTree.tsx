import { Box, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from '@/utils/cn'
import { IFC_SOURCE_META, KIND_META, STAGE_META, type BimObject, type IfcSourceId, type ObjectKind } from '../types'
import { ProvenanceBadge } from './ProvenanceBadge'

interface Props {
  objects: BimObject[]
  visibleIds: Set<string>
  selectedIds: string[]
  hoveredId: string | null
  onSelect: (id: string, additive: boolean) => void
  onHover: (id: string | null) => void
}

const KIND_ORDER: ObjectKind[] = ['concrete', 'rebar', 'dul', 'anchor', 'embed']
const TREE_CAP = 400

export function ComponentTree({ objects, visibleIds, selectedIds, hoveredId, onSelect, onHover }: Props) {
  const [q, setQ] = useState('')
  const [expanded, setExpanded] = useState<Partial<Record<ObjectKind, boolean>>>({})

  const groups = useMemo(() => {
    const filtered = objects.filter(o => {
      if (!visibleIds.has(o.id)) return false
      if (!q.trim()) return true
      const s = q.toLowerCase()
      return o.name.toLowerCase().includes(s) || o.kind.includes(s) || o.ifcClass.toLowerCase().includes(s)
        || Boolean(o.tags?.some(t => t.includes(s)))
    })
    return KIND_ORDER
      .map(kind => ({ kind, items: filtered.filter(o => o.kind === kind) }))
      .filter(g => g.items.length > 0)
  }, [objects, visibleIds, q])

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="relative shrink-0 mb-2">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Lọc cấu kiện..."
          className="w-full bg-[#0b0f1a] border border-[#1e2433] rounded-md pl-7 pr-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
        {groups.length === 0 && (
          <p className="text-[11px] text-muted-foreground px-1 py-6 text-center">Không có cấu kiện khớp bộ lọc.</p>
        )}
        {groups.map(g => {
          const open = expanded[g.kind] || Boolean(q.trim()) || g.items.length <= TREE_CAP
          const items = open ? g.items : g.items.slice(0, TREE_CAP)
          const hidden = g.items.length - items.length
          return (
            <div key={g.kind}>
              <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground px-1 mb-1">
                {KIND_META[g.kind].label}
                <span className="ml-1 tabular-nums font-normal">{g.items.length}</span>
              </p>
              <div className="space-y-0.5">
                {items.map(o => {
                  const on = selectedIds.includes(o.id)
                  const hv = hoveredId === o.id
                  const src = o.source === 'inferred' || o.source === 'mock' ? null : IFC_SOURCE_META[o.source as IfcSourceId].file
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onMouseEnter={() => onHover(o.id)}
                      onMouseLeave={() => onHover(null)}
                      onClick={e => onSelect(o.id, e.shiftKey)}
                      className={cn(
                        'w-full flex items-center gap-1.5 px-1.5 py-1 rounded-md text-left border transition-colors',
                        on ? 'border-primary bg-primary/10' : hv ? 'border-[#2a3855] bg-[#1a2235]' : 'border-transparent hover:bg-[#1a2235]/60',
                      )}
                    >
                      <Box className="w-3 h-3 shrink-0" style={{ color: KIND_META[o.kind].color }} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[11px] text-foreground truncate">{o.name}</span>
                        <span className="block text-[9px] text-muted-foreground truncate">
                          {src ? `${src} · ` : ''}{STAGE_META[o.stage].short} · {o.ifcClass}
                        </span>
                      </span>
                      <ProvenanceBadge value={o.provenance} />
                    </button>
                  )
                })}
              </div>
              {hidden > 0 && (
                <button
                  type="button"
                  onClick={() => setExpanded(prev => ({ ...prev, [g.kind]: true }))}
                  className="mt-1 px-1 text-[10px] text-primary font-semibold"
                >
                  Hiện thêm {hidden} cấu kiện
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
