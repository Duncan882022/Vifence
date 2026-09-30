import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Loader2 } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { BimViewer } from '../BimViewer'
import { BIM_PACKAGE_FOR_ASSET, COMPONENTS, STAGES } from '../../data/workflow/hnqnProject'
import { flowPaths } from '../../services/workflow/flowNav'
import { componentObjectSets } from '../../services/workflow/componentBim'
import type { BimObject } from '../../types'
import type { ComponentId, StageCode } from '../../workflow.types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  assetId: string
  stage: StageCode
  component: ComponentId
  onComponentChange?: (component: ComponentId) => void
}

const noop = () => {}

/** VIEW BIM — mô hình tham chiếu, tự cô lập + highlight component đang kiểm. Không có IFC Tree. */
export default function BimComponentSheet({ open, onOpenChange, assetId, stage, component, onComponentChange }: Props) {
  const [objects, setObjects] = useState<BimObject[]>([])
  const [progress, setProgress] = useState<{ pct: number; message: string } | null>({ pct: 0, message: 'Đang tải mô hình...' })
  const [error, setError] = useState<string | null>(null)
  const def = STAGES[stage]
  const comp = COMPONENTS[component]
  const packageId = BIM_PACKAGE_FOR_ASSET[assetId] ?? assetId

  const sets = useMemo(() => componentObjectSets(objects, comp, def.bimKinds), [objects, comp, def.bimKinds])
  const visibleIds = useMemo(() => new Set([...sets.focusIds, ...sets.contextIds]), [sets])
  const onCatalog = useCallback((items: BimObject[]) => setObjects(items), [])
  const onProgress = useCallback((pct: number, message: string) => setProgress({ pct, message }), [])
  const onReady = useCallback(() => setProgress(null), [])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[82vh] p-4 gap-3">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            VIEW BIM · {def.code} {def.label} · {comp.label}
          </SheetTitle>
          <p className="text-[11px] text-muted-foreground">
            Mô hình tham chiếu (IFC {packageId === 'dam-hop' ? 'DUL + SUON' : packageId}) — tự cô lập component đang kiểm.
            {' '}{sets.focusIds.length} đối tượng{sets.barCount ? ` · ${sets.barCount} đoạn thanh IFC` : ''}.
          </p>
        </SheetHeader>
        <div className="flex flex-wrap gap-1.5">
          {def.components.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => onComponentChange?.(c)}
              className={cn(
                'h-8 px-3 rounded-lg border text-[11px] font-semibold',
                c === component ? 'bg-primary/15 border-primary/50 text-foreground' : 'border-white/10 text-muted-foreground hover:text-foreground',
              )}
            >
              {COMPONENTS[c].label}
            </button>
          ))}
          <Link to={flowPaths.engineering(assetId)} className="ml-auto h-8 inline-flex items-center px-3 rounded-lg border border-white/10 text-[11px] text-muted-foreground hover:text-foreground">
            Engineering Mode (IFC Tree)
          </Link>
        </div>
        <div className="relative flex-1 min-h-0 rounded-lg overflow-hidden border border-[#1e2433] bg-[#070b12]">
          {open && (
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
          )}
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
        </div>
      </SheetContent>
    </Sheet>
  )
}
