import type { AccessException, AccessExceptionType, AccessExceptionAction } from '@/types/access'

export const EXCEPTION_TYPE_LABELS: Record<AccessExceptionType, string> = {
  'unregistered-guest': 'Khách chưa đăng ký',
  'late-arrival': 'Đi muộn',
  'early-departure': 'Về sớm',
  'after-hours-vehicle': 'Xe ngoài giờ',
  'overstayed': 'Quá thời gian lưu trú',
}

export const EXCEPTION_ACTION_LABELS: Record<AccessExceptionAction, string> = {
  register: 'Đăng ký',
  explain: 'Giải trình',
  fine: 'Xử phạt',
  notify: 'Thông báo',
}

export const ACCESS_EXCEPTIONS: AccessException[] = [
  {
    id: 'ax-001',
    type: 'unregistered-guest',
    subject: 'Khách vãng lai',
    time: '08:18',
    gate: 'Cổng phụ 2',
    action: 'register',
    severity: 'high',
  },
  {
    id: 'ax-002',
    type: 'late-arrival',
    subject: 'Trần Minh Đức · NV001203',
    time: '11:47',
    gate: 'Cổng phụ 2',
    action: 'explain',
    severity: 'medium',
  },
  {
    id: 'ax-003',
    type: 'early-departure',
    subject: 'Trần Quốc Bảo · NV001102',
    time: '11:15',
    gate: 'Cổng chính',
    action: 'explain',
    severity: 'medium',
  },
  {
    id: 'ax-004',
    type: 'after-hours-vehicle',
    subject: '51B-555.66 · Xe vật tư',
    time: '11:20',
    gate: 'Cổng xe tải',
    action: 'fine',
    severity: 'high',
  },
  {
    id: 'ax-005',
    type: 'overstayed',
    subject: 'Đại diện chủ đầu tư · KH-002',
    time: '10:00',
    gate: 'Cổng chính',
    action: 'notify',
    severity: 'medium',
  },
]
