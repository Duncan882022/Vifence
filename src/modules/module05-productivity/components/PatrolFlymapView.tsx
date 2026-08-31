/**
 * Flymap — thay heatmap site khi bật toggle: luồng DR-* + overlay mật độ JET tầm cao.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Radio } from 'lucide-react'
import { cn } from '@/utils/cn'
import { CameraVideoFeed } from '@/modules/module02-training/components/CameraVideoFeed'
import type { TrainingCamera } from '@/modules/module02-training/data/trainingCameras'
import {
  fetchPatrolDroneHeatmapBlobUrl,
  fetchPatrolDroneHeatmapMetrics,
  type PatrolDroneHeatmapMetrics,
} from '../services/patrolFlymap.service'
import type { PatrolFlightMode } from '../utils/patrolFlightMode'
import { patrolFlightModeShortLabel } from '../utils/patrolFlightMode'
import { PATROL_DRONE_LABELS } from '../data/patrolDrones'
import { usePatrolHeatmapViewport } from '../hooks/usePatrolHeatmapViewport'

const HEATMAP_POLL_MS = 30_000

interface PatrolFlymapViewProps {
  droneCamera: TrainingCamera
  flightMode?: PatrolFlightMode
  streamOnline?: boolean
  expanded?: boolean
}

export function PatrolFlymapView({
  droneCamera,
  flightMode = 'aerial',
  streamOnline = false,
  expanded = false,
}: PatrolFlymapViewProps) {
  const viewport = usePatrolHeatmapViewport()
  const [heatmapUrl, setHeatmapUrl] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<PatrolDroneHeatmapMetrics | null>(null)
  const blobRef = useRef<string | null>(null)

  const label = PATROL_DRONE_LABELS[droneCamera.id] ?? droneCamera.name

  useEffect(() => {
    let cancelled = false

    const refresh = async () => {
      const [blobUrl, nextMetrics] = await Promise.all([
        fetchPatrolDroneHeatmapBlobUrl(droneCamera.id),
        fetchPatrolDroneHeatmapMetrics(droneCamera.id),
      ])
      if (cancelled) return
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current)
        blobRef.current = null
      }
      if (blobUrl) {
        blobRef.current = blobUrl
        setHeatmapUrl(blobUrl)
      }
      if (nextMetrics) setMetrics(nextMetrics)
    }

    void refresh()
    const timer = window.setInterval(() => { void refresh() }, HEATMAP_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current)
        blobRef.current = null
      }
    }
  }, [droneCamera.id])

  const personCount = useMemo(() => {
    if (metrics) return metrics.trackCount || metrics.framePersonCount || metrics.personCount
    return 0
  }, [metrics])

  return (
    <div
      className={cn(
        'relative min-w-0 bg-[#050810] overflow-hidden',
        expanded ? viewport.modalMapClass : viewport.embeddedMapClass,
      )}
    >
      <div className="absolute inset-0">
        <CameraVideoFeed
          cameraId={droneCamera.id}
          streamType="flycam"
          src={droneCamera.streamUrl ?? ''}
          whepUrl={droneCamera.whepUrl}
          playing={Boolean(droneCamera.streamUrl)}
          aiOverlay={streamOnline}
          compact={!expanded}
          analyzeThrottle={false}
        />
      </div>

      {heatmapUrl && (
        <img
          src={heatmapUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover pointer-events-none mix-blend-screen opacity-[0.72]"
          decoding="async"
        />
      )}

      <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5 rounded border border-[#334155] bg-[#111827]/90 px-2 py-1 pointer-events-none">
        <Radio className={cn('w-3 h-3', streamOnline ? 'text-sky-400 animate-pulse' : 'text-muted-foreground')} aria-hidden />
        <span className="text-[9px] font-semibold text-foreground uppercase tracking-wide">Flymap</span>
        <span className="text-[8px] text-muted-foreground">· {label}</span>
      </div>

      <div className="absolute bottom-2 right-2 z-20 rounded border border-[#334155] bg-[#111827]/92 px-2.5 py-1.5 pointer-events-none space-y-0.5">
        <p className="text-[9px] text-muted-foreground uppercase tracking-wide">
          {patrolFlightModeShortLabel(flightMode)}
        </p>
        <p className="text-[11px] font-semibold tabular-nums text-sky-300">
          {personCount} người trong khung
        </p>
        {!heatmapUrl && (
          <p className="text-[8px] text-muted-foreground/80">Đang chờ heatmap…</p>
        )}
      </div>
    </div>
  )
}
