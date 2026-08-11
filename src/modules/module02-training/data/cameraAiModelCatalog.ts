import type { CameraAiModelDefinition } from '../types/cameraAi.types'

/** Danh mục model / pipeline AI — nguồn listing cấu hình camera. */
export const CAMERA_AI_MODEL_CATALOG: CameraAiModelDefinition[] = [
  {
    id: 'face_demo',
    label: 'Nhận diện khuôn mặt',
    groupId: 'DEMO',
    scenarioIds: [],
    description: 'Overlay bbox người trên clip CCTV — chạy client-side, không cần backend.',
    needsPolygon: false,
    overlayKind: 'face',
  },
  {
    id: 'road_material',
    label: 'Lòng đường',
    groupId: 'BPTC',
    scenarioIds: ['BPTC-007', 'BPTC-008', 'BPTC-009', 'BPTC-001'],
    description: 'Bùn, nước đọng, vật cản (bbox) + lưới bao che thiếu/hở/bẩn (polygon xanh). Auto-train road_material + safety_mesh_cover.',
    needsPolygon: true,
    polygonHint: 'Vẽ ROAD (+ MESH tùy chọn).',
    endpoint: '/analyze/road/frame',
    autoTrainTasks: ['road_material', 'safety_mesh_cover'],
    overlayKind: 'road',
    modelVersion: 'v3',
    modelMetric: 'mAP50 0.82 · mesh HSV',
    videoSegments: [{ startSec: 0, endSec: 10.05 }],
  },
  {
    id: 'crane_proximity',
    label: 'Gần máy cẩu',
    groupId: 'DZ',
    scenarioIds: ['DZ-003'],
    description: 'Khoảng cách người–máy cẩu/khoan/xúc. Auto-train crane_machinery v4.',
    needsPolygon: true,
    polygonHint: 'Cần CRANE_BODY (hiệu chuẩn mét) + CRANE_WORK.',
    endpoint: '/analyze/crane/frame',
    autoTrainTasks: ['crane_machinery'],
    overlayKind: 'crane',
    videoSegments: [{ startSec: 0, endSec: 9.8 }],
    modelVersion: 'v4',
    modelMetric: 'manual calibrated',
  },
  {
    id: 'ppe',
    label: 'PPE',
    groupId: 'PPE',
    scenarioIds: ['PPE-001', 'PPE-002', 'PPE-003'],
    description: 'Phát hiện vi phạm PPE theo người. Models: ppe_helmet, ppe_vest (YOLO) + heuristic giày.',
    needsPolygon: false,
    endpoint: '/analyze/ppe/frame',
    autoTrainTasks: ['ppe_helmet', 'ppe_vest', 'ppe_shoes'],
    overlayKind: 'ppe',
    videoSegments: [{ startSec: 10, endSec: 14.95 }],
    modelVersion: 'v2',
    modelMetric: 'helmet 0.66 · vest 0.73 · shoes 0.92',
  },
  {
    id: 'pccc',
    label: 'PCCC',
    groupId: 'PCCC',
    scenarioIds: ['PCCC-001', 'PCCC-002'],
    description: 'Phát hiện hút thuốc và dấu hiệu lửa. Demo frame + heuristic/mobile YOLO.',
    needsPolygon: false,
    endpoint: '/analyze/pccc/frame',
    overlayKind: 'pccc',
    videoSegments: [{ startSec: 14.95, endSec: 19.95 }],
  },
  {
    id: 'wah',
    label: 'WAH',
    groupId: 'WAH',
    scenarioIds: ['WAH-001'],
    description: 'Làm việc mép biên không dây an toàn.',
    needsPolygon: false,
    endpoint: '/analyze/wah/frame',
    overlayKind: 'wah',
    videoSegments: [{ startSec: 19.95, endSec: 24.95 }],
  },
  {
    id: 'atgt_traffic',
    label: 'ATGT',
    groupId: 'ATGT',
    scenarioIds: ['ATGT-002', 'ATGT-004'],
    description: 'Vượt tốc độ + làn phân cách cứng.',
    needsPolygon: false,
    endpoint: '/analyze/atgt/frame',
    overlayKind: 'atgt',
    videoSegments: [
      { startSec: 0, endSec: 10.5 },
      { startSec: 10.5, endSec: 15.05 },
    ],
  },
  {
    id: 'mobile_smoking_fire',
    label: 'Hút thuốc / cháy',
    groupId: 'PCCC',
    scenarioIds: ['PCCC-001', 'PCCC-002'],
    description: 'Luồng camera thiết bị (MOB-01/02). Endpoint: /analyze/frame.',
    needsPolygon: false,
    endpoint: '/analyze/frame',
    overlayKind: 'mobile',
  },
]

export const CAMERA_AI_MODEL_MAP = new Map(
  CAMERA_AI_MODEL_CATALOG.map(m => [m.id, m]),
)

export function getCameraAiModel(id: string): CameraAiModelDefinition | undefined {
  return CAMERA_AI_MODEL_MAP.get(id as CameraAiModelDefinition['id'])
}

export function listModelsRequiringPolygon(): CameraAiModelDefinition[] {
  return CAMERA_AI_MODEL_CATALOG.filter(m => m.needsPolygon)
}
