import { useCallback, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/utils/cn'
import { CameraPlaybackPanel } from '@/components/common/CameraPlayback'
import type { CameraPlaybackPanelProps } from '@/components/common/CameraPlayback/CameraPlaybackPanel'
import type { PatrolEvent } from '../data/patrolTypes'
import {
  createPatrolPlaybackFetchers,
  isPatrolPlaybackConfigured,
  type PatrolPlaybackFetchError,
} from '../services/patrolPlayback.service'

type PatrolPlaybackPanelProps = Omit<
  CameraPlaybackPanelProps,
  'fetchRecords' | 'fetchDetections'
> & {
  patrolEvents: PatrolEvent[]
}

export function PatrolPlaybackPanel({
  patrolEvents,
  ...panelProps
}: PatrolPlaybackPanelProps) {
  const configured = isPatrolPlaybackConfigured()
  const [loadError, setLoadError] = useState<PatrolPlaybackFetchError>(null)
  const patrolEventsRef = useRef(patrolEvents)
  patrolEventsRef.current = patrolEvents

  const fetchRecords = useCallback(
    async (
      cameraId: string,
      params: { startDate: string; endDate: string },
    ) => {
      if (!configured) {
        setLoadError('unconfigured')
        return { items: [] }
      }
      try {
        setLoadError(null)
        return await createPatrolPlaybackFetchers(patrolEventsRef.current)
          .fetchRecords(cameraId, params)
      } catch {
        setLoadError('network')
        return { items: [] }
      }
    },
    [configured],
  )

  const fetchDetections = useCallback(
    async (recordId: string) => createPatrolPlaybackFetchers(patrolEventsRef.current)
      .fetchDetections(recordId),
    [],
  )

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2">
      {!configured && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200/90 shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
          <p>
            Chưa cấu hình Playback Server (MediaMTX). Build lại với{' '}
            <code className="text-amber-100">VITE_MEDIAMTX_PLAYBACK_URL</code>.
          </p>
        </div>
      )}

      {loadError === 'network' && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[11px] text-red-200/90 shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
          <p>
            Không kết nối được Playback Server. Kiểm tra mạng hoặc proxy{' '}
            <code className="text-red-100">/mediamtx/playback</code> trên VPS.
          </p>
        </div>
      )}

      <div className={cn('flex flex-col flex-1 min-h-0')}>
        <CameraPlaybackPanel
          {...panelProps}
          preferRecordType="continuous"
          fetchRecords={fetchRecords}
          fetchDetections={fetchDetections}
        />
      </div>
    </div>
  )
}
