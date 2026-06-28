import type { AccessEvent } from '@/types/access'
import { DEMO_ACCESS_DATE } from './accessCameras'

export const ACCESS_EVENTS: AccessEvent[] = [
  {
    id: 'ae-001', subjectType: 'person', name: 'Nguyễn Văn An', subjectId: 'NV000123',
    contractorOrType: 'ABC Construction', timeIn: '07:45', timeOut: null, presence: 'inside',
    gate: 'Cổng chính', gateId: 'gate-main', duration: '3h 45p', avatarPersonId: 'w-att03', date: DEMO_ACCESS_DATE,
  },
  {
    id: 'ae-002', subjectType: 'person', name: 'Trần Văn Bình', subjectId: 'NV000456',
    contractorOrType: 'XYZ JSC', timeIn: '07:52', timeOut: null, presence: 'inside',
    gate: 'Cổng phụ 1', gateId: 'gate-side1', duration: '3h 38p', avatarPersonId: 'w-002', date: DEMO_ACCESS_DATE,
  },
  {
    id: 'ae-003', subjectType: 'vehicle', name: '51D-123.45', subjectId: '51D-123.45',
    contractorOrType: 'Xe vật tư', timeIn: '08:10', timeOut: '08:25', presence: 'outside',
    gate: 'Cổng xe tải', gateId: 'gate-truck', duration: '15p', date: DEMO_ACCESS_DATE,
  },
  {
    id: 'ae-004', subjectType: 'guest', name: 'Khách vãng lai', subjectId: '—',
    contractorOrType: 'Chưa đăng ký', timeIn: '08:18', timeOut: null, presence: 'inside',
    gate: 'Cổng phụ 2', gateId: 'gate-side2', duration: '3h 12p', date: DEMO_ACCESS_DATE,
  },
  {
    id: 'ae-005', subjectType: 'person', name: 'Lê Thị Hương', subjectId: 'NV001103',
    contractorOrType: 'ABC Construction', timeIn: '07:25', timeOut: null, presence: 'inside',
    gate: 'Cổng chính', gateId: 'gate-main', duration: '4h 05p', avatarPersonId: 'w-c03', date: DEMO_ACCESS_DATE,
  },
  {
    id: 'ae-006', subjectType: 'person', name: 'Phạm Văn An', subjectId: 'NV001132',
    contractorOrType: 'XYZ JSC', timeIn: '08:01', timeOut: null, presence: 'inside',
    gate: 'Cổng phụ 1', gateId: 'gate-side1', duration: '3h 29p', avatarPersonId: 'w-att03', date: DEMO_ACCESS_DATE,
  },
  {
    id: 'ae-007', subjectType: 'person', name: 'Hoàng Thị Ngọc', subjectId: 'NV001107',
    contractorOrType: 'XYZ JSC', timeIn: '08:00', timeOut: null, presence: 'inside',
    gate: 'Cổng chính', gateId: 'gate-main', duration: '3h 30p', avatarPersonId: 'w-c07', date: DEMO_ACCESS_DATE,
  },
  {
    id: 'ae-008', subjectType: 'person', name: 'Bùi Văn Khoa', subjectId: 'NV001108',
    contractorOrType: 'ABC Construction', timeIn: '07:57', timeOut: null, presence: 'inside',
    gate: 'Cổng chính', gateId: 'gate-main', duration: '3h 33p', avatarPersonId: 'w-c08', date: DEMO_ACCESS_DATE,
  },
  {
    id: 'ae-009', subjectType: 'vehicle', name: '51C-987.12', subjectId: '51C-987.12',
    contractorOrType: 'Xe bê tông', timeIn: '06:45', timeOut: '07:02', presence: 'outside',
    gate: 'Cổng xe tải', gateId: 'gate-truck', duration: '17p', date: DEMO_ACCESS_DATE,
  },
  {
    id: 'ae-010', subjectType: 'person', name: 'Đặng Thị Linh', subjectId: 'NV001112',
    contractorOrType: 'XYZ JSC', timeIn: '07:59', timeOut: null, presence: 'inside',
    gate: 'Cổng phụ 1', gateId: 'gate-side1', duration: '3h 31p', avatarPersonId: 'w-c12', date: DEMO_ACCESS_DATE,
  },
  {
    id: 'ae-011', subjectType: 'person', name: 'Trần Quốc Bảo', subjectId: 'NV001102',
    contractorOrType: 'XYZ JSC', timeIn: '07:29', timeOut: '11:15', presence: 'outside',
    gate: 'Cổng chính', gateId: 'gate-main', duration: '3h 46p', avatarPersonId: 'w-c02', date: DEMO_ACCESS_DATE,
  },
  {
    id: 'ae-012', subjectType: 'person', name: 'Nguyễn Văn Phú', subjectId: 'NV001202',
    contractorOrType: 'ABC Construction', timeIn: '11:30', timeOut: null, presence: 'inside',
    gate: 'Cổng chính', gateId: 'gate-main', duration: '0h 00p', avatarPersonId: 'w-a02', date: DEMO_ACCESS_DATE,
  },
  {
    id: 'ae-013', subjectType: 'person', name: 'Trần Minh Đức', subjectId: 'NV001203',
    contractorOrType: 'XYZ JSC', timeIn: '11:47', timeOut: null, presence: 'inside',
    gate: 'Cổng phụ 2', gateId: 'gate-side2', duration: '0h 00p', avatarPersonId: 'w-a03', date: DEMO_ACCESS_DATE,
  },
  {
    id: 'ae-014', subjectType: 'vehicle', name: '51F-456.78', subjectId: '51F-456.78',
    contractorOrType: 'Xe cẩu', timeIn: '09:30', timeOut: '10:45', presence: 'outside',
    gate: 'Cổng xe tải', gateId: 'gate-truck', duration: '1h 15p', date: DEMO_ACCESS_DATE,
  },
  {
    id: 'ae-015', subjectType: 'guest', name: 'Khách khảo sát', subjectId: 'KH-001',
    contractorOrType: 'Khách mời', timeIn: '09:00', timeOut: '10:30', presence: 'outside',
    gate: 'Cổng chính', gateId: 'gate-main', duration: '1h 30p', date: DEMO_ACCESS_DATE,
  },
  {
    id: 'ae-016', subjectType: 'person', name: 'Phạm Minh Tuấn', subjectId: 'NV001104',
    contractorOrType: 'DEF Electric', timeIn: '07:35', timeOut: null, presence: 'inside',
    gate: 'Cổng phụ 1', gateId: 'gate-side1', duration: '3h 55p', avatarPersonId: 'w-c04', date: DEMO_ACCESS_DATE,
  },
  {
    id: 'ae-017', subjectType: 'person', name: 'Lý Thị Mỹ Duyên', subjectId: 'NV001111',
    contractorOrType: 'ABC Construction', timeIn: '08:12', timeOut: null, presence: 'inside',
    gate: 'Cổng chính', gateId: 'gate-main', duration: '3h 18p', avatarPersonId: 'w-011', date: DEMO_ACCESS_DATE,
  },
  {
    id: 'ae-018', subjectType: 'person', name: 'Vũ Thị Thu', subjectId: 'NV001109',
    contractorOrType: 'GHI Finishing', timeIn: '07:40', timeOut: '11:00', presence: 'outside',
    gate: 'Cổng phụ 2', gateId: 'gate-side2', duration: '3h 20p', avatarPersonId: 'w-c09', date: DEMO_ACCESS_DATE,
  },
  {
    id: 'ae-019', subjectType: 'vehicle', name: '59A-222.33', subjectId: '59A-222.33',
    contractorOrType: 'Xe chở nhân sự', timeIn: '06:30', timeOut: '06:35', presence: 'outside',
    gate: 'Cổng xe tải', gateId: 'gate-truck', duration: '5p', date: DEMO_ACCESS_DATE,
  },
  {
    id: 'ae-020', subjectType: 'person', name: 'Ngô Văn Tùng', subjectId: 'NV001105',
    contractorOrType: 'DEF Electric', timeIn: '07:50', timeOut: null, presence: 'inside',
    gate: 'Cổng chính', gateId: 'gate-main', duration: '3h 40p', avatarPersonId: 'w-c05', date: DEMO_ACCESS_DATE,
  },
  {
    id: 'ae-021', subjectType: 'person', name: 'Đinh Thị Mai', subjectId: 'NV001106',
    contractorOrType: 'GHI Finishing', timeIn: '08:05', timeOut: null, presence: 'inside',
    gate: 'Cổng phụ 1', gateId: 'gate-side1', duration: '3h 25p', avatarPersonId: 'w-c06', date: DEMO_ACCESS_DATE,
  },
  {
    id: 'ae-022', subjectType: 'guest', name: 'Đại diện chủ đầu tư', subjectId: 'KH-002',
    contractorOrType: 'Khách mời', timeIn: '10:00', timeOut: null, presence: 'inside',
    gate: 'Cổng chính', gateId: 'gate-main', duration: '1h 30p', date: DEMO_ACCESS_DATE,
  },
  {
    id: 'ae-023', subjectType: 'person', name: 'Trịnh Văn Hùng', subjectId: 'NV001110',
    contractorOrType: 'DEF Electric', timeIn: '07:55', timeOut: null, presence: 'inside',
    gate: 'Cổng phụ 2', gateId: 'gate-side2', duration: '3h 35p', avatarPersonId: 'w-c11', date: DEMO_ACCESS_DATE,
  },
  {
    id: 'ae-024', subjectType: 'vehicle', name: '51B-555.66', subjectId: '51B-555.66',
    contractorOrType: 'Xe vật tư', timeIn: '11:20', timeOut: null, presence: 'inside',
    gate: 'Cổng xe tải', gateId: 'gate-truck', duration: '0h 10p', date: DEMO_ACCESS_DATE,
  },
  {
    id: 'ae-025', subjectType: 'person', name: 'Cao Thị Bích', subjectId: 'NV001201',
    contractorOrType: 'ABC Construction', timeIn: '11:28', timeOut: null, presence: 'inside',
    gate: 'Cổng chính', gateId: 'gate-main', duration: '0h 02p', avatarPersonId: 'w-a01', date: DEMO_ACCESS_DATE,
  },
]

export function filterAccessEvents(
  events: AccessEvent[],
  tab: 'all' | 'person' | 'vehicle' | 'guest',
  query: string,
): AccessEvent[] {
  let rows = events
  if (tab !== 'all') {
    rows = rows.filter(e => e.subjectType === tab)
  }
  const q = query.trim().toLowerCase()
  if (!q) return rows
  return rows.filter(e =>
    e.name.toLowerCase().includes(q)
    || e.subjectId.toLowerCase().includes(q)
    || e.contractorOrType.toLowerCase().includes(q)
    || e.gate.toLowerCase().includes(q),
  )
}

export function countAccessEventsByTab(events: AccessEvent[]): Record<'all' | 'person' | 'vehicle' | 'guest', number> {
  return {
    all: events.length,
    person: events.filter(e => e.subjectType === 'person').length,
    vehicle: events.filter(e => e.subjectType === 'vehicle').length,
    guest: events.filter(e => e.subjectType === 'guest').length,
  }
}
