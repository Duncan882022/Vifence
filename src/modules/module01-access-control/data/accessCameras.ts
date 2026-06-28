import type { CameraFeedKey } from '@/modules/module02-training/data/trainingCameraFeeds'
import { getCameraFeedUrl } from '@/modules/module02-training/data/trainingCameraFeeds'
import type { AccessGate, AccessAiDetection, AccessGateId } from '@/types/access'

export const DEMO_ACCESS_DATE = '2026-06-24'
export const DEMO_ACCESS_DATE_LABEL = '24/06/2026'

const GATE_FEED: Record<AccessGateId, CameraFeedKey> = {
  'gate-main': 'site-gate',
  'gate-side1': 'safety-helmets',
  'gate-truck': 'yard-builders',
  'gate-side2': 'site-cranes',
}

export const ACCESS_GATES: AccessGate[] = [
  {
    id: 'gate-main',
    name: 'Cổng chính',
    cameraId: 'AC-01',
    streamUrl: getCameraFeedUrl(GATE_FEED['gate-main']),
    zone: 'OCP1-A',
  },
  {
    id: 'gate-side1',
    name: 'Cổng phụ 1',
    cameraId: 'AC-02',
    streamUrl: getCameraFeedUrl(GATE_FEED['gate-side1']),
    zone: 'OCP1-A',
  },
  {
    id: 'gate-truck',
    name: 'Cổng xe tải',
    cameraId: 'AC-03',
    streamUrl: getCameraFeedUrl(GATE_FEED['gate-truck']),
    zone: 'OCP1-B',
  },
  {
    id: 'gate-side2',
    name: 'Cổng phụ 2',
    cameraId: 'AC-04',
    streamUrl: getCameraFeedUrl(GATE_FEED['gate-side2']),
    zone: 'OCP1-B',
  },
]

export const ACCESS_GATE_OPTIONS = [
  { value: 'all', label: 'Tất cả cổng' },
  ...ACCESS_GATES.map(g => ({ value: g.id, label: g.name })),
] as const

export const ACCESS_AI_OVERLAYS: Record<AccessGateId, AccessAiDetection[]> = {
  'gate-main': [
    {
      x: 28, y: 30, w: 14, h: 42,
      kind: 'person',
      label: 'Nguyễn Văn An',
      sublabel: 'ABC Construction · NV000123',
    },
  ],
  'gate-side1': [
    {
      x: 32, y: 28, w: 13, h: 40,
      kind: 'person',
      label: 'Trần Văn Bình',
      sublabel: 'XYZ JSC · NV000456',
    },
  ],
  'gate-truck': [
    {
      x: 18, y: 38, w: 52, h: 28,
      kind: 'vehicle',
      label: '51D-123.45',
      sublabel: 'Xe vật tư',
    },
  ],
  'gate-side2': [
    {
      x: 40, y: 32, w: 12, h: 38,
      kind: 'unregistered',
      label: 'Khách vãng lai',
      sublabel: 'CHƯA ĐĂNG KÝ',
    },
  ],
}

export function getAccessGateById(id: AccessGateId): AccessGate | undefined {
  return ACCESS_GATES.find(g => g.id === id)
}

export function getAccessFeedKey(gateId: AccessGateId): CameraFeedKey {
  return GATE_FEED[gateId]
}
