import type { Camera } from '@/types/camera'
import type { Event } from '@/types/event'
import type { Worker, Contractor } from '@/types/user'
import type { TrainingSession } from '@/types/training'
import type { SafetyViolation } from '@/types/safety'
import type { KPIData } from '@/types/api'

export const mockCameras: Camera[] = [
  { id: 'cam-01', name: 'Camera Cổng Chính', location: 'Cổng Chính', zone: 'Khu A', status: 'online' },
  { id: 'cam-02', name: 'Camera Tầng 1 Khu A', location: 'Tầng 1', zone: 'Khu A', status: 'online' },
  { id: 'cam-03', name: 'Camera Kho Vật Tư', location: 'Kho VT', zone: 'Khu B', status: 'online' },
  { id: 'cam-04', name: 'Camera Sân Tập', location: 'Sân Tập', zone: 'Khu C', status: 'online' },
  { id: 'cam-05', name: 'Camera Tầng 3 Khu B', location: 'Tầng 3', zone: 'Khu B', status: 'offline' },
  { id: 'cam-06', name: 'Camera Lối Ra B2', location: 'Lối Ra B2', zone: 'Khu B', status: 'online' },
  { id: 'cam-07', name: 'Camera Khu Nguy Hiểm', location: 'Khu Nguy Hiểm', zone: 'Khu D', status: 'online' },
  { id: 'cam-08', name: 'Camera Cổng Phụ', location: 'Cổng Phụ', zone: 'Khu A', status: 'error' },
]

export const mockWorkers: Worker[] = [
  { id: 'w-01', name: 'Nguyễn Văn An', code: 'NV001', contractorId: 'ct-01', contractorName: 'Công ty Xây dựng ABC', role: 'Công nhân' },
  { id: 'w-02', name: 'Trần Thị Bình', code: 'NV002', contractorId: 'ct-01', contractorName: 'Công ty Xây dựng ABC', role: 'Tổ trưởng' },
  { id: 'w-03', name: 'Lê Văn Cường', code: 'NV003', contractorId: 'ct-02', contractorName: 'Công ty Cơ Điện DEF', role: 'Kỹ thuật' },
  { id: 'w-04', name: 'Phạm Minh Đức', code: 'NV004', contractorId: 'ct-02', contractorName: 'Công ty Cơ Điện DEF', role: 'Công nhân' },
  { id: 'w-05', name: 'Hoàng Thị Em', code: 'NV005', contractorId: 'ct-03', contractorName: 'Công ty Hoàn Thiện GHI', role: 'Công nhân' },
  { id: 'w-06', name: 'Vũ Quốc Hùng', code: 'NV006', contractorId: 'ct-03', contractorName: 'Công ty Hoàn Thiện GHI', role: 'Giám sát' },
]

export const mockContractors: Contractor[] = [
  { id: 'ct-01', name: 'Công ty Xây dựng ABC', code: 'ABC', totalWorkers: 45, presentWorkers: 38 },
  { id: 'ct-02', name: 'Công ty Cơ Điện DEF', code: 'DEF', totalWorkers: 20, presentWorkers: 17 },
  { id: 'ct-03', name: 'Công ty Hoàn Thiện GHI', code: 'GHI', totalWorkers: 15, presentWorkers: 12 },
]

export const mockAccessControlKPIs: KPIData[] = [
  { label: 'Người trong công trường', value: 67, unit: 'người', change: 3, changeType: 'increase' },
  { label: 'Người vào hôm nay', value: 72, unit: 'lượt', change: 5, changeType: 'increase' },
  { label: 'Người ra hôm nay', value: 5, unit: 'lượt', change: 0, changeType: 'neutral' },
  { label: 'Khách hiện diện', value: 3, unit: 'người', change: 1, changeType: 'increase' },
]

export const mockSafetyKPIs: KPIData[] = [
  { label: 'Vi phạm hôm nay', value: 8, unit: 'vi phạm', change: -2, changeType: 'decrease' },
  { label: 'Chưa xử lý', value: 3, unit: 'vi phạm', change: -1, changeType: 'decrease' },
  { label: 'Đã xử lý', value: 5, unit: 'vi phạm', change: 2, changeType: 'increase' },
  { label: 'Tỷ lệ xử lý', value: '62.5', unit: '%', change: 5, changeType: 'increase' },
]

export const mockTrainingKPIs: KPIData[] = [
  { label: 'Khóa học hôm nay', value: 2, unit: 'khóa', change: 0, changeType: 'neutral' },
  { label: 'Tổng học viên', value: 42, unit: 'người', change: 5, changeType: 'increase' },
  { label: 'Tỷ lệ tham gia', value: '88.1', unit: '%', change: 3, changeType: 'increase' },
  { label: 'Đi muộn / Vắng', value: 5, unit: 'người', change: -2, changeType: 'decrease' },
]

export const mockHousekeepingKPIs: KPIData[] = [
  { label: 'Sự cố hôm nay', value: 6, unit: 'sự cố', change: -1, changeType: 'decrease' },
  { label: 'Chưa xử lý', value: 2, unit: 'sự cố', change: -2, changeType: 'decrease' },
  { label: 'Đã xử lý', value: 4, unit: 'sự cố', change: 1, changeType: 'increase' },
  { label: 'Thời gian xử lý TB', value: '24', unit: 'phút', change: -5, changeType: 'decrease' },
]

export const mockProductivityKPIs: KPIData[] = [
  { label: 'Lao động hiện diện', value: 67, unit: 'người', change: 3, changeType: 'increase' },
  { label: 'Mật độ lao động', value: '78', unit: '%', change: 2, changeType: 'increase' },
  { label: 'Thời gian làm việc TB', value: '7.2', unit: 'giờ', change: 0.3, changeType: 'increase' },
  { label: 'Thời gian không HĐ', value: '0.8', unit: 'giờ', change: -0.1, changeType: 'decrease' },
]

export const mockEvents: Event[] = [
  {
    id: 'ev-001', type: 'Check-in', description: 'Nguyễn Văn An vào công trường',
    timestamp: '2026-06-24T07:15:00', cameraId: 'cam-01', cameraName: 'Camera Cổng Chính',
    location: 'Cổng Chính', workerId: 'w-01', workerName: 'Nguyễn Văn An',
    contractorName: 'Công ty Xây dựng ABC', status: 'processed', severity: 'info', module: 'access-control',
  },
  {
    id: 'ev-002', type: 'Vi phạm an toàn', description: 'Không đội mũ bảo hộ tại Tầng 3',
    timestamp: '2026-06-24T08:30:00', cameraId: 'cam-05', cameraName: 'Camera Tầng 3 Khu B',
    location: 'Tầng 3 Khu B', workerId: 'w-03', workerName: 'Lê Văn Cường',
    contractorName: 'Công ty Cơ Điện DEF', status: 'pending', severity: 'critical', module: 'safety',
  },
  {
    id: 'ev-003', type: 'Vi phạm an toàn', description: 'Vào khu vực nguy hiểm không phép',
    timestamp: '2026-06-24T09:00:00', cameraId: 'cam-07', cameraName: 'Camera Khu Nguy Hiểm',
    location: 'Khu D', workerId: 'w-04', workerName: 'Phạm Minh Đức',
    contractorName: 'Công ty Cơ Điện DEF', status: 'pending', severity: 'critical', module: 'safety',
  },
  {
    id: 'ev-004', type: 'Đi muộn', description: 'Vắng mặt buổi đào tạo An toàn',
    timestamp: '2026-06-24T08:05:00', cameraId: 'cam-04', cameraName: 'Camera Sân Tập',
    location: 'Sân Tập', workerId: 'w-05', workerName: 'Hoàng Thị Em',
    contractorName: 'Công ty Hoàn Thiện GHI', status: 'pending', severity: 'warning', module: 'training',
  },
  {
    id: 'ev-005', type: 'Rác tồn đọng', description: 'Rác vật liệu chưa dọn tại Tầng 1',
    timestamp: '2026-06-24T10:15:00', cameraId: 'cam-02', cameraName: 'Camera Tầng 1 Khu A',
    location: 'Tầng 1 Khu A', status: 'pending', severity: 'warning', module: 'housekeeping',
  },
  {
    id: 'ev-006', type: 'Check-out', description: 'Trần Thị Bình rời công trường',
    timestamp: '2026-06-24T11:30:00', cameraId: 'cam-01', cameraName: 'Camera Cổng Chính',
    location: 'Cổng Chính', workerId: 'w-02', workerName: 'Trần Thị Bình',
    contractorName: 'Công ty Xây dựng ABC', status: 'processed', severity: 'info', module: 'access-control',
  },
]

export const mockTrainingSessions: TrainingSession[] = [
  {
    id: 'ts-01', title: 'An Toàn Làm Việc Trên Cao', instructor: 'Kỹ sư Nguyễn Hòa',
    location: 'Sân Tập', scheduledAt: '2026-06-24T08:00:00', endAt: '2026-06-24T10:00:00',
    status: 'completed', totalEnrolled: 25, present: 22, late: 2, absent: 1,
  },
  {
    id: 'ts-02', title: 'Phòng Chống Cháy Nổ', instructor: 'Kỹ sư Lê Tuấn',
    location: 'Phòng Họp A', scheduledAt: '2026-06-24T13:00:00', endAt: '2026-06-24T15:00:00',
    status: 'in-progress', totalEnrolled: 20, present: 18, late: 1, absent: 1,
  },
  {
    id: 'ts-03', title: 'Sử Dụng Thiết Bị Cơ Điện', instructor: 'Kỹ sư Trần Minh',
    location: 'Xưởng Kỹ Thuật', scheduledAt: '2026-06-25T09:00:00', endAt: '2026-06-25T11:00:00',
    status: 'upcoming', totalEnrolled: 15, present: 0, late: 0, absent: 0,
  },
]

export const mockSafetyViolations: SafetyViolation[] = [
  {
    id: 'sv-001', type: 'no-helmet', description: 'Không đội mũ bảo hộ tại phòng đào tạo Cọc nhồi B',
    workerId: 'w-001', workerName: 'Phạm Văn Cường', employeeCode: 'NV000789',
    contractorName: 'Delta Corp', teamName: 'Cọc nhồi B',
    location: 'Phòng Đào Tạo A2', cameraId: 'A-03', cameraName: 'OCP1-A · Cam 03',
    timestamp: '2026-06-24T08:30:00', status: 'pending',
  },
  {
    id: 'sv-002', type: 'fall', description: 'Công nhân té ngã tại sân tập — không có dây hãm',
    workerId: 'w-004', workerName: 'Hoàng Văn Em', employeeCode: 'NV000654',
    contractorName: 'XYZ JSC', teamName: 'Cọc nhồi B',
    location: 'Sân Tập A', cameraId: 'A-04', cameraName: 'OCP1-A · Cam 04',
    timestamp: '2026-06-24T09:00:00', status: 'pending',
  },
  {
    id: 'sv-003', type: 'no-vest', description: 'Không mặc áo phản quang',
    workerId: 'w-002', workerName: 'Trần Văn Bình', employeeCode: 'NV000456',
    contractorName: 'XYZ JSC', teamName: 'Toolbox A',
    location: 'Phòng Đào Tạo A1', cameraId: 'A-02', cameraName: 'OCP1-A · Cam 02',
    timestamp: '2026-06-24T10:00:00', status: 'processed', processedBy: 'Nguyễn Thị Phương', processedAt: '2026-06-24T10:30:00',
  },
]
