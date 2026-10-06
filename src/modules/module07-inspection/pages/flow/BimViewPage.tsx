import { useCallback, useMemo, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { BookOpen, ListTree, Loader2 } from 'lucide-react'
import { Header } from '@/components/common/Header/Header'
import { PageLayout } from '@/components/common/PageLayout/PageLayout'
import { cn } from '@/utils/cn'
import { BimViewer } from '../../components/BimViewer'
import { BIM_PACKAGE_FOR_ASSET, COMPONENTS, STAGES } from '../../data/workflow/hnqnProject'
import { flowPaths, resolveAsset } from '../../services/workflow/flowNav'
import { componentObjectSets, mergeComponentSets } from '../../services/workflow/componentBim'
import {
  ALL_KINDS,
  KIND_LABEL_VI,
  parseComponentParam,
  parseKindParam,
  sameIds,
  toggleComponent,
  toggleKind,
} from '../../services/workflow/bimView'
import type { BimObject, ObjectKind } from '../../types'
import type { ComponentId, StageCode } from '../../workflow.types'

function isStage(value: string | null, stages: StageCode[]): value is StageCode {
  return Boolean(value && stages.includes(value as StageCode))
}

const chipRow = 'flex gap-1.5 shrink-0 overflow-x-auto pb-0.5 -mx-1 px-1'
const chip = 'h-8 px-3 rounded-lg border text-[11px] font-semibold whitespace-nowrap shrink-0'

export function BimViewPage() {
  const { assetId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const ctx = resolveAsset(assetId)
  const [objects, setObjects] = useState<BimObject[]>([])
  const [progress, setProgress] = useState<{ pct: number; message: string } | null>({ pct: 0, message: 'Đang tải bản vẽ...' })
  const [error, setError] = useState<string | null>(null)
  const [pickedId, setPickedId] = useState<string | null>(null)

  const stages = ctx?.asset.stages ?? []
  const stage: StageCode = isStage(params.get('stage'), stages) ? params.get('stage') as StageCode : stages[0] ?? 'GD01'
  const def = STAGES[stage]
  const components = parseComponentParam(params.get('c'), def.components)
  const kinds = parseKindParam(params.get('k'), def.bimKinds)
  const allComponents = sameIds(components, def.components)
  const packageId = BIM_PACKAGE_FOR_ASSET[assetId] ?? assetId

  const sets = useMemo(
    () => mergeComponentSets(components.map(id => componentObjectSets(objects, COMPONENTS[id], kinds))),
    [objects, components, kinds],
  )
  const visibleIds = useMemo(() => new Set([...sets.focusIds, ...sets.contextIds]), [sets])
  const picked = pickedId && visibleIds.has(pickedId) ? objects.find(o => o.id === pickedId) : undefined
  const onCatalog = useCallback((items: BimObject[]) => setObjects(items), [])
  const onProgress = useCallback((pct: number, message: string) => setProgress({ pct, message }), [])
  const onReady = useCallback(() => setProgress(null), [])
  const onSelect = useCallback((id: string) => setPickedId(id || null), [])

  const write = (nextStage: StageCode, nextComponents: ComponentId[], nextKinds: ObjectKind[]) => {
    const allowed = STAGES[nextStage].components
    const q = new URLSearchParams({ stage: nextStage })
    if (!sameIds(nextComponents, allowed)) q.set('c', nextComponents.join(','))
    if (!sameIds(nextKinds, STAGES[nextStage].bimKinds)) q.set('k', nextKinds.join(','))
    setParams(q, { replace: true })
    setPickedId(null)
  }

  const setStage = (next: StageCode) => write(next, [...STAGES[next].components], [...STAGES[next].bimKinds])
  const onComponent = (id: ComponentId) => write(stage, toggleComponent(components, id, def.components), kinds)
  const onKind = (id: ObjectKind) => write(stage, components, toggleKind(kinds, id))
  const onAll = () => write(stage, [...def.components], kinds)

  if (!ctx) return <Navigate to={flowPaths.home()} replace />

  const scopeLabel = allComponents
    ? 'Toàn dầm'
    : components.map(id => COMPONENTS[id].label).join(' · ')

  return (
    <>
      <Header title="Bản vẽ BIM" subtitle={`${ctx.asset.name} · ${def.label} · ${scopeLabel}`} />
      <PageLayout className="gap-2">
        <div className="flex items-center justify-between gap-2 flex-wrap shrink-0">
          <Link to={flowPaths.asset(ctx.asset.id)} className="text-[12px] text-muted-foreground hover:text-foreground">
            ← Ma trận nghiệm thu
          </Link>
          <Link
            to={flowPaths.engineering(ctx.asset.id)}
            className="h-8 inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <ListTree className="w-3.5 h-3.5" /> Cây cấu kiện
          </Link>
        </div>
        <div className={chipRow}>
          {stages.map(st => (
            <button
              key={st}
              type="button"
              onClick={() => setStage(st)}
              className={cn(chip, st === stage ? 'bg-primary/15 border-primary/50 text-foreground' : 'border-white/10 text-muted-foreground')}
            >
              {STAGES[st].label}
            </button>
          ))}
        </div>
        <div className={chipRow}>
          <button
            type="button"
            onClick={onAll}
            className={cn(chip, allComponents ? 'border-primary/60 bg-primary/10 text-foreground' : 'border-white/10 text-muted-foreground')}
          >
            Toàn dầm
          </button>
          {def.components.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => onComponent(c)}
              className={cn(
                chip,
                !allComponents && components.includes(c)
                  ? 'border-primary/60 bg-primary/10 text-foreground'
                  : 'border-white/10 text-muted-foreground',
              )}
            >
              {COMPONENTS[c].label}
            </button>
          ))}
        </div>
        <div className={chipRow}>
          {ALL_KINDS.map(k => (
            <button
              key={k}
              type="button"
              onClick={() => onKind(k)}
              className={cn(chip, kinds.includes(k) ? 'border-primary/60 bg-primary/10 text-foreground' : 'border-white/10 text-muted-foreground')}
            >
              {KIND_LABEL_VI[k]}
            </button>
          ))}
        </div>
        <section className="relative flex-1 min-h-[220px] rounded-lg overflow-hidden border border-[#1e2433] bg-[#070b12]">
          <BimViewer
            assetId={packageId}
            objects={objects}
            visibleIds={visibleIds}
            selectedIds={pickedId ? [pickedId] : []}
            hoveredId={null}
            highlightIds={sets.focusIds}
            isolatedIds={null}
            stageFilter="all"
            onSelect={onSelect}
            onHover={() => {}}
            onCatalog={onCatalog}
            onProgress={onProgress}
            onReady={onReady}
            onError={setError}
          />
          {(progress || error) && (
            <div className="absolute inset-x-0 top-0 p-3 flex items-center gap-2 text-[11px] text-muted-foreground bg-[#070b12]/80">
              {error ? <span className="text-red-400">{error}</span> : (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {progress?.message} {progress ? `${Math.round(progress.pct)}%` : ''}
                </>
              )}
            </div>
          )}
          {picked && (
            <div className="absolute bottom-8 left-2 right-2 sm:right-auto sm:max-w-sm rounded-lg border border-white/15 bg-[#070b12]/90 px-3 py-2">
              <p className="text-[12px] font-semibold text-foreground truncate">{picked.name || picked.ifcClass}</p>
              <p className="text-[10px] text-muted-foreground">
                {KIND_LABEL_VI[picked.kind]}
                {picked.tags?.some(t => t.startsWith('zone-'))
                  ? ` · ${picked.tags.filter(t => t.startsWith('zone-')).map(t => t.slice(5)).join(', ')}`
                  : ''}
              </p>
            </div>
          )}
          <p className="absolute bottom-2 left-2 text-[10px] text-white/70 inline-flex items-center gap-1">
            <BookOpen className="w-3 h-3" />
            {sets.focusIds.length} cấu kiện{sets.barCount ? ` · ${sets.barCount} thanh` : ''}
            {kinds.length > 1 ? ` · ${kinds.map(k => KIND_LABEL_VI[k]).join(' + ')}` : ''}
          </p>
        </section>
      </PageLayout>
    </>
  )
}
