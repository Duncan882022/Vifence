import { AlertCircle } from 'lucide-react'
import { cn } from '@/utils/cn'
import { getHousekeepingImprovementList } from '../services/housekeepingKpi.service'

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

export function HousekeepingImprovementList() {
  const items = getHousekeepingImprovementList()

  return (
    <div className="flex flex-col gap-2 max-h-[320px] lg:max-h-[280px] overflow-y-auto pr-1">
      {items.map(item => (
        <div
          key={item.id}
          className="flex items-start gap-2.5 p-2 rounded-lg border border-[#1e2433] bg-[#0b0f1a] hover:border-[#2a3855]/80 transition-colors"
        >
          <img
            src={item.thumbnailUrl}
            alt={item.issueType}
            className="w-12 h-12 sm:w-14 sm:h-14 rounded object-cover shrink-0 border border-[#1e2433]"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[8px] font-bold text-orange-400 uppercase">
                {item.zoneLabel}
              </span>
              {item.floorLabel && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="text-[8px] font-semibold text-orange-300/80 uppercase">
                    {item.floorLabel}
                  </span>
                </>
              )}
            </div>
            <p className="text-[10px] text-foreground font-medium mt-0.5 truncate">{item.issueType}</p>
            <p className="text-[8px] text-muted-foreground tabular-nums mt-0.5">
              Phát hiện: {formatTime(item.detectedAt)}
            </p>
          </div>
          <AlertCircle
            className={cn(
              'w-4 h-4 shrink-0 mt-0.5',
              item.priority === 'high' ? 'text-red-400' : 'text-orange-400',
            )}
          />
        </div>
      ))}
    </div>
  )
}
