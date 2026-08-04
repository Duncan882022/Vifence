/** Camera bật phân tích lòng đường backend (Module 04 AI). */
export const ROAD_ANALYSIS_CAMERA_IDS = ['A-03'] as const

/** Camera hiển thị overlay AI/label trên video — Cam 04 tạm tắt (dùng riêng). */
export const ROAD_ANALYSIS_OVERLAY_CAMERA_IDS = ['A-03'] as const

/** Tắt mọi overlay AI (face) — Cam 04 dùng CraneProximityOverlay riêng. */
export const AI_OVERLAY_DISABLED_CAMERA_IDS = [] as const

export function isRoadAnalysisCamera(cameraId: string): boolean {
  return (ROAD_ANALYSIS_CAMERA_IDS as readonly string[]).includes(cameraId)
}

export function isRoadAnalysisOverlayCamera(cameraId: string): boolean {
  return (ROAD_ANALYSIS_OVERLAY_CAMERA_IDS as readonly string[]).includes(cameraId)
}

export function isAiOverlayDisabledCamera(cameraId: string): boolean {
  return (AI_OVERLAY_DISABLED_CAMERA_IDS as readonly string[]).includes(cameraId)
}
