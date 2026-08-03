import type { HousekeepingAiConfig, HousekeepingRoiZone } from '../types/housekeepingAi.types'

/** Cấu hình mặc định theo spec */
export const HOUSEKEEPING_AI_CONFIG: HousekeepingAiConfig = {
  roadOccupancyMinutes: 30,
  trashDwellMinutes: 30,
  mudThresholdPercent: 5,
  waterThresholdPercent: 5,
  checkIntervalSeconds: 5,
  snapshotEnabled: true,
  playbackEnabled: true,
  evidenceRetentionDays: 90,
}

/**
 * ROI demo — polygon chuẩn hoá 0–1 trên khung camera.
 * STORAGE exempt: không sinh cảnh báo chiếm dụng.
 */
export const HOUSEKEEPING_ROI_ZONES: HousekeepingRoiZone[] = [
  {
    id: 'roi-road-a03',
    label: 'Lòng đường — TTDV-A Cam 03',
    type: 'ROAD',
    cameraId: 'A-03',
    /**
     * Lòng đường Cam 03 — trace theo đường đỏ user (lề trái + hàng rào phải),
     * áp cho ttdv-a-cam03-test.mp4 (640×640, cùng framing).
     */
    polygon: [
      { x: 0.0000, y: 1.0000 },
      { x: 0.0800, y: 0.9000 },
      { x: 0.1400, y: 0.7800 },
      { x: 0.2400, y: 0.6600 },
      { x: 0.3600, y: 0.5800 },
      { x: 0.5000, y: 0.5400 },
      { x: 0.6400, y: 0.5800 },
      { x: 0.7600, y: 0.6600 },
      { x: 0.8800, y: 0.7600 },
      { x: 0.9600, y: 0.8800 },
      { x: 1.0000, y: 1.0000 },
    ],
  },
  {
    id: 'roi-buffer-a03',
    label: 'Lề đường — TTDV-A Cam 03',
    type: 'BUFFER',
    cameraId: 'A-03',
    polygon: [
      { x: 0.02, y: 0.38 },
      { x: 0.08, y: 0.45 },
      { x: 0.05, y: 0.90 },
      { x: 0.0, y: 0.82 },
    ],
  },
  {
    id: 'roi-road-a04',
    label: 'Lòng đường — Sân Tập A',
    type: 'ROAD',
    cameraId: 'A-04',
    polygon: [
      { x: 0.12, y: 0.42 },
      { x: 0.88, y: 0.38 },
      { x: 0.92, y: 0.72 },
      { x: 0.08, y: 0.78 },
    ],
  },
  {
    id: 'roi-buffer-a04',
    label: 'Lề đường — Sân Tập A',
    type: 'BUFFER',
    cameraId: 'A-04',
    polygon: [
      { x: 0.05, y: 0.35 },
      { x: 0.12, y: 0.42 },
      { x: 0.08, y: 0.78 },
      { x: 0.02, y: 0.68 },
    ],
  },
  {
    id: 'roi-storage-b02',
    label: 'Khu tập kết — Kho vật tư B',
    type: 'STORAGE',
    cameraId: 'B-02',
    exemptFromOccupancy: true,
    polygon: [
      { x: 0.18, y: 0.22 },
      { x: 0.82, y: 0.18 },
      { x: 0.85, y: 0.65 },
      { x: 0.15, y: 0.68 },
    ],
  },
  {
    id: 'roi-road-b05',
    label: 'Lòng đường — Hành lang B',
    type: 'ROAD',
    cameraId: 'B-05',
    polygon: [
      { x: 0.1, y: 0.5 },
      { x: 0.9, y: 0.48 },
      { x: 0.88, y: 0.85 },
      { x: 0.12, y: 0.88 },
    ],
  },
]

export function getRoiZonesForCamera(cameraId: string): HousekeepingRoiZone[] {
  return HOUSEKEEPING_ROI_ZONES.filter(z => z.cameraId === cameraId)
}
