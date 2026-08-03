/** Camera cố định bật phân tích lòng đường (Module 04 AI). */
export const ROAD_ANALYSIS_CAMERA_IDS = ['A-03'] as const

export function isRoadAnalysisCamera(cameraId: string): boolean {
  return (ROAD_ANALYSIS_CAMERA_IDS as readonly string[]).includes(cameraId)
}
