import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Loader2 } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { BimViewer } from '../BimViewer'
import { BIM_PACKAGE_FOR_ASSET, COMPONENTS, STAGES } from '../../data/workflow/hnqnProject'
import { flowPaths } from '../../services/workflow/flowNav'
import { componentObjectSets } from '../../services/workflow/componentBim'
import { KIND_LABEL_VI } from '../../services/workflow/bimView'
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

/** VIEW BIM — mô hình tham chiếu, tự cô lập + highlight component đang kiểm. */
export default function BimComponentSheet({ open, onOpenChange, assetId, stage, component, onComponentChange }: Props) {
  const [objects, setObjects] = useState<BimObject[]>([])
  const [progress, setProgress] = useState<{ pct: number; message: string } | null>({ pct: 0, message: 'Đang tải mô hình...' })
  const [error, setError] = useState<string | null>(null)
  const [pickedId, setPickedId] = useState<string | null>(null)
  const def = STAGES[stage]
  const comp = COMPONENTS[component]
  const packageId = BIM_PACKAGE_FOR_ASSET[assetId] ?? assetId

  const sets = useMemo(() => componentObjectSets(objects, comp, def.bimKinds), [objects, comp, def.bimKinds])
  const visibleIds = useMemo(() => new Set([...sets.focusIds, ...sets.contextIds]), [sets])
  const picked = pickedId ? objects.find(o => o.id === pickedId) : undefined
  const onCatalog = useCallback((items: BimObject[]) => setObjects(items), [])
  const onProgress = useCallback((pct: number, message: string) => setProgress({ pct, message }), [])
  const onReady = useCallback(() => setProgress(null), [])
  const onSelect = useCallback((id: string) => setPickedId(id || null), [])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[82vh] p-4 gap-3">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            Bản vẽ BIM · {def.label} · {comp.label}
          </SheetTitle>
          <p className="text-[11px] text-muted-foreground">
            {sets.focusIds.length} cấu kiện{sets.barCount ? ` · ${sets.barCount} thanh` : ''}
          </p>
        </SheetHeader>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {def.components.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => { onComponentChange?.(c); setPickedId(null) }}
              className={cn(
                'h-8 px-3 rounded-lg border text-[11px] font-semibold whitespace-nowrap shrink-0',
                c === component ? 'bg-primary/15 border-primary/50 text-foreground' : 'border-white/10 text-muted-foreground hover:text-foreground',
              )}
            >
              {COMPONENTS[c].label}
            </button>
          ))}
          <Link to={flowPaths.bim(assetId, stage, component)} className="ml-auto h-8 inline-flex items-center px-3 rounded-lg border border-white/10 text-[11px] text-muted-foreground hover:text-foreground whitespace-nowrap shrink-0">
            Phóng to
          </Link>
        </div>
        <div className="relative flex-1 min-h-0 rounded-lg overflow-hidden border border-[#1e2433] bg-[#070b12]">
          {open && (
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
          {picked && (
            <div className="absolute bottom-2 left-2 right-2 rounded-lg border border-white/15 bg-[#070b12]/90 px-3 py-2">
              <p className="text-[12px] font-semibold text-foreground truncate">{picked.name || picked.ifcClass}</p>
              <p className="text-[10px] text-muted-foreground">{KIND_LABEL_VI[picked.kind]}</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
