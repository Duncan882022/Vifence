import type {
  HousekeepingCategoryScore,
  HousekeepingDetectionCard,
  HousekeepingImprovementItem,
  HousekeepingOverallScore,
  HousekeepingScoreTrendPoint,
  HousekeepingZoneScore,
  ScoreTier,
} from '@/types/housekeeping'
import { DEMO_HOUSEKEEPING_TODAY } from './housekeepingIssues'
import { getHousekeepingImageUrl } from './housekeepingImages'

export const SCORE_TIER_LABELS: Record<ScoreTier, string> = {
  good: 'Tốt',
  average: 'Trung bình',
  poor: 'Kém',
}

export function getScoreTier(score: number): ScoreTier {
  if (score >= 80) return 'good'
  if (score >= 60) return 'average'
  return 'poor'
}

export const HOUSEKEEPING_OVERALL_SCORE: HousekeepingOverallScore = {
  current: 78,
  previous: 66,
  max: 100,
  tier: 'good',
  tierLabel: 'TỐT',
  hint: 'Cần cải thiện thêm để đạt > 90 điểm',
}

export const HOUSEKEEPING_SCORE_TREND: HousekeepingScoreTrendPoint[] = [
  { date: '2026-06-18', label: '18/06', score: 52 },
  { date: '2026-06-19', label: '19/06', score: 58 },
  { date: '2026-06-20', label: '20/06', score: 61 },
  { date: '2026-06-21', label: '21/06', score: 64 },
  { date: '2026-06-22', label: '22/06', score: 70 },
  { date: '2026-06-23', label: '23/06', score: 66 },
  { date: '2026-06-24', label: '24/06', score: 78 },
]

export const HOUSEKEEPING_CATEGORY_SCORES: HousekeepingCategoryScore[] = [
  { id: 'waste-pile', label: 'Rác thải', score: 65, tier: 'average', violationCount: 5 },
  { id: 'misplaced-material', label: 'Vật tư lộn xộn', score: 82, tier: 'good', violationCount: 2 },
  { id: 'standing-water', label: 'Nước đọng', score: 60, tier: 'average', violationCount: 3 },
  { id: 'messy-area', label: 'Khu vực lộn xộn', score: 85, tier: 'good', violationCount: 3 },
  { id: 'general-cleanliness', label: 'Vệ sinh chung', score: 78, tier: 'good', violationCount: 4 },
]

export const HOUSEKEEPING_ZONE_SCORES: HousekeepingZoneScore[] = [
  { id: 'khu-a', label: 'Khu A', score: 85, tier: 'good' },
  { id: 'khu-b', label: 'Khu B', score: 65, tier: 'average' },
  { id: 'khu-c', label: 'Khu C', score: 45, tier: 'poor' },
  { id: 'khu-d', label: 'Khu D', score: 82, tier: 'good' },
]

export const HOUSEKEEPING_DETECTION_CARDS: HousekeepingDetectionCard[] = [
  {
    categoryId: 'waste-pile',
    label: 'Rác thải tồn đọng',
    violationImageUrl: getHousekeepingImageUrl('waste-violation'),
    violationDetectedAt: `${DEMO_HOUSEKEEPING_TODAY}T09:15:23`,
    improvedImageUrl: getHousekeepingImageUrl('waste-improved'),
    improvedAt: `${DEMO_HOUSEKEEPING_TODAY}T11:30:12`,
  },
  {
    categoryId: 'misplaced-material',
    label: 'Vật tư lộn xộn',
    violationImageUrl: getHousekeepingImageUrl('materials-violation'),
    violationDetectedAt: `${DEMO_HOUSEKEEPING_TODAY}T08:42:10`,
    improvedImageUrl: getHousekeepingImageUrl('materials-improved'),
    improvedAt: `${DEMO_HOUSEKEEPING_TODAY}T10:05:44`,
  },
  {
    categoryId: 'standing-water',
    label: 'Nước đọng',
    violationImageUrl: getHousekeepingImageUrl('water-violation'),
    violationDetectedAt: `${DEMO_HOUSEKEEPING_TODAY}T07:55:33`,
    improvedImageUrl: getHousekeepingImageUrl('water-improved'),
    improvedAt: `${DEMO_HOUSEKEEPING_TODAY}T09:20:18`,
  },
  {
    categoryId: 'messy-area',
    label: 'Khu vực lộn xộn',
    violationImageUrl: getHousekeepingImageUrl('clutter-violation'),
    violationDetectedAt: `${DEMO_HOUSEKEEPING_TODAY}T10:18:07`,
    improvedImageUrl: getHousekeepingImageUrl('clutter-improved'),
    improvedAt: `${DEMO_HOUSEKEEPING_TODAY}T12:45:29`,
  },
]

/** Aligned with Module 02 MOCK_TRAINING_CAMERAS locations (OCP1-A / OCP1-B → Khu A/B). */
export const HOUSEKEEPING_IMPROVEMENT_LIST: HousekeepingImprovementItem[] = [
  {
    id: 'imp-01',
    thumbnailUrl: getHousekeepingImageUrl('thumb-phong-dao-tao-a2'),
    categoryId: 'waste-pile',
    zoneId: 'khu-a',
    zoneLabel: 'KHU A',
    floorLabel: 'PHÒNG ĐÀO TẠO A2',
    issueType: 'Rác thải tồn đọng',
    detectedAt: `${DEMO_HOUSEKEEPING_TODAY}T09:15:23`,
    priority: 'high',
  },
  {
    id: 'imp-02',
    thumbnailUrl: getHousekeepingImageUrl('thumb-san-thuc-hanh-b1'),
    categoryId: 'standing-water',
    zoneId: 'khu-b',
    zoneLabel: 'KHU B',
    floorLabel: 'SÂN THỰC HÀNH B1',
    issueType: 'Nước đọng sau mưa',
    detectedAt: `${DEMO_HOUSEKEEPING_TODAY}T08:30:00`,
    priority: 'high',
  },
  {
    id: 'imp-03',
    thumbnailUrl: getHousekeepingImageUrl('thumb-phong-dao-tao-a1'),
    categoryId: 'misplaced-material',
    zoneId: 'khu-a',
    zoneLabel: 'KHU A',
    floorLabel: 'PHÒNG ĐÀO TẠO A1',
    issueType: 'Vật tư lộn xộn',
    detectedAt: `${DEMO_HOUSEKEEPING_TODAY}T10:00:00`,
    priority: 'medium',
  },
  {
    id: 'imp-04',
    thumbnailUrl: getHousekeepingImageUrl('thumb-san-tap-a'),
    categoryId: 'messy-area',
    zoneId: 'khu-a',
    zoneLabel: 'KHU A',
    floorLabel: 'SÂN TẬP A',
    issueType: 'Khu vực lộn xộn',
    detectedAt: `${DEMO_HOUSEKEEPING_TODAY}T07:45:00`,
    priority: 'medium',
  },
  {
    id: 'imp-05',
    thumbnailUrl: getHousekeepingImageUrl('thumb-kho-vat-tu'),
    categoryId: 'misplaced-material',
    zoneId: 'khu-a',
    zoneLabel: 'KHU A',
    floorLabel: 'KHO VẬT TƯ',
    issueType: 'Lối đi bị chiếm dụng',
    detectedAt: `${DEMO_HOUSEKEEPING_TODAY}T11:15:00`,
    priority: 'high',
  },
]

export const HOUSEKEEPING_BENEFITS = [
  'Môi trường làm việc sạch sẽ, an toàn',
  'Giảm nguy cơ tai nạn',
  'Nâng cao hình ảnh & uy tín dự án',
  'Đáp ứng tiêu chuẩn 5S / ISO',
]

export const HOUSEKEEPING_PROCESS_STEPS = [
  { id: 'detect', label: 'AI PHÁT HIỆN', icon: 'camera' as const },
  { id: 'notify', label: 'THÔNG BÁO', icon: 'bell' as const },
  { id: 'handle', label: 'XỬ LÝ', icon: 'user' as const },
  { id: 'confirm', label: 'XÁC NHẬN', icon: 'check' as const },
  { id: 'report', label: 'BÁO CÁO', icon: 'chart' as const },
]
