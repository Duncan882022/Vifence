import dayjs from 'dayjs'
import { Loader2, ScanFace, Tag } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { CameraDetection } from '@/types/cameraPlayback'

interface PlaybackDetectionsListProps {
  detections: CameraDetection[]
  loading?: boolean
  embedded?: boolean
}

export function PlaybackDetectionsList({
  detections,
  loading = false,
  embedded = false,
}: PlaybackDetectionsListProps) {
  return (
    <div className={cn(!embedded && 'pt-2 border-t border-[#1e2433]')}>
      {!embedded && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-[8px] lg:text-[9px] font-bold text-muted-foreground/70 uppercase tracking-widest whitespace-nowrap">
            AI Detected ({detections.length})
          </span>
          <div className="flex-1 h-px bg-[#1e2433]" />
          {loading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground/40" />}
        </div>
      )}
      {detections.length === 0 ? (
        <p className="text-[9px] text-muted-foreground/45 italic py-2 flex items-center gap-1.5">
          Không có đối tượng nhận diện
          {loading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground/40" />}
        </p>
      ) : (
        <div className={cn(
          'space-y-1.5 overflow-y-auto',
          embedded ? 'max-h-[min(28vh,200px)]' : 'max-h-[140px]',
        )}>
          {detections.map(item => (
            <div
              key={item.id}
              className="p-2 rounded border border-[#1e2433] bg-[#0d1117]/80 hover:border-primary/25 transition-colors"
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <div className="flex items-center gap-1 min-w-0">
                  <ScanFace className="w-2.5 h-2.5 text-primary shrink-0" />
                  <span className="text-[8px] font-bold text-foreground/90 uppercase truncate">
                    {item.label}
                  </span>
                </div>
                <span className="text-[7px] font-bold text-green-400 bg-green-500/10 px-1 py-px rounded shrink-0">
                  {item.confidenceScore}%
                </span>
              </div>
              {item.detectionResult && (
                <div className="flex items-start gap-1">
                  <Tag className="w-2 h-2 text-muted-foreground/40 mt-0.5 shrink-0" />
                  <p className="text-[7px] text-muted-foreground/60 line-clamp-2">{item.detectionResult}</p>
                </div>
              )}
              <p className="text-[7px] text-muted-foreground/35 mt-1 tabular-nums">
                {dayjs(item.createdAt).format('HH:mm:ss')}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
