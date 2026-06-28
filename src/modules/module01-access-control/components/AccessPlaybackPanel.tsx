import { useEffect, useState } from 'react'
import { Play, Pause, Download, Lock } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useTrialLock } from '@/hooks/useTrialLock'
import { AccessGateVideoFeed } from './AccessGateVideoFeed'
import { ACCESS_AI_OVERLAYS, ACCESS_GATE_OPTIONS, ACCESS_GATES, DEMO_ACCESS_DATE } from '../data/accessCameras'
import { ACCESS_PLAYBACK_MARKERS } from '../services/accessKpi.service'
import type { AccessEvent, AccessGateId } from '@/types/access'

const MARKER_COLORS = {
  person: 'bg-emerald-500/70',
  vehicle: 'bg-amber-500/70',
  exception: 'bg-red-500/70',
} as const

interface AccessPlaybackPanelProps {
  selectedEvent?: AccessEvent | null
}

export function AccessPlaybackPanel({ selectedEvent }: AccessPlaybackPanelProps) {
  const [gateId, setGateId] = useState<AccessGateId>('gate-main')
  const [date, setDate] = useState(DEMO_ACCESS_DATE)
  const [timeStart, setTimeStart] = useState('06:00')
  const [timeEnd, setTimeEnd] = useState('18:00')
  const [isPlaying, setIsPlaying] = useState(false)
  const progress = 32
  const { show: showTrial } = useTrialLock()

  const gate = ACCESS_GATES.find(g => g.id === gateId) ?? ACCESS_GATES[0]
  const detections = ACCESS_AI_OVERLAYS[gateId]

  useEffect(() => {
    if (selectedEvent) {
      setGateId(selectedEvent.gateId)
    }
  }, [selectedEvent?.id, selectedEvent?.gateId])

  const overlayLabel = selectedEvent
    ? `${selectedEvent.name} · ${selectedEvent.subjectId} · ${selectedEvent.timeIn} Vào`
    : 'Nguyễn Văn An · NV000123 · 07:45:12 Vào'

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-[#1e2433] shrink-0">
        <select
          value={gateId}
          onChange={e => setGateId(e.target.value as AccessGateId)}
          className="text-[9px] bg-[#1a2235] border border-[#1e2433] rounded px-2 py-1 text-foreground"
        >
          {ACCESS_GATE_OPTIONS.filter(o => o.value !== 'all').map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="text-[9px] bg-[#1a2235] border border-[#1e2433] rounded px-2 py-1 text-foreground tabular-nums"
        />
        <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
          <input
            type="time"
            value={timeStart}
            onChange={e => setTimeStart(e.target.value)}
            className="bg-[#1a2235] border border-[#1e2433] rounded px-1.5 py-1 text-foreground tabular-nums"
          />
          <span>—</span>
          <input
            type="time"
            value={timeEnd}
            onChange={e => setTimeEnd(e.target.value)}
            className="bg-[#1a2235] border border-[#1e2433] rounded px-1.5 py-1 text-foreground tabular-nums"
          />
        </div>
        <button
          type="button"
          onClick={showTrial}
          className="ml-auto flex items-center gap-1 px-2 py-1 text-[9px] font-semibold rounded bg-[#1a2235] border border-[#1e2433] text-muted-foreground hover:text-foreground transition-colors"
        >
          <Download className="w-3 h-3" />
          Xuất clip
          <Lock className="w-2.5 h-2.5 opacity-40" />
        </button>
      </div>

      <div className="relative flex-1 min-h-[140px] bg-gray-950 overflow-hidden">
        <AccessGateVideoFeed
          cameraId={gate.cameraId}
          zone={gate.zone}
          src={gate.streamUrl}
          detections={detections}
          playing={isPlaying}
        />
        <div className="absolute top-2 left-2 right-2 pointer-events-none">
          <div className="bg-black/65 rounded px-2 py-1 max-w-[85%]">
            <p className="text-[9px] text-white font-medium truncate">{overlayLabel}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsPlaying(p => !p)}
          className="absolute bottom-3 left-3 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
      </div>

      <div className="px-3 py-2 border-t border-[#1e2433] shrink-0">
        <div className="flex items-center justify-between text-[8px] text-muted-foreground/60 mb-1 tabular-nums">
          <span>00:00</span>
          <span>12:00</span>
          <span>24:00</span>
        </div>
        <div className="relative h-3 rounded-full bg-[#1e2433] overflow-hidden">
          {ACCESS_PLAYBACK_MARKERS.map(marker => {
            const left = (marker.startHour / 24) * 100
            const width = ((marker.endHour - marker.startHour) / 24) * 100
            return (
              <div
                key={marker.id}
                title={marker.label}
                className={cn('absolute top-0 bottom-0', MARKER_COLORS[marker.kind])}
                style={{ left: `${left}%`, width: `${width}%` }}
              />
            )
          })}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white/80"
            style={{ left: `${progress}%` }}
          />
        </div>
        <div className="flex items-center gap-3 mt-1.5 text-[8px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2 h-1.5 rounded-sm bg-emerald-500/70" /> Người</span>
          <span className="flex items-center gap-1"><span className="w-2 h-1.5 rounded-sm bg-amber-500/70" /> Xe</span>
          <span className="flex items-center gap-1"><span className="w-2 h-1.5 rounded-sm bg-red-500/70" /> Ngoại lệ</span>
        </div>
      </div>
    </div>
  )
}
