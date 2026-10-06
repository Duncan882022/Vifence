import { memo, useEffect, useState } from 'react'
import { Camera, Mic, Ruler } from 'lucide-react'
import { cn } from '@/utils/cn'
import { CRITERION_STATUS_META, CRITERION_STATUS_ORDER } from '../../data/workflow/meta'
import type { CriterionDef, CriterionResult, CriterionStatus, Evidence } from '../../workflow.types'
import { SourceBadge, TokenBadge } from './FlowUi'

interface Props {
  criterion: CriterionDef
  result?: CriterionResult
  evidence: Evidence[]
  active: boolean
  locked: boolean
  onActivate: (id: string) => void
  onStatus: (id: string, status: CriterionStatus) => void
  onText: (id: string, patch: Pick<CriterionResult, 'observed' | 'comment'>) => void
  /** Mở form nhập số đo / thí nghiệm cho tiêu chí đo đạc. */
  onMeasure?: (id: string) => void
}

const METHOD_LABEL: Record<CriterionDef['method'], string> = {
  camera: 'Camera',
  measurement: 'Đo đạc',
  test: 'Thí nghiệm',
  document: 'Hồ sơ',
}

/** §10 Criterion: Design · Observed · Tolerance · Source · Result · Evidence · Comment. */
export const CriterionRow = memo(function CriterionRow({ criterion: c, result, evidence, active, locked, onActivate, onStatus, onText, onMeasure }: Props) {
  const status = result?.status ?? 'not_checked'
  const [observed, setObserved] = useState(result?.observed ?? '')
  const [comment, setComment] = useState(result?.comment ?? '')
  useEffect(() => setObserved(result?.observed ?? ''), [result?.observed])
  useEffect(() => setComment(result?.comment ?? ''), [result?.comment])
  const snaps = evidence.filter(e => e.type === 'snapshot').length
  const voices = evidence.filter(e => e.type === 'voice').length
  const measures = evidence.filter(e => e.type === 'measurement' || e.type === 'test').length

  const commit = () => {
    if (observed !== (result?.observed ?? '') || comment !== (result?.comment ?? '')) onText(c.id, { observed, comment })
  }

  return (
    <li
      onClick={() => onActivate(c.id)}
      className={cn(
        'rounded-lg border px-2.5 py-2 flex flex-col gap-1.5 cursor-pointer',
        active ? 'border-primary/60 bg-primary/[0.07]' : 'border-white/5 bg-white/[0.02]',
      )}
    >
      <div className="flex items-start gap-2">
        <span className="text-[10px] font-mono text-muted-foreground mt-0.5">{c.code}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-foreground leading-snug">
            {c.title}{c.mandatory && <span className="text-red-400"> *</span>}
          </p>
          <p className="text-[10px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
            Design <b className="text-foreground">{c.design}</b> · Dung sai {c.tolerance} · {METHOD_LABEL[c.method]}
            <SourceBadge source={c.source} />
          </p>
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <TokenBadge token={CRITERION_STATUS_META[status]} size="small" />
          {result?.autoVerdict && <span className="text-[8px] font-bold text-sky-300">TỰ CHẤM</span>}
          {result?.carriedFrom && <span className="text-[8px] font-bold text-green-400">KẾ THỪA</span>}
        </div>
      </div>
      {result?.autoVerdict && (
        <p className={cn('text-[10px]', status === 'fail' ? 'text-red-300' : 'text-sky-300')}>
          <Ruler className="w-3 h-3 inline mr-0.5" />{result.autoVerdict}
        </p>
      )}
      {active && (
        <div className="flex flex-col gap-1.5" onClick={e => e.stopPropagation()}>
          <p className="text-[9px] text-muted-foreground truncate">Nguồn: {c.source.ref}</p>
          {onMeasure && (c.method === 'measurement' || c.method === 'test') && !locked && (
            <button
              type="button"
              onClick={() => onMeasure(c.id)}
              className="h-10 rounded-lg border border-sky-500/40 bg-sky-500/10 text-sky-300 text-[12px] font-bold inline-flex items-center justify-center gap-1.5"
            >
              <Ruler className="w-4 h-4" /> {c.method === 'test' ? 'Nhập kết quả thí nghiệm' : 'Nhập số đo'}{c.designValue != null ? ' → tự chấm theo dung sai' : ''}
            </button>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            <input
              value={observed}
              disabled={locked}
              onChange={e => setObserved(e.target.value)}
              onBlur={commit}
              placeholder="Observed (quan sát / đo được)"
              className="h-9 rounded-lg bg-white/5 border border-white/10 px-2 text-[12px] text-foreground"
            />
            <input
              value={comment}
              disabled={locked}
              onChange={e => setComment(e.target.value)}
              onBlur={commit}
              placeholder="Comment"
              className="h-9 rounded-lg bg-white/5 border border-white/10 px-2 text-[12px] text-foreground"
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {CRITERION_STATUS_ORDER.map(s => (
              <button
                key={s}
                type="button"
                disabled={locked}
                onClick={() => {
                  commit()
                  onStatus(c.id, s)
                }}
                className={cn(
                  'h-10 rounded-lg border text-[12px] font-black tracking-wider disabled:opacity-40',
                  status === s ? CRITERION_STATUS_META[s].className : 'border-white/10 text-muted-foreground',
                )}
              >
                {CRITERION_STATUS_META[s].label}
              </button>
            ))}
          </div>
        </div>
      )}
      {(snaps + voices + measures > 0) && (
        <div className="flex gap-2 text-[9px] text-muted-foreground">
          {snaps > 0 && <span className="inline-flex items-center gap-0.5"><Camera className="w-3 h-3" />{snaps}</span>}
          {voices > 0 && <span className="inline-flex items-center gap-0.5"><Mic className="w-3 h-3" />{voices}</span>}
          {measures > 0 && <span className="inline-flex items-center gap-0.5"><Ruler className="w-3 h-3" />{measures}</span>}
        </div>
      )}
    </li>
  )
})
