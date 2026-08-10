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
    polygon: [
      { x: 0.06, y: 0.56 },
      { x: 0.94, y: 0.56 },
      { x: 0.94, y: 0.98 },
      { x: 0.06, y: 0.98 },
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
