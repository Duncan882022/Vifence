import { memo, useEffect, useState } from 'react'
import { Camera, Mic, Ruler } from 'lucide-react'
import { cn } from '@/utils/cn'
import { CRITERION_STATUS_META, CRITERION_STATUS_ORDER } from '../../data/workflow/meta'
import type { CriterionDef, CriterionResult, CriterionStatus, Evidence } from '../../workflow.types'

interface Props {
  criterion: CriterionDef
  result?: CriterionResult
  evidence: Evidence[]
  active: boolean
  locked: boolean
  onActivate: (id: string) => void
  onStatus: (id: string, status: CriterionStatus) => void
  onText: (id: string, patch: Pick<CriterionResult, 'observed' | 'comment'>) => void
  onMeasure?: (id: string) => void
}

export const CriterionRow = memo(function CriterionRow({
  criterion: c,
  result,
  evidence,
  active,
  locked,
  onActivate,
  onStatus,
  onText,
  onMeasure,
}: Props) {
  const status = result?.status ?? 'not_checked'
  const failed = status === 'fail'
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
        failed ? 'border-red-500/40 bg-red-500/[0.06]' : active ? 'border-primary/60 bg-primary/[0.07]' : 'border-white/5 bg-white/[0.02]',
      )}
    >
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-foreground leading-snug">{c.title}</p>
        <p className="text-[10px] text-muted-foreground">
          TK <b className="text-foreground">{c.design}</b>
          {c.tolerance && c.tolerance !== '—' ? ` · dung sai ${c.tolerance}` : ''}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-1.5" onClick={e => e.stopPropagation()}>
        {CRITERION_STATUS_ORDER.map(s => (
          <button
            key={s}
            type="button"
            disabled={locked}
            onClick={() => {
              commit()
              onStatus(c.id, s)
              onActivate(c.id)
            }}
            className={cn(
              'h-9 rounded-lg border text-[11px] font-bold disabled:opacity-40',
              status === s ? CRITERION_STATUS_META[s].className : 'border-white/10 text-muted-foreground',
            )}
          >
            {CRITERION_STATUS_META[s].label}
          </button>
        ))}
      </div>
      {failed && (
        <div className="flex flex-col gap-1.5" onClick={e => e.stopPropagation()}>
          <input
            value={observed}
            disabled={locked}
            onChange={e => setObserved(e.target.value)}
            onBlur={commit}
            placeholder="Thực tế"
            className="h-9 rounded-lg bg-white/5 border border-white/10 px-2 text-[12px] text-foreground"
          />
          <input
            value={comment}
            disabled={locked}
            onChange={e => setComment(e.target.value)}
            onBlur={commit}
            placeholder="Ghi chú (bắt buộc khi không đạt)"
            className="h-9 rounded-lg bg-white/5 border border-white/10 px-2 text-[12px] text-foreground"
          />
          {onMeasure && (c.method === 'measurement' || c.method === 'test') && !locked && (
            <button
              type="button"
              onClick={() => onMeasure(c.id)}
              className="h-9 rounded-lg border border-sky-500/40 bg-sky-500/10 text-sky-300 text-[11px] font-bold inline-flex items-center justify-center gap-1.5"
            >
              <Ruler className="w-3.5 h-3.5" /> {c.method === 'test' ? 'Nhập thí nghiệm' : 'Nhập số đo'}
            </button>
          )}
          <div className="flex gap-2 text-[9px] text-muted-foreground">
            <span className={cn('inline-flex items-center gap-0.5', snaps + voices + measures === 0 && 'text-red-300')}>
              <Camera className="w-3 h-3" />{snaps}
            </span>
            <span className="inline-flex items-center gap-0.5"><Mic className="w-3 h-3" />{voices}</span>
            {measures > 0 && <span className="inline-flex items-center gap-0.5"><Ruler className="w-3 h-3" />{measures}</span>}
            {snaps + voices + measures === 0 && <span className="text-red-300">Cần ảnh hoặc ghi âm</span>}
          </div>
        </div>
      )}
      {!failed && (snaps + voices + measures > 0) && (
        <div className="flex gap-2 text-[9px] text-muted-foreground">
          {snaps > 0 && <span className="inline-flex items-center gap-0.5"><Camera className="w-3 h-3" />{snaps}</span>}
          {voices > 0 && <span className="inline-flex items-center gap-0.5"><Mic className="w-3 h-3" />{voices}</span>}
          {measures > 0 && <span className="inline-flex items-center gap-0.5"><Ruler className="w-3 h-3" />{measures}</span>}
        </div>
      )}
    </li>
  )
})
