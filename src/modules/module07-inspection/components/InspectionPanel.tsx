import { useMemo, useState } from 'react'
import { Layers, Search } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { BimObject, ChecklistType, InspectionAsset, InspectionChecklistItem, InspectionStageId } from '../types'
import { CHECK_TYPE_META, KIND_META, STAGE_META } from '../types'
import { relatedChecklists } from '../services/inspectionWorkspace.service'
import { ProvenanceBadge } from './ProvenanceBadge'
import { ChecklistCard } from './ChecklistCard'
import { CompletenessPanel } from './CompletenessPanel'
import type { CompletenessItem } from '../types'

interface Props {
  asset: InspectionAsset
  objects: BimObject[]
  selected: BimObject[]
  checklists: InspectionChecklistItem[]
  focusedChecklistId: string | null
  completeness: CompletenessItem[]
  completenessPct: number
  onHoverChecklist: (id: string | null) => void
  onFocusChecklist: (id: string) => void
  onViewBim: (id: string) => void
  onAssignStage: (stage: InspectionStageId) => void
  onSupplement: () => void
}

export function InspectionPanel({
  asset, objects, selected, checklists, focusedChecklistId,
  completeness, completenessPct,
  onHoverChecklist, onFocusChecklist, onViewBim, onAssignStage, onSupplement,
}: Props) {
  const [q, setQ] = useState('')
  const [types, setTypes] = useState<ChecklistType[]>([])
  const related = useMemo(
    () => (selected.length === 1 ? relatedChecklists(checklists, selected[0].id, selected[0]) : []),
    [checklists, selected],
  )
  const relatedIds = useMemo(() => new Set(related.map(item => item.id)), [related])
  const ordered = useMemo(() => {
    const s = q.trim().toLowerCase()
    const keep = (item: InspectionChecklistItem) =>
      (types.length === 0 || (item.checkType && types.includes(item.checkType)))
      && (!s || `${item.code ?? ''} ${item.title} ${item.method ?? ''} ${item.reference ?? ''}`.toLowerCase().includes(s))
    return [...related, ...checklists.filter(item => !relatedIds.has(item.id))].filter(keep)
  }, [q, types, related, relatedIds, checklists])
  const toggleType = (t: ChecklistType) =>
    setTypes(prev => (prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]))

  return (
    <div className="space-y-3">
      {selected.length > 1 && (
        <div className="space-y-2">
          <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Multi-select</p>
          <p className="text-sm font-semibold text-foreground">{selected.length} objects selected</p>
          <div className="grid grid-cols-3 gap-1">
            {(['gd1', 'gd2', 'gd3'] as const).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => onAssignStage(s)}
                className="text-[10px] font-semibold py-2 rounded-md border border-[#1e2433] bg-[#0b0f1a] hover:border-primary hover:text-primary"
              >
                Assign {STAGE_META[s].short}
              </button>
            ))}
          </div>
        </div>
      )}

      {selected.length === 1 && (
        <ObjectFacts object={selected[0]} />
      )}

      {selected.length === 0 && (
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Thông tin Asset</p>
          <p className="text-sm font-semibold text-foreground mt-0.5">{asset.code}</p>
          <p className="text-[11px] text-muted-foreground">{asset.name} · {asset.location}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{objects.length} cấu kiện · {asset.ifcFile}</p>
        </div>
      )}

      <section className="space-y-1.5">
        <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
          <Layers className="w-3 h-3" />
          Checklist {asset.code}
          <span className="tabular-nums font-normal">· {ordered.length}</span>
        </p>
        <div className="flex items-center gap-1">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Tìm hạng mục, căn cứ..."
              className="w-full bg-[#0b0f1a] border border-[#1e2433] rounded-md pl-7 pr-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          {(Object.keys(CHECK_TYPE_META) as ChecklistType[]).map(t => (
            <button
              key={t}
              type="button"
              title={CHECK_TYPE_META[t].tip}
              onClick={() => toggleType(t)}
              className={cn(
                'px-1.5 py-1 rounded border text-[9px] font-bold',
                types.includes(t) ? CHECK_TYPE_META[t].className : 'border-[#1e2433] text-muted-foreground hover:text-foreground',
              )}
            >
              {CHECK_TYPE_META[t].label}
            </button>
          ))}
        </div>
        {ordered.length === 0 && (
          <p className="text-[11px] text-muted-foreground rounded-md border border-dashed border-[#1e2433] px-2 py-3 text-center">
            {q || types.length ? 'Không có hạng mục khớp bộ lọc.' : 'Chưa có hạng mục nghiệm thu cho asset này.'}
          </p>
        )}
        {ordered.map(item => (
          <ChecklistCard
            key={item.id}
            item={item}
            active={focusedChecklistId === item.id || (relatedIds.has(item.id) && selected.length === 1)}
            onHover={onHoverChecklist}
            onFocus={onFocusChecklist}
            onViewBim={onViewBim}
          />
        ))}
      </section>

      {selected.length === 0 && (
        <CompletenessPanel pct={completenessPct} items={completeness} onSupplement={onSupplement} />
      )}
    </div>
  )
}

function ObjectFacts({ object }: { object: BimObject }) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
          {KIND_META[object.kind].label} Information
        </p>
        <p className="text-sm font-semibold text-foreground mt-0.5">{object.name}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{object.ifcClass} · {object.ifcGuid.slice(0, 12)}…</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">{STAGE_META[object.stage].name}</span>
        <ProvenanceBadge value={object.provenance} />
      </div>
      <div>
        <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground mb-1">BIM Data</p>
        <div className="space-y-1">
          {object.properties.map(p => (
            <div key={p.key} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-muted-foreground">{p.label}</span>
              <span className="flex items-center gap-1">
                <span className="text-foreground tabular-nums">{p.value ?? '—'}{p.unit && p.value ? ` ${p.unit}` : ''}</span>
                <ProvenanceBadge value={p.provenance} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
