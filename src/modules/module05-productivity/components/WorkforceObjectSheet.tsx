import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { ObjectState } from '../types/workforceHeatmap'
import {
  needsPatrolManualIdentity,
  isPatrolManuallyIdentified,
  subscribePatrolManualIdentity,
  suggestPatrolWorkerId,
} from '../services/patrolManualIdentity.service'
import { manualIdentityDisplayForObject } from '../utils/patrolManualIdentityUi'
import { PatrolManualIdentityPanel } from './PatrolManualIdentityPanel'

interface Props {
  object: ObjectState | null
  onClose: () => void
}

export function WorkforceObjectSheet({ object, onClose }: Props) {
  const [identityTick, setIdentityTick] = useState(0)

  useEffect(() => {
    return subscribePatrolManualIdentity(() => setIdentityTick(t => t + 1))
  }, [])

  if (!object) return null
  void identityTick

  const verified = object.identity_status === 'VERIFIED'
  const display = manualIdentityDisplayForObject(object)
  const showIdentify = !verified && (
    needsPatrolManualIdentity(object.object_id, object.worker_name || object.object_id)
    || isPatrolManuallyIdentified(object.object_id)
  )
  const conf = object.position_confidence
  const accuracyM = conf > 0 ? `±${(1.2 / Math.max(0.15, conf)).toFixed(1)}m` : '—'

  return (
    <div className="absolute inset-x-0 bottom-0 z-[500] px-2 pb-2 pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-md rounded-lg border border-[#2a3348] bg-[#0d1117]/95 backdrop-blur-sm shadow-xl p-3 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-foreground truncate">{display.title}</p>
            <p className="text-[9px] text-muted-foreground">
              {display.subtitle}
              {display.unit && (
                <>
                  <span className="text-[#334155] mx-1">·</span>
                  {display.unit}
                </>
              )}
              <span className="text-[#334155] mx-1">·</span>
              {object.status}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-muted/40 text-muted-foreground" aria-label="Đóng">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[9px] text-[#94a3b8]">
          <span>Zone: <span className="text-foreground/90">{object.zone_id}</span></span>
          <span>Mode: <span className="text-foreground/90">{object.observation_mode}</span></span>
          <span>First: <span className="text-foreground/90 tabular-nums">{object.first_seen.slice(11, 19)}</span></span>
          <span>Last: <span className="text-foreground/90 tabular-nums">{object.last_seen.slice(11, 19)}</span></span>
          <span>Pos: <span className="text-foreground/90">{accuracyM}</span></span>
          <span>Face: <span className="text-foreground/90">{verified || display.unit ? 'Đã xác minh' : 'Chưa xác định'}</span></span>
        </div>
        {!verified && (object.possible_matches?.length ?? 0) > 0 && (
          <p className="text-[8px] text-amber-400/80">
            Re-ID candidate: {object.possible_matches![0].candidate_object_id}
            {' '}({(object.possible_matches![0].reid_similarity * 100).toFixed(0)}%)
          </p>
        )}
        {showIdentify && (
          <PatrolManualIdentityPanel
            objectKey={object.object_id}
            suggestedWorkerId={suggestPatrolWorkerId(object.object_id, object.worker_id)}
            cameraId={object.helmet_id}
            onAssigned={() => setIdentityTick(t => t + 1)}
          />
        )}
        <p className={cn('text-[8px]', object.status === 'ACTIVE' ? 'text-emerald-400/80' : 'text-slate-500')}>
          TTL: {object.status === 'ACTIVE' ? '0–30s ACTIVE' : '30–120s RECENTLY_OBSERVED'}
        </p>
      </div>
    </div>
  )
}
