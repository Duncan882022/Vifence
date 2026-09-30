import { lazy, memo, Suspense, useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, BookOpen, ClipboardList, Play, Sparkles } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { criteriaForStage } from '../../data/workflow/criteria'
import { ASSETS, COMPONENTS, PROJECTS, STAGES, STRUCTURES } from '../../data/workflow/hnqnProject'
import { VERIFICATION_METHOD_META, VISUAL_CONTEXT_LABEL } from '../../data/workflow/meta'
import { briefFor, requirementText } from '../../data/workflow/requirements'
import type { ComponentId, CriterionMethod, InspectionBrief, StageCode } from '../../workflow.types'
import { PocMockBanner, SourceBadge, TokenBadge } from './FlowUi'

const BimComponentSheet = lazy(() => import('./BimComponentSheet'))

const CRITERION_METHOD_LABEL: Record<CriterionMethod, string> = {
  camera: 'Camera H1',
  measurement: 'Đo',
  test: 'Thí nghiệm',
  document: 'Hồ sơ',
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  assetId: string
  stage: StageCode
  component: ComponentId
  onComponentChange?: (component: ComponentId) => void
  /** Bỏ trống → ẩn nút bắt đầu (chỉ xem). */
  onStart?: (brief: InspectionBrief) => void
  startLabel?: string
  startDisabledHint?: string
}

function Section({ n, title, icon, children, className }: { n: number; title: string; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-lg border border-white/5 bg-white/[0.02] p-3 min-w-0', className)}>
      <h4 className="flex items-center gap-1.5 text-[10px] font-black tracking-wider text-muted-foreground mb-2">
        <span className="w-4 h-4 rounded bg-white/10 text-foreground text-[9px] inline-flex items-center justify-center">{n}</span>
        {icon}
        {title}
      </h4>
      {children}
    </section>
  )
}

function BriefBody({ brief }: { brief: InspectionBrief }) {
  const asset = ASSETS.find(a => a.id === brief.assetId)
  const structure = STRUCTURES.find(s => s.id === asset?.structureId)
  const project = PROJECTS.find(p => p.id === structure?.projectId)
  const def = STAGES[brief.stage]
  const comp = COMPONENTS[brief.component]

  return (
    <div className="grid gap-2 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex flex-col gap-2 min-w-0">
        <Section n={1} title="HẠNG MỤC">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[11px]">
            <dt className="text-muted-foreground">Dự án / công trình</dt>
            <dd className="text-foreground truncate">{project?.code} · {structure?.name}</dd>
            <dt className="text-muted-foreground">Hạng mục</dt>
            <dd className="text-foreground font-semibold truncate">{asset?.name} ({asset?.qrId})</dd>
            <dt className="text-muted-foreground">Giai đoạn</dt>
            <dd className="text-foreground truncate">{def.code} {def.label}</dd>
            <dt className="text-muted-foreground">Cấu kiện</dt>
            <dd className="text-foreground font-semibold truncate">{comp.label} · {comp.labelEn}</dd>
            <dt className="text-muted-foreground">Bản vẽ</dt>
            <dd className="text-foreground font-mono truncate">{brief.drawing}</dd>
          </dl>
        </Section>

        <Section n={2} title="YÊU CẦU CHÍNH">
          <ul className="flex flex-col divide-y divide-white/5">
            {brief.requirements.map(r => (
              <li key={r.id} className="py-1.5 flex items-start gap-2 min-w-0">
                <span className={cn('mt-1.5 w-1.5 h-1.5 rounded-full shrink-0', r.priority === 'high' ? 'bg-amber-400' : 'bg-white/20')} aria-hidden />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-foreground">
                    <span className="font-semibold">{r.title}:</span>{' '}
                    <span className={cn(r.value && r.sourceKind !== 'MOCK' ? 'text-foreground' : 'text-foreground/70')}>{requirementText(r)}</span>
                  </p>
                  <p className="text-[9px] text-muted-foreground truncate">
                    {r.sourceType} {r.sourceDocument} {r.sourceRevision} · {r.sourceReference}
                  </p>
                </div>
                <SourceBadge source={r.sourceKind} />
                <TokenBadge token={VERIFICATION_METHOD_META[r.method]} size="small" />
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <div className="flex flex-col gap-2 min-w-0">
        <Section n={3} title="ĐẶC BIỆT CHÚ Ý" icon={<AlertTriangle className="w-3 h-3 text-amber-400" />}>
          <ul className="flex flex-wrap gap-1">
            {brief.attention.map(a => (
              <li key={a} className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-200">{a}</li>
            ))}
          </ul>
        </Section>

        <Section n={4} title="CẦN KIỂM TRA NGOÀI VIDEO">
          <ul className="flex flex-col gap-1">
            {brief.outsideVideo.map(o => (
              <li key={o.item} className="flex items-center gap-2 text-[11px] min-w-0">
                <span className="text-foreground font-semibold truncate">{o.item}</span>
                <span className="text-muted-foreground">→</span>
                <TokenBadge token={VERIFICATION_METHOD_META[o.method]} size="small" />
                <span className="text-[10px] text-muted-foreground truncate">{o.detail}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section n={5} title="HỒ SƠ / TIÊU CHUẨN">
          <ul className="flex flex-col gap-1">
            {brief.references.map(ref => (
              <li key={`${ref.type}-${ref.code}`} className="flex items-center gap-2 text-[11px] min-w-0">
                <span className="w-16 shrink-0 text-[9px] font-bold text-muted-foreground">{ref.type}</span>
                <span className={cn('font-mono truncate', ref.configured ? 'text-foreground' : 'text-muted-foreground')}>
                  {ref.code}{ref.revision !== '—' ? ` ${ref.revision}` : ''}
                </span>
                {!ref.configured && <span className="text-[9px] text-amber-300/80 shrink-0">chưa cấu hình</span>}
                <span className="ml-auto shrink-0"><SourceBadge source={ref.sourceKind} /></span>
              </li>
            ))}
          </ul>
        </Section>

        <Section n={6} title="AI VIDEO CÓ THỂ HỖ TRỢ" icon={<Sparkles className="w-3 h-3 text-fuchsia-300" />}>
          <ul className="flex flex-col gap-0.5 text-[11px] text-foreground/90">
            {brief.aiSupport.map(a => <li key={a}>· {a}</li>)}
          </ul>
          <p className="mt-2 text-[10px] text-fuchsia-200/80 border-t border-white/5 pt-1.5">{brief.aiLimits}</p>
        </Section>
      </div>
    </div>
  )
}

function ChecklistBody({ stage, component }: { stage: StageCode; component: ComponentId }) {
  const list = useMemo(() => criteriaForStage(stage).filter(c => c.component === component), [stage, component])
  return (
    <ul className="flex flex-col gap-1">
      {list.map(c => (
        <li key={c.id} className="flex items-center gap-2 rounded-lg border border-white/5 px-3 py-2 text-[11px] min-w-0">
          <span className="font-mono font-bold text-foreground w-10 shrink-0">{c.code}</span>
          <span className="flex-1 min-w-0 truncate text-foreground">{c.title}</span>
          <span className="text-muted-foreground truncate max-w-[30%]">{c.source.kind === 'MOCK' ? 'Theo hồ sơ được duyệt' : c.design}</span>
          <span className="text-[10px] text-muted-foreground w-16 shrink-0">{CRITERION_METHOD_LABEL[c.method]}</span>
          <SourceBadge source={c.source} />
        </li>
      ))}
    </ul>
  )
}

/** LƯU Ý NGHIỆM THU — tóm tắt đọc trong 10–20 giây trước khi nghiệm thu một component. */
export const InspectionBriefDialog = memo(function InspectionBriefDialog({
  open, onOpenChange, assetId, stage, component, onComponentChange, onStart, startLabel = 'BẮT ĐẦU NGHIỆM THU', startDisabledHint,
}: Props) {
  const [view, setView] = useState<'brief' | 'checklist'>('brief')
  const [bimOpen, setBimOpen] = useState(false)
  const brief = useMemo(() => briefFor(assetId, stage, component), [assetId, stage, component])
  if (!brief) return null
  const def = STAGES[stage]
  const btn = 'h-11 px-4 rounded-xl border text-[12px] font-bold inline-flex items-center justify-center gap-1.5'

  return (
    <>
      <Sheet open={open} onOpenChange={o => { if (!o) setView('brief'); onOpenChange(o) }}>
        <SheetContent side="center" className="p-4 gap-3 w-[min(1080px,calc(100vw-2rem))]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 flex-wrap">
              <ClipboardList className="w-4 h-4 text-primary" />
              LƯU Ý NGHIỆM THU
              <span className="text-muted-foreground font-semibold text-[13px]">· {def.code} {def.label} · {COMPONENTS[component].label}</span>
              <TokenBadge token={{ label: VISUAL_CONTEXT_LABEL[brief.visualContext].toUpperCase(), className: 'bg-sky-500/10 text-sky-300 border-sky-500/30' }} />
            </SheetTitle>
            <p className="text-[10px] text-muted-foreground">
              {brief.id} · {brief.version} · tóm tắt từ hồ sơ được duyệt — không thay thế checklist chi tiết
            </p>
          </SheetHeader>
          {onComponentChange && def.components.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {def.components.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onComponentChange(c)}
                  className={cn('h-8 px-3 rounded-lg border text-[11px] font-semibold', c === component ? 'bg-primary/15 border-primary/50 text-foreground' : 'border-white/10 text-muted-foreground hover:text-foreground')}
                >
                  {COMPONENTS[c].label}
                </button>
              ))}
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {view === 'brief' ? <BriefBody brief={brief} /> : <ChecklistBody stage={stage} component={component} />}
          </div>
          <PocMockBanner />
          <footer className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setBimOpen(true)} className={cn(btn, 'border-white/10 text-foreground')}>
              <BookOpen className="w-4 h-4" /> XEM AFC/BIM
            </button>
            <button type="button" onClick={() => setView(v => (v === 'brief' ? 'checklist' : 'brief'))} className={cn(btn, 'border-white/10 text-foreground')}>
              <ClipboardList className="w-4 h-4" /> {view === 'brief' ? 'XEM CHECKLIST' : 'XEM LƯU Ý'}
            </button>
            {onStart && (
              <div className="ml-auto flex items-center gap-2">
                {startDisabledHint && <span className="text-[10px] text-muted-foreground">{startDisabledHint}</span>}
                <button
                  type="button"
                  disabled={Boolean(startDisabledHint)}
                  onClick={() => onStart(brief)}
                  className={cn(btn, 'px-6 border-green-500/60 bg-green-500/15 text-green-300 hover:bg-green-500/25 disabled:opacity-40')}
                >
                  <Play className="w-4 h-4" /> {startLabel}
                </button>
              </div>
            )}
          </footer>
        </SheetContent>
      </Sheet>
      {bimOpen && (
        <Suspense fallback={null}>
          <BimComponentSheet open onOpenChange={setBimOpen} assetId={assetId} stage={stage} component={component} onComponentChange={onComponentChange} />
        </Suspense>
      )}
    </>
  )
})
