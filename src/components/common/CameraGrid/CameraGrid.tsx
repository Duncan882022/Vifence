import { useState } from 'react'
import { Maximize2, Wifi, WifiOff, AlertTriangle } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { Camera, CameraLayout } from '@/types/camera'

interface CameraGridProps {
  cameras: Camera[]
  onSelectCamera?: (camera: Camera) => void
  selectedCameraId?: string
  className?: string
}

const layoutConfig: Record<CameraLayout, { cols: string; rows: string; maxCams: number }> = {
  '1x1': { cols: 'grid-cols-1', rows: 'grid-rows-1', maxCams: 1 },
  '2x2': { cols: 'grid-cols-2', rows: 'grid-rows-2', maxCams: 4 },
  '4x4': { cols: 'grid-cols-4', rows: 'grid-rows-4', maxCams: 16 },
  '8x8': { cols: 'grid-cols-8', rows: 'grid-rows-8', maxCams: 64 },
}

const layoutLabels: CameraLayout[] = ['1x1', '2x2', '4x4', '8x8']

function CameraCell({ camera, isSelected, onClick }: {
  camera: Camera
  isSelected: boolean
  onClick: () => void
}) {
  const statusColor = camera.status === 'online' ? 'text-green-400' : camera.status === 'offline' ? 'text-gray-500' : 'text-red-400'

  return (
    <div
      onClick={onClick}
      className={cn(
        'relative bg-gray-900 rounded-md overflow-hidden cursor-pointer border-2 transition-colors group aspect-video',
        isSelected ? 'border-primary' : 'border-border hover:border-primary/50',
      )}
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        {camera.status === 'offline' ? (
          <WifiOff className="w-8 h-8 text-gray-600" />
        ) : camera.status === 'error' ? (
          <AlertTriangle className="w-8 h-8 text-red-600" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-950 flex items-center justify-center">
            <div className="text-center">
              <Wifi className="w-8 h-8 text-gray-700 mx-auto mb-1" />
              <p className="text-xs text-gray-600">Live Feed</p>
            </div>
          </div>
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-white/90 font-medium truncate leading-tight">{camera.name}</p>
          <div className={cn('flex items-center gap-1', statusColor)}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
          </div>
        </div>
        <p className="text-[9px] text-white/50 leading-tight">{camera.location}</p>
      </div>

      <button className="absolute top-1 right-1 p-1 rounded bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
        <Maximize2 className="w-3 h-3 text-white" />
      </button>
    </div>
  )
}

export function CameraGrid({ cameras, onSelectCamera, selectedCameraId, className }: CameraGridProps) {
  const [layout, setLayout] = useState<CameraLayout>('2x2')
  const { cols, maxCams } = layoutConfig[layout]
  const displayCameras = cameras.slice(0, maxCams)

  return (
    <div className={cn('flex flex-col gap-3 flex-1 min-h-0', className)}>
      <div className="flex items-center justify-between shrink-0">
        <p className="text-xs text-muted-foreground">
          {cameras.filter(c => c.status === 'online').length}/{cameras.length} camera online
        </p>
        <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
          {layoutLabels.map((l) => (
            <button
              key={l}
              onClick={() => setLayout(l)}
              className={cn(
                'px-2 py-0.5 rounded text-xs font-medium transition-colors',
                layout === l ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className={cn('grid gap-1.5 flex-1', cols)}>
        {displayCameras.map((camera) => (
          <CameraCell
            key={camera.id}
            camera={camera}
            isSelected={camera.id === selectedCameraId}
            onClick={() => onSelectCamera?.(camera)}
          />
        ))}
        {Array.from({ length: Math.max(0, maxCams - displayCameras.length) }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="bg-muted/30 border border-dashed border-border rounded-md aspect-video flex items-center justify-center"
          >
            <p className="text-xs text-muted-foreground/30">Không có camera</p>
          </div>
        ))}
      </div>
    </div>
  )
}
