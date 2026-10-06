import { useCallback, useMemo, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { BookOpen, Loader2 } from 'lucide-react'
import { Header } from '@/components/common/Header/Header'
import { PageLayout } from '@/components/common/PageLayout/PageLayout'
import { cn } from '@/utils/cn'
import { BimViewer } from '../../components/BimViewer'
import { BIM_PACKAGE_FOR_ASSET, COMPONENTS, STAGES } from '../../data/workflow/hnqnProject'
import { flowPaths, resolveAsset } from '../../services/workflow/flowNav'
import { componentObjectSets } from '../../services/workflow/componentBim'
import type { BimObject } from '../../types'
import type { ComponentId, StageCode } from '../../workflow.types'

const noop = () => {}

function isStage(value: string | null, stages: StageCode[]): value is StageCode {
  return Boolean(value && stages.includes(value as StageCode))
}

export function BimViewPage() {
  const { assetId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const ctx = resolveAsset(assetId)
  const [objects, setObjects] = useState<BimObject[]>([])
  const [progress, setProgress] = useState<{ pct: number; message: string } | null>({ pct: 0, message: 'Đang tải bản vẽ...' })
  const [error, setError] = useState<string | null>(null)

  const stages = ctx?.asset.stages ?? []
  const stage: StageCode = isStage(params.get('stage'), stages) ? params.get('stage') as StageCode : stages[0] ?? 'GD01'
  const def = STAGES[stage]
  const requested = params.get('c') as ComponentId | null
  const component: ComponentId = requested && def.components.includes(requested) ? requested : def.components[0]
  const packageId = BIM_PACKAGE_FOR_ASSET[assetId] ?? assetId

  const sets = useMemo(() => componentObjectSets(objects, COMPONENTS[component], def.bimKinds), [objects, component, def.bimKinds])
  const visibleIds = useMemo(() => new Set([...sets.focusIds, ...sets.contextIds]), [sets])
  const onCatalog = useCallback((items: BimObject[]) => setObjects(items), [])
  const onProgress = useCallback((pct: number, message: string) => setProgress({ pct, message }), [])
  const onReady = useCallback(() => setProgress(null), [])

  const setStage = (next: StageCode) => {
    const first = STAGES[next].components[0]
    setParams({ stage: next, c: first }, { replace: true })
  }
  const setComponent = (next: ComponentId) => {
    setParams({ stage, c: next }, { replace: true })
  }

  if (!ctx) return <Navigate to={flowPaths.home()} replace />

  return (
    <>
      <Header title="Bản vẽ BIM" subtitle={`${ctx.asset.name} · ${def.label} · ${COMPONENTS[component].label}`} />
      <PageLayout className="gap-2">
        <div className="flex items-center justify-between gap-2 flex-wrap shrink-0">
          <Link to={flowPaths.asset(ctx.asset.id)} className="text-[12px] text-muted-foreground hover:text-foreground">
            ← Ma trận nghiệm thu
          </Link>
          <p className="text-[10px] text-muted-foreground">{ctx.asset.bim.label} · {ctx.asset.bim.revision}</p>
        </div>
        <div className="flex flex-wrap gap-1.5 shrink-0">
          {stages.map(st => (
            <button
              key={st}
              type="button"
              onClick={() => setStage(st)}
              className={cn(
                'h-8 px-3 rounded-lg border text-[11px] font-semibold',
                st === stage ? 'bg-primary/15 border-primary/50 text-foreground' : 'border-white/10 text-muted-foreground',
              )}
            >
              {STAGES[st].label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 shrink-0">
          {def.components.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setComponent(c)}
              className={cn(
                'h-8 px-3 rounded-lg border text-[11px] font-semibold',
                c === component ? 'border-primary/60 bg-primary/10 text-foreground' : 'border-white/10 text-muted-foreground',
              )}
            >
              {COMPONENTS[c].label}
            </button>
          ))}
        </div>
        <section className="relative flex-1 min-h-[360px] rounded-lg overflow-hidden border border-[#1e2433] bg-[#070b12]">
          <BimViewer
            assetId={packageId}
            objects={objects}
            visibleIds={visibleIds}
            selectedIds={[]}
            hoveredId={null}
            highlightIds={sets.focusIds}
            isolatedIds={null}
            stageFilter="all"
            onSelect={noop}
            onHover={noop}
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
          <p className="absolute bottom-2 left-2 text-[10px] text-white/70 inline-flex items-center gap-1">
            <BookOpen className="w-3 h-3" />
            {sets.focusIds.length} cấu kiện{sets.barCount ? ` · ${sets.barCount} thanh` : ''}
          </p>
        </section>
      </PageLayout>
    </>
  )
}
