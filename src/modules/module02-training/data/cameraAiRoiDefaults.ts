import type { CameraAiModelId, CameraAiRoiZone } from '../types/cameraAi.types'
import { HOUSEKEEPING_ROI_ZONES } from '@/modules/module04-housekeeping/data/housekeepingRoiConfig'

/** Polygon mặc định cho model cần ROI — mirror backend crane_roi_config.py */
const CRANE_ROI_ZONES: CameraAiRoiZone[] = [
  {
    id: 'roi-crane-body-a04',
    label: 'Thân máy cẩu — TTDV-A Cam 04',
    type: 'CRANE_BODY',
    pixelsPerMeter: 92,
    polygon: [
      { x: 0.18, y: 0.10 },
      { x: 0.82, y: 0.10 },
      { x: 0.78, y: 0.54 },
      { x: 0.22, y: 0.50 },
    ],
  },
  {
    id: 'roi-crane-work-a04',
    label: 'Vùng làm việc gần cẩu — Cam 04',
    type: 'CRANE_WORK',
    /** Bám lòng đường/bãi làm việc phía trước — cùng trace roi-road-a04. */
    polygon: [
      { x: 0.02, y: 1.0000 },
      { x: 0.98, y: 1.0000 },
      { x: 0.88, y: 0.52 },
      { x: 0.12, y: 0.48 },
      { x: 0.02, y: 0.72 },
    ],
  },
]

const MODEL_ROI_BY_CAMERA: Partial<Record<CameraAiModelId, (cameraId: string) => CameraAiRoiZone[]>> = {
  road_material: (cameraId) =>
    HOUSEKEEPING_ROI_ZONES
      .filter(z => z.cameraId === cameraId)
      .map(z => ({
        id: z.id,
        label: z.label,
        type: z.type,
        polygon: z.polygon,
        exemptFromOccupancy: z.exemptFromOccupancy,
      })),
  crane_proximity: (cameraId) =>
    cameraId === 'A-04' ? CRANE_ROI_ZONES : [],
}

export function getDefaultRoiZonesForModel(
  cameraId: string,
  modelId: CameraAiModelId,
): CameraAiRoiZone[] {
  const resolver = MODEL_ROI_BY_CAMERA[modelId]
  return resolver ? resolver(cameraId) : []
}
