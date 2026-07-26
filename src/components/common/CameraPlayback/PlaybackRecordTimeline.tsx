import { useEffect, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { Camera } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { CameraPlaybackRecord } from '@/types/cameraPlayback'

interface PlaybackRecordTimelineProps {
  records: CameraPlaybackRecord[]
  selectedRecord: CameraPlaybackRecord | null
  onSelectRecord: (record: CameraPlaybackRecord, seekSec?: number) => void
  compact?: boolean
}

export function PlaybackRecordTimeline({
  records,
  selectedRecord,
  onSelectRecord,
  compact = false,
}: PlaybackRecordTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [hourWidth, setHourWidth] = useState(48)
  const timelineWidth = 24 * hourWidth
  const now = dayjs()
  const nowLeft = ((now.hour() * 3600 + now.minute() * 60 + now.second()) / 86400) * timelineWidth

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      setHourWidth(prev => Math.min(Math.max(prev - e.deltaY * 0.3, 24), 400))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const timeToPx = (iso: string) => {
    const t = dayjs(iso)
    return ((t.hour() * 3600 + t.minute() * 60 + t.second()) / 86400) * timelineWidth
  }

  const recordWidth = (record: CameraPlaybackRecord) => {
    const start = dayjs(record.startTime)
    const end = dayjs(record.endTime)
    const startSec = start.hour() * 3600 + start.minute() * 60 + start.second()
    const endSec = end.hour() * 3600 + end.minute() * 60 + end.second()
    return Math.max(3, ((endSec - startSec) / 86400) * timelineWidth)
  }

  const continuous = records.filter(r => r.type === 'continuous' || r.type === 'continuous_event')
  const events = records.filter(r => r.type === 'event')
  const hourLabels = Array.from({ length: 25 }, (_, i) => `${i < 10 ? '0' : ''}${i}:00`)

  return (
    <div className={cn(
      'rounded-lg border border-[#1e2433] bg-[#060b14] relative overflow-hidden shrink-0',
      compact ? 'h-14' : 'h-20',
    )}>
      <div
        ref={scrollRef}
        className={cn('absolute inset-0 overflow-x-auto', compact ? 'px-3 pt-2' : 'px-4 pt-4')}
        style={{ scrollbarWidth: 'none' }}
      >
        <div className="relative h-full" style={{ width: `${timelineWidth}px` }}>
          <div className="absolute inset-x-0 bottom-3 h-3">
            {hourLabels.map((label, i) => (
              <div
                key={label}
                className="absolute bottom-0 flex flex-col items-center"
                style={{ left: `${i * hourWidth}px` }}
              >
                <div className="h-2 w-px bg-white/20" />
                <span className="absolute top-2.5 -translate-x-1/2 text-[7px] text-white/25 font-medium select-none whitespace-nowrap">
                  {label}
                </span>
              </div>
            ))}
          </div>

          <div className="absolute bottom-1 left-0 right-0 h-6 flex items-center">
            {continuous.map(record => (
              <div
                key={record.id}
                title={`${record.name} | ${dayjs(record.startTime).format('HH:mm')} — ${dayjs(record.endTime).format('HH:mm')}`}
                className="absolute h-6 flex items-center cursor-pointer group"
                style={{ left: `${timeToPx(record.startTime)}px`, width: `${recordWidth(record)}px` }}
                onClick={e => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const ratio = (e.clientX - rect.left) / rect.width
                  const durationSec = dayjs(record.endTime).diff(dayjs(record.startTime), 'second')
                  onSelectRecord(record, Math.floor(ratio * durationSec))
                }}
              >
                <div className={cn(
                  'w-full h-1.5 rounded-sm transition-all',
                  selectedRecord?.id === record.id
                    ? 'bg-primary opacity-100'
                    : 'bg-primary/35 group-hover:bg-primary/55',
                )} />
              </div>
            ))}
          </div>

          <div className="absolute inset-0 pointer-events-none">
            {events.map(record => {
              const left = timeToPx(record.startTime)
              return (
                <div
                  key={record.id}
                  className="absolute top-0 flex flex-col items-start group cursor-pointer z-20 pointer-events-auto"
                  style={{ left: `${left}px` }}
                  onClick={() => onSelectRecord(record, record.seekSec ?? 0)}
                >
                  {record.thumbnailUrl ? (
                    <img
                      src={record.thumbnailUrl}
                      className="aspect-video w-10 rounded-sm border border-primary/30 shadow"
                      alt=""
                    />
                  ) : (
                    <div className="aspect-video w-10 bg-[#1a2235] rounded-sm flex items-center justify-center">
                      <Camera className="w-2.5 h-2.5 text-white/20" />
                    </div>
                  )}
                  <div className="w-px h-6 bg-primary/30 group-hover:bg-primary/60 transition-opacity" />
                </div>
              )
            })}
          </div>

          <div
            className="absolute top-0 bottom-3 w-px bg-red-500 z-30 pointer-events-none"
            style={{ left: `${nowLeft}px` }}
          >
            <div className="w-1.5 h-1.5 bg-red-500 rounded-full -ml-[2px]" />
          </div>
        </div>
      </div>
    </div>
  )
}
