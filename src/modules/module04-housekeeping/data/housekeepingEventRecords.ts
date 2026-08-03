import type { HousekeepingEventRecord } from '../types/housekeepingAi.types'
import { getHousekeepingImageUrl } from './housekeepingImages'
import { HOUSEKEEPING_DEMO_TODAY } from './housekeepingDemoDate'

const TODAY = HOUSEKEEPING_DEMO_TODAY
const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/')

function ts(hour: number, minute: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${TODAY}T${pad(hour)}:${pad(minute)}:00`
}

const SNAPSHOTS: Record<string, string> = {
  'LOG-01': getHousekeepingImageUrl('materials-violation'),
  'HK-01': getHousekeepingImageUrl('clutter-violation'),
  'HK-02': getHousekeepingImageUrl('water-violation'),
  'HK-03': getHousekeepingImageUrl('materials-violation'),
  'HK-04': getHousekeepingImageUrl('waste-violation'),
}

function buildRecord(
  id: string,
  scenarioId: string,
  groupId: 'LOG' | 'HK',
  opts: Partial<HousekeepingEventRecord> & {
    hour: number
    minute: number
    cameraId: string
    zoneId: string
    roiType: HousekeepingEventRecord['roiType']
    severity: HousekeepingEventRecord['severity']
    status: HousekeepingEventRecord['status']
  },
): HousekeepingEventRecord {
  return {
    id,
    scenarioId,
    groupId,
    zoneId: opts.zoneId,
    roiType: opts.roiType,
    sourceDeviceId: opts.cameraId,
    detectedAt: ts(opts.hour, opts.minute),
    severity: opts.severity,
    status: opts.status,
    confidence: opts.confidence ?? 0.82,
    eventSubjectType: opts.eventSubjectType ?? 'SITE_CONDITION',
    description: opts.description,
    dwellMinutes: opts.dwellMinutes,
    snapshotUrl: SNAPSHOTS[scenarioId],
    evidence: {
      fullFrameUrl: SNAPSHOTS[scenarioId],
      annotatedUrl: SNAPSHOTS[scenarioId],
      cropUrl: `${BASE}housekeeping/thumb-san-tap-a.jpg`,
      playbackUrl: opts.evidence?.playbackUrl,
    },
    assignedTo: opts.assignedTo,
    closedAt: opts.closedAt,
  }
}

export const HOUSEKEEPING_EVENT_RECORDS: HousekeepingEventRecord[] = [
  buildRecord('hk-ev-001', 'LOG-01', 'LOG', {
    hour: 7, minute: 18, cameraId: 'A-04', zoneId: 'khu-a',
    roiType: 'ROAD', severity: 'VIOLATION', status: 'DETECTED',
    eventSubjectType: 'CONSTRUCTION_ACTIVITY',
    description: 'Coppha và pallet chiếm lòng đường sân tập A > 32 phút',
    dwellMinutes: 32,
    confidence: 0.91,
  }),
  buildRecord('hk-ev-002', 'LOG-01', 'LOG', {
    hour: 8, minute: 45, cameraId: 'B-05', zoneId: 'khu-b',
    roiType: 'ROAD', severity: 'VIOLATION', status: 'ASSIGNED',
    eventSubjectType: 'CONSTRUCTION_ACTIVITY',
    description: 'Thép cuộn đặt trên lòng đường hành lang B',
    dwellMinutes: 41,
    confidence: 0.88,
    assignedTo: 'HSE · Alpha',
  }),
  buildRecord('hk-ev-003', 'LOG-01', 'LOG', {
    hour: 10, minute: 12, cameraId: 'A-04', zoneId: 'khu-a',
    roiType: 'ROAD', severity: 'CRITICAL', status: 'IN_PROGRESS',
    eventSubjectType: 'VEHICLE',
    description: 'Máy đào + ván khuôn chặn toàn bộ lối ra sân A',
    dwellMinutes: 55,
    confidence: 0.94,
    assignedTo: 'Logistics · SGC',
  }),
  buildRecord('hk-ev-004', 'HK-01', 'HK', {
    hour: 7, minute: 55, cameraId: 'B-05', zoneId: 'khu-b',
    roiType: 'ROAD', severity: 'WARNING', status: 'DETECTED',
    description: 'Vệt bùn kéo dài do xe tải kéo đất',
    confidence: 0.79,
  }),
  buildRecord('hk-ev-005', 'HK-01', 'HK', {
    hour: 9, minute: 30, cameraId: 'A-04', zoneId: 'khu-a',
    roiType: 'ROAD', severity: 'VIOLATION', status: 'ASSIGNED',
    description: 'Bùn phủ > 12% diện tích lòng đường sân tập A',
    confidence: 0.86,
    assignedTo: 'Housekeeping',
  }),
  buildRecord('hk-ev-006', 'HK-02', 'HK', {
    hour: 8, minute: 10, cameraId: 'A-03', zoneId: 'khu-a',
    roiType: 'ROAD', severity: 'WARNING', status: 'DETECTED',
    description: 'Nước đọng sau mưa — lối vào phòng đào tạo A2',
    confidence: 0.74,
  }),
  buildRecord('hk-ev-007', 'HK-02', 'HK', {
    hour: 11, minute: 5, cameraId: 'B-05', zoneId: 'khu-b',
    roiType: 'ROAD', severity: 'VIOLATION', status: 'IN_PROGRESS',
    description: 'Vũng nước sâu ảnh hưởng xe ben nội bộ',
    confidence: 0.83,
    assignedTo: 'Housekeeping',
  }),
  buildRecord('hk-ev-008', 'HK-03', 'HK', {
    hour: 8, minute: 22, cameraId: 'A-04', zoneId: 'khu-a',
    roiType: 'ROAD', severity: 'VIOLATION', status: 'DETECTED',
    eventSubjectType: 'CONSTRUCTION_ACTIVITY',
    description: 'Cát và gạch vỡ rơi vãi giữa lòng đường',
    confidence: 0.81,
  }),
  buildRecord('hk-ev-009', 'HK-03', 'HK', {
    hour: 13, minute: 40, cameraId: 'B-02', zoneId: 'khu-b',
    roiType: 'ROAD', severity: 'WARNING', status: 'CLOSED',
    description: 'Sắt vụn rơi từ xe tải — đã thu dọn',
    confidence: 0.77,
    closedAt: ts(14, 15),
  }),
  buildRecord('hk-ev-010', 'HK-04', 'HK', {
    hour: 7, minute: 35, cameraId: 'A-03', zoneId: 'khu-a',
    roiType: 'ROAD', severity: 'VIOLATION', status: 'DETECTED',
    description: 'Bao xi măng và túi nilon tồn lưu > 35 phút',
    dwellMinutes: 35,
    confidence: 0.85,
  }),
  buildRecord('hk-ev-011', 'HK-04', 'HK', {
    hour: 10, minute: 48, cameraId: 'A-04', zoneId: 'khu-a',
    roiType: 'ROAD', severity: 'VIOLATION', status: 'ASSIGNED',
    description: 'Phế liệu gỗ vụn chưa thu gom trên lối đi chính',
    dwellMinutes: 42,
    confidence: 0.8,
    assignedTo: 'Housekeeping',
  }),
  buildRecord('hk-ev-012', 'LOG-01', 'LOG', {
    hour: 14, minute: 5, cameraId: 'A-04', zoneId: 'khu-a',
    roiType: 'BUFFER', severity: 'WARNING', status: 'DETECTED',
    eventSubjectType: 'CONSTRUCTION_ACTIVITY',
    description: 'Pallet lấn lề đường — theo dõi, chưa chặn lòng đường',
    dwellMinutes: 18,
    confidence: 0.72,
  }),
  buildRecord('hk-ev-013', 'HK-02', 'HK', {
    hour: 15, minute: 20, cameraId: 'A-03', zoneId: 'khu-a',
    roiType: 'ROAD', severity: 'WARNING', status: 'CLOSED',
    description: 'Nước rò từ bồn rửa xe — đã hút nước',
    confidence: 0.7,
    closedAt: ts(15, 55),
  }),
  buildRecord('hk-ev-014', 'HK-01', 'HK', {
    hour: 16, minute: 8, cameraId: 'B-05', zoneId: 'khu-b',
    roiType: 'ROAD', severity: 'WARNING', status: 'DETECTED',
    description: 'Lớp bùn mỏng do bánh xe kéo từ khu đào',
    confidence: 0.68,
  }),
  buildRecord('hk-ev-015', 'LOG-01', 'LOG', {
    hour: 6, minute: 50, cameraId: 'B-05', zoneId: 'khu-b',
    roiType: 'ROAD', severity: 'VIOLATION', status: 'CLOSED',
    eventSubjectType: 'CONSTRUCTION_ACTIVITY',
    description: 'Container tạm đặt sai vị trí — đã di chuyển',
    dwellMinutes: 38,
    confidence: 0.9,
    closedAt: ts(8, 10),
  }),
]

export function getAllHousekeepingEventRecords(): HousekeepingEventRecord[] {
  return [...HOUSEKEEPING_EVENT_RECORDS].sort(
    (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
  )
}
