import { cn } from '@/utils/cn'
import {
  formatPatrolTelemetryCoordinate,
  formatPatrolTelemetryHeading,
} from '../utils/patrolStreamTelemetryFormat'
import type { PatrolCameraStreamTelemetryView } from '../hooks/usePatrolCameraStreamTelemetry'

interface PatrolStreamTelemetryOverlayProps {
  telemetry: PatrolCameraStreamTelemetryView
  compact?: boolean
  showHeading?: boolean
}

export function PatrolStreamTelemetryOverlay({
  telemetry,
  compact,
  showHeading = false,
}: PatrolStreamTelemetryOverlayProps) {
  const { datetimeVn, lat, lng, heading, gpsPending } = telemetry

  return (
    <div
      className={cn(
        'absolute left-0 right-0 z-[7] pointer-events-none flex flex-col items-start gap-0.5',
        compact ? 'bottom-8 px-2' : 'bottom-10 px-3',
      )}
    >
      <p className={cn(
        'font-mono text-white/90 bg-black/55 backdrop-blur-sm rounded leading-tight',
        compact ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-1.5 py-0.5',
      )}>
        {datetimeVn}
      </p>
      <p className={cn(
        'font-mono text-white/90 bg-black/55 backdrop-blur-sm rounded leading-tight',
        compact ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-1.5 py-0.5',
      )}>
        {gpsPending
          ? 'GPS: đang chờ tín hiệu…'
          : (
            <>
              {formatPatrolTelemetryCoordinate(lat!, 'lat')}
              {'  '}
              {formatPatrolTelemetryCoordinate(lng!, 'lng')}
              {showHeading && heading != null && Number.isFinite(heading) && (
                <>
                  {' · '}
                  {formatPatrolTelemetryHeading(heading)}
                </>
              )}
            </>
          )}
      </p>
    </div>
  )
}
