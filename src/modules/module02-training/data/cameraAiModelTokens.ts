import type { LucideIcon } from 'lucide-react'
import { Cpu } from 'lucide-react'
import type { CameraAiModelId } from '../types/cameraAi.types'
import type { SafetyGroupId } from '@/modules/module03-safety/types/safety.types'
import {
  GROUP_BADGE,
  GROUP_COLORS,
  GROUP_ICONS,
} from '@/modules/module03-safety/utils/safetyDashboardUi'
import { CAMERA_AI_MODEL_CATALOG, getCameraAiModel } from './cameraAiModelCatalog'

/** Màu đại diện + ROI/bbox — đồng bộ nhóm ATLĐ (GROUP_COLORS). */
export interface CameraAiModelVisual {
  groupId: SafetyGroupId | 'DEMO'
  icon: LucideIcon
  text: string
  badge: string
  cardChecked: string
  cardIdle: string
  button: string
  roiStroke: string
  roiFill: string
  subjectBorder: string
  subjectFill: string
  subjectLabel: string
  subjectBg: string
  violationBorder: string
  violationFill: string
  violationLabel: string
  violationBg: string
}

const DEMO_VISUAL: CameraAiModelVisual = {
  groupId: 'DEMO',
  icon: Cpu,
  text: 'text-gray-300',
  badge: 'bg-gray-500/10 text-gray-300 border-gray-500/30',
  cardChecked: 'border-gray-400/40 bg-gray-500/10',
  cardIdle: 'border-[#1e2433] bg-[#0b0f1a]',
  button: 'bg-gray-500/20 border-gray-500/40 text-gray-200 hover:bg-gray-500/30',
  roiStroke: 'rgba(156, 163, 175, 0.85)',
  roiFill: 'rgba(107, 114, 128, 0.14)',
  subjectBorder: 'border-gray-400/80',
  subjectFill: 'bg-gray-400/10',
  subjectLabel: 'text-gray-200',
  subjectBg: 'bg-gray-600/35',
  violationBorder: 'border-gray-400/90',
  violationFill: 'bg-gray-500/16',
  violationLabel: 'text-gray-100',
  violationBg: 'bg-gray-600/40',
}

function buildVisual(groupId: SafetyGroupId, overrides?: Partial<CameraAiModelVisual>): CameraAiModelVisual {
  const base: Record<SafetyGroupId, Omit<CameraAiModelVisual, 'groupId' | 'icon'>> = {
    PPE: {
      text: GROUP_COLORS.PPE,
      badge: GROUP_BADGE.PPE,
      cardChecked: 'border-sky-500/45 bg-sky-500/10',
      cardIdle: 'border-[#1e2433] bg-[#0b0f1a]',
      button: 'bg-sky-500/20 border-sky-500/40 text-sky-200 hover:bg-sky-500/30',
      roiStroke: 'rgba(56, 189, 248, 0.95)',
      roiFill: 'rgba(14, 165, 233, 0.16)',
      subjectBorder: 'border-sky-400/75',
      subjectFill: 'bg-sky-400/10',
      subjectLabel: 'text-sky-200',
      subjectBg: 'bg-sky-600/30',
      violationBorder: 'border-red-400/95',
      violationFill: 'bg-red-500/18',
      violationLabel: 'text-red-200',
      violationBg: 'bg-red-600/40',
    },
    WAH: {
      text: GROUP_COLORS.WAH,
      badge: GROUP_BADGE.WAH,
      cardChecked: 'border-orange-500/45 bg-orange-500/10',
      cardIdle: 'border-[#1e2433] bg-[#0b0f1a]',
      button: 'bg-orange-500/20 border-orange-500/40 text-orange-200 hover:bg-orange-500/30',
      roiStroke: 'rgba(251, 146, 60, 0.95)',
      roiFill: 'rgba(249, 115, 22, 0.16)',
      subjectBorder: 'border-orange-400/85',
      subjectFill: 'bg-orange-500/12',
      subjectLabel: 'text-orange-100',
      subjectBg: 'bg-orange-600/35',
      violationBorder: 'border-red-400/95',
      violationFill: 'bg-red-500/18',
      violationLabel: 'text-red-200',
      violationBg: 'bg-red-600/40',
    },
    DZ: {
      text: GROUP_COLORS.DZ,
      badge: GROUP_BADGE.DZ,
      cardChecked: 'border-amber-500/45 bg-amber-500/10',
      cardIdle: 'border-[#1e2433] bg-[#0b0f1a]',
      button: 'bg-amber-500/20 border-amber-500/40 text-amber-200 hover:bg-amber-500/30',
      roiStroke: 'rgba(251, 191, 36, 0.95)',
      roiFill: 'rgba(245, 158, 11, 0.16)',
      subjectBorder: 'border-amber-400/85',
      subjectFill: 'bg-amber-400/10',
      subjectLabel: 'text-amber-200',
      subjectBg: 'bg-amber-600/35',
      violationBorder: 'border-red-400/95',
      violationFill: 'bg-red-500/18',
      violationLabel: 'text-red-200',
      violationBg: 'bg-red-600/40',
    },
    ATGT: {
      text: GROUP_COLORS.ATGT,
      badge: GROUP_BADGE.ATGT,
      cardChecked: 'border-cyan-500/45 bg-cyan-500/10',
      cardIdle: 'border-[#1e2433] bg-[#0b0f1a]',
      button: 'bg-cyan-500/20 border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/30',
      roiStroke: 'rgba(34, 211, 238, 0.95)',
      roiFill: 'rgba(6, 182, 212, 0.16)',
      subjectBorder: 'border-gray-400/80',
      subjectFill: 'bg-gray-400/10',
      subjectLabel: 'text-gray-200',
      subjectBg: 'bg-gray-600/35',
      violationBorder: 'border-cyan-400/95',
      violationFill: 'bg-cyan-500/18',
      violationLabel: 'text-cyan-200',
      violationBg: 'bg-cyan-600/40',
    },
    BPTC: {
      text: GROUP_COLORS.BPTC,
      badge: GROUP_BADGE.BPTC,
      cardChecked: 'border-violet-500/45 bg-violet-500/10',
      cardIdle: 'border-[#1e2433] bg-[#0b0f1a]',
      button: 'bg-violet-500/20 border-violet-500/40 text-violet-200 hover:bg-violet-500/30',
      roiStroke: 'rgba(167, 139, 250, 0.95)',
      roiFill: 'rgba(139, 92, 246, 0.18)',
      subjectBorder: 'border-violet-400/80',
      subjectFill: 'bg-violet-400/10',
      subjectLabel: 'text-violet-200',
      subjectBg: 'bg-violet-600/35',
      violationBorder: 'border-orange-400/95',
      violationFill: 'bg-orange-500/16',
      violationLabel: 'text-orange-200',
      violationBg: 'bg-orange-600/40',
    },
    PCCC: {
      text: GROUP_COLORS.PCCC,
      badge: GROUP_BADGE.PCCC,
      cardChecked: 'border-red-500/45 bg-red-500/10',
      cardIdle: 'border-[#1e2433] bg-[#0b0f1a]',
      button: 'bg-red-500/20 border-red-500/40 text-red-200 hover:bg-red-500/30',
      roiStroke: 'rgba(248, 113, 113, 0.95)',
      roiFill: 'rgba(239, 68, 68, 0.16)',
      subjectBorder: 'border-red-400/80',
      subjectFill: 'bg-red-400/10',
      subjectLabel: 'text-red-200',
      subjectBg: 'bg-red-600/35',
      violationBorder: 'border-red-400/95',
      violationFill: 'bg-red-500/18',
      violationLabel: 'text-red-100',
      violationBg: 'bg-red-600/40',
    },
  }

  return {
    groupId,
    icon: GROUP_ICONS[groupId],
    ...base[groupId],
    ...overrides,
  }
}

export const CAMERA_AI_MODEL_VISUAL: Record<CameraAiModelId, CameraAiModelVisual> = {
  face_demo: DEMO_VISUAL,
  road_material: buildVisual('BPTC'),
  crane_proximity: buildVisual('DZ'),
  ppe: buildVisual('PPE'),
  pccc: buildVisual('PCCC'),
  wah: buildVisual('WAH'),
  atgt_traffic: buildVisual('ATGT'),
  mobile_smoking_fire: buildVisual('PCCC', {
    badge: 'bg-red-500/10 text-red-300 border-red-500/35',
    button: 'bg-red-500/20 border-red-500/40 text-red-200 hover:bg-red-500/30',
  }),
}

export function getCameraAiModelVisual(modelId: CameraAiModelId): CameraAiModelVisual {
  return CAMERA_AI_MODEL_VISUAL[modelId]
}

export interface CameraAiConfigSection {
  title: string
  subtitle: string
  modelIds: CameraAiModelId[]
}

/** Popup cấu hình — chỉ model áp dụng cho từng camera. */
export const CAMERA_AI_CONFIG_SECTIONS: Record<string, CameraAiConfigSection[]> = {
  'A-03': [
    { title: 'Vệ sinh môi trường', subtitle: 'BPTC · Lòng đường', modelIds: ['road_material'] },
    { title: 'An toàn giao thông', subtitle: 'ATGT · Tốc độ & làn', modelIds: ['atgt_traffic'] },
  ],
  'A-04': [
    { title: 'Khoảng cách an toàn', subtitle: 'DZ · Máy cẩu', modelIds: ['crane_proximity'] },
    { title: 'Bảo hộ cá nhân', subtitle: 'PPE', modelIds: ['ppe'] },
    { title: 'Phòng cháy chữa cháy', subtitle: 'PCCC', modelIds: ['pccc'] },
    { title: 'Làm việc trên cao', subtitle: 'WAH · Dây an toàn', modelIds: ['wah'] },
  ],
  'MOB-01': [
    { title: 'Camera thiết bị', subtitle: 'PCCC · Hút thuốc / cháy', modelIds: ['mobile_smoking_fire'] },
  ],
  'MOB-02': [
    { title: 'Camera thiết bị', subtitle: 'PCCC · Hút thuốc / cháy', modelIds: ['mobile_smoking_fire'] },
  ],
}

export function getCameraAiConfigSections(cameraId: string): CameraAiConfigSection[] {
  if (CAMERA_AI_CONFIG_SECTIONS[cameraId]) return CAMERA_AI_CONFIG_SECTIONS[cameraId]
  return [{ title: 'Demo client', subtitle: 'Không cần backend', modelIds: ['face_demo'] }]
}

export function listModelsForCamera(cameraId: string): CameraAiModelId[] {
  return getCameraAiConfigSections(cameraId).flatMap(section => section.modelIds)
}

export function resolveCameraAiButtonVisual(cameraId: string, enabledModelIds: CameraAiModelId[]): CameraAiModelVisual {
  const primary = enabledModelIds[0] ?? listModelsForCamera(cameraId)[0] ?? 'face_demo'
  return getCameraAiModelVisual(primary)
}

export function getModelDefinition(modelId: CameraAiModelId) {
  return getCameraAiModel(modelId)
}

export function modelBoxStyle(
  modelId: CameraAiModelId,
  role: 'subject' | 'violation' | 'info',
): { border: string; fill: string; label: string; bg: string } {
  const v = getCameraAiModelVisual(modelId)
  if (role === 'violation') {
    return {
      border: v.violationBorder,
      fill: v.violationFill,
      label: v.violationLabel,
      bg: v.violationBg,
    }
  }
  const subject = {
    border: v.subjectBorder,
    fill: v.subjectFill,
    label: v.subjectLabel,
    bg: v.subjectBg,
  }
  if (role === 'info') return subject
  return subject
}

export const ALL_CAMERA_AI_MODELS = CAMERA_AI_MODEL_CATALOG
