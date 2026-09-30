import { lazy, memo, Suspense, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, ChevronRight } from 'lucide-react'
import { cn } from '@/utils/cn'
import { criteriaForStage } from '../../../data/workflow/criteria'
import { COMPONENTS, STAGES } from '../../../data/workflow/hnqnProject'
import { flowPaths } from '../../../services/workflow/flowNav'
import type { AssetRecord, ComponentId, StageCode } from '../../../workflow.types'
import { Card, SourceBadge } from '../FlowUi'

const BimComponentSheet = lazy(() => import('../BimComponentSheet'))

export const BimTab = memo(function BimTab({ asset }: { asset: AssetRecord }) {
  const [stage, setStage] = useState<StageCode>('GD02')
  const [view, setView] = useState<ComponentId | null>(null)
  const def = STAGES[stage]
  const criteria = criteriaForStage(stage)

  return (
    <Card
      title={`BIM tham chiếu · ${asset.bim.label} · ${asset.bim.revision}`}
      icon={<BookOpen className="w-3.5 h-3.5 text-primary" />}
      right={(
        <Link to={flowPaths.engineering(asset.id)} className="h-8 inline-flex items-center rounded-lg border border-white/10 px-3 text-[11px] text-muted-foreground hover:text-foreground">
          Engineering Mode (IFC Tree)
        </Link>
      )}
    >
      <p className="text-[11px] text-muted-foreground mb-3">
        BIM là yêu cầu thiết kế tham chiếu, không phải màn hình chính. Chọn component để xem cô lập trên mô hình.
      </p>
      <div className="flex gap-1.5 mb-3">
        {asset.stages.map(st => (
          <button
            key={st}
            type="button"
            onClick={() => setStage(st)}
            className={cn('h-8 px-3 rounded-lg border text-[11px] font-semibold', st === stage ? 'bg-primary/15 border-primary/50 text-foreground' : 'border-white/10 text-muted-foreground')}
          >
            {STAGES[st].code} {STAGES[st].label}
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {def.components.map(c => {
          const list = criteria.filter(x => x.component === c)
          const ifc = list.filter(x => x.source.kind === 'IFC')
          return (
            <button
              key={c}
              type="button"
              onClick={() => setView(c)}
              className="text-left rounded-lg border border-white/5 bg-white/[0.02] p-3 hover:border-primary/40"
            >
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-bold text-foreground">{COMPONENTS[c].label}</p>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <p className="text-[10px] text-muted-foreground">{COMPONENTS[c].labelEn} · {list.length} tiêu chí</p>
              <div className="mt-2 flex flex-col gap-1">
                {ifc.slice(0, 3).map(x => (
                  <span key={x.id} className="flex items-center gap-1.5 text-[10px] text-foreground/80">
                    <SourceBadge source={x.source} /> {x.title}: <b>{x.design}</b>
                  </span>
                ))}
              </div>
            </button>
          )
        })}
      </div>
      {view && (
        <Suspense fallback={null}>
          <BimComponentSheet
            open
            onOpenChange={o => { if (!o) setView(null) }}
            assetId={asset.id}
            stage={stage}
            component={view}
            onComponentChange={setView}
          />
        </Suspense>
      )}
    </Card>
  )
})
