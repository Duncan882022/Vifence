import { memo } from 'react'
import { Mic, Ruler } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useBlobUrl } from '../../hooks/useInspectionFlow'
import type { Evidence } from '../../workflow.types'

/** Hiển thị nội dung bằng chứng: ảnh snapshot, audio, hoặc giá trị đo. */
export const EvidenceMedia = memo(function EvidenceMedia({ evidence, className, compact = false }: {
  evidence: Evidence
  className?: string
  compact?: boolean
}) {
  const url = useBlobUrl(evidence.type === 'snapshot' || evidence.type === 'voice' ? evidence.blobKey : undefined)
  if (evidence.type === 'snapshot') {
    return url
      ? <img src={url} alt={evidence.label} className={cn('rounded object-cover bg-black', className)} />
      : <div className={cn('rounded bg-white/5', className)} />
  }
  if (evidence.type === 'voice') {
    return (
      <div className={cn('flex flex-col gap-1', className)}>
        <span className="inline-flex items-center gap-1 text-[10px] text-cyan-300"><Mic className="w-3 h-3" />{evidence.durationSec?.toFixed(0) ?? '?'}s</span>
        {!compact && url && <audio src={url} controls className="w-full h-8" />}
        {evidence.transcript && <p className="text-[10px] text-foreground/80 italic line-clamp-3">“{evidence.transcript}”</p>}
      </div>
    )
  }
  return (
    <div className={cn('flex items-center gap-1.5 text-[11px]', className)}>
      <Ruler className="w-3 h-3 text-slate-300" />
      <b className="text-foreground">{evidence.value}{evidence.unit ? ` ${evidence.unit}` : ''}</b>
      {evidence.note && <span className="text-muted-foreground truncate">· {evidence.note}</span>}
    </div>
  )
})
