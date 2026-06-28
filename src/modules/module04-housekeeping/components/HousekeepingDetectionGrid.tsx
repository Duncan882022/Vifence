import { AlertTriangle, Check } from 'lucide-react'
import { HOUSEKEEPING_DETECTION_CARDS } from '../data/housekeepingScores'

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function HousekeepingDetectionGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {HOUSEKEEPING_DETECTION_CARDS.map(card => (
        <div key={card.categoryId} className="flex flex-col gap-2 min-w-0">
          <p className="text-[9px] sm:text-[10px] font-bold text-muted-foreground uppercase tracking-wide text-center truncate px-1">
            {card.label}
          </p>

          <div className="relative rounded-lg overflow-hidden border-2 border-red-500/80 bg-[#0b0f1a]">
            <div className="absolute top-1.5 left-1.5 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-600/90">
              <AlertTriangle className="w-2.5 h-2.5 text-white" />
              <span className="text-[8px] font-bold text-white uppercase">Vi phạm</span>
            </div>
            <img
              src={card.violationImageUrl}
              alt={`Vi phạm ${card.label}`}
              className="w-full aspect-[4/3] object-cover"
            />
            <p className="text-[8px] text-red-300 px-2 py-1 bg-red-950/60 tabular-nums">
              Phát hiện: {formatTime(card.violationDetectedAt)}
            </p>
          </div>

          <div className="relative rounded-lg overflow-hidden border-2 border-sky-500/80 bg-[#0b0f1a]">
            <div className="absolute top-1.5 left-1.5 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-600/90">
              <Check className="w-2.5 h-2.5 text-white" />
              <span className="text-[8px] font-bold text-white uppercase">Đã cải thiện</span>
            </div>
            <img
              src={card.improvedImageUrl}
              alt={`Đã cải thiện ${card.label}`}
              className="w-full aspect-[4/3] object-cover"
            />
            <p className="text-[8px] text-sky-300 px-2 py-1 bg-sky-950/60 tabular-nums">
              Cập nhật: {formatTime(card.improvedAt)}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
