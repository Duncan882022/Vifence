import { useEffect, useMemo, useState } from 'react'
import { isPatrolMetricsCameraId } from '@/modules/module05-productivity/data/patrolHelmetScope'
import { PatrolCameraAiConfigModal } from '@/modules/module05-productivity/components/PatrolCameraAiConfigModal'
import { createPortal } from 'react-dom'
import { Check, Cpu, MapPin, X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { CAMERA_AI_MODEL_CATALOG } from '../data/cameraAiModelCatalog'
import { getDefaultRoiZonesForModel } from '../data/cameraAiRoiDefaults'
import { useCameraAiEnabledModels } from '../hooks/useCameraAiConfig'
import type { CameraAiModelId } from '../types/cameraAi.types'
import {
  cameraHasPolygonRoiModels,
  getCameraLiveRoiVisible,
  setCameraLiveRoiVisible,
} from '../services/cameraAiConfig.service'
import {
  GROUP_BADGE,
  GROUP_COLORS,
  GROUP_ICONS,
} from '@/modules/module03-safety/utils/safetyDashboardUi'
import type { SafetyGroupId } from '@/modules/module03-safety/types/safety.types'
import {
  cameraToolbarBtnStandalone,
  cameraToolbarIconSize,
} from './cameraToolbarStyles'

interface CameraAiConfigModalProps {
  cameraId: string
  open: boolean
  onClose: () => void
}

const GROUP_ORDER: Array<SafetyGroupId | 'DEMO'> = [
  'DEMO', 'BPTC', 'DZ', 'PPE', 'PCCC', 'WAH', 'ATGT',
]

function groupLabel(groupId: SafetyGroupId | 'DEMO'): string {
  if (groupId === 'DEMO') return 'Demo'
  return groupId
}

/** Bỏ hậu tố cam/khu vực — modal đã hiển thị cameraId ở header. */
function compactZoneLabel(label: string, cameraId: string): string {
  return label
    .replace(/\s*[—–-]\s*TTDV-A\s*Cam\s*\d+/gi, '')
    .replace(/\s*[—–-]\s*Cam\s*\d+/gi, '')
    .replace(new RegExp(`\\s*[—–-]\\s*${cameraId.replace('-', '\\-')}`, 'gi'), '')
    .replace(/\s*[—–-]\s*Kho vật tư\s*B/gi, '')
    .replace(/\s*[—–-]\s*Hành lang\s*B/gi, '')
    .trim()
}

function formatZoneLine(zone: { label: string; type: string; polygon: unknown[]; pixelsPerMeter?: number }, cameraId: string): string {
  const name = compactZoneLabel(zone.label, cameraId)
  const parts = name && name.toLowerCase() !== zone.type.toLowerCase()
    ? [zone.type, name, `${zone.polygon.length} điểm`]
    : [zone.type, `${zone.polygon.length} điểm`]
  if (zone.pixelsPerMeter != null) parts.push(`${zone.pixelsPerMeter}px/m`)
  return parts.join(' · ')
}

export function CameraAiConfigModal({ cameraId, open, onClose }: CameraAiConfigModalProps) {
  const { enabledModels, toggleModel } = useCameraAiEnabledModels(cameraId)
  const [expandedPolygon, setExpandedPolygon] = useState<CameraAiModelId | null>(null)
  const [liveRoiVisible, setLiveRoiVisible] = useState(() => getCameraLiveRoiVisible(cameraId))
  const hasPolygonModels = cameraHasPolygonRoiModels(cameraId)

  useEffect(() => {
    if (open) setLiveRoiVisible(getCameraLiveRoiVisible(cameraId))
  }, [open, cameraId])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  const grouped = useMemo(() => {
    const map = new Map<SafetyGroupId | 'DEMO', typeof CAMERA_AI_MODEL_CATALOG>()
    for (const g of GROUP_ORDER) map.set(g, [])
    for (const model of CAMERA_AI_MODEL_CATALOG) {
      if (model.id === 'mobile_smoking_fire' && !cameraId.startsWith('MOB')) continue
      if (model.id === 'face_demo' && (cameraId.startsWith('MOB') || enabledModels.some(id => id !== 'face_demo'))) {
        // still show face as option
      }
      const list = map.get(model.groupId) ?? []
      list.push(model)
      map.set(model.groupId, list)
    }
    return GROUP_ORDER
      .map(g => ({ groupId: g, models: map.get(g) ?? [] }))
      .filter(g => g.models.length > 0)
  }, [cameraId, enabledModels])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg max-h-[88vh] flex flex-col rounded-xl border border-[#2a3855] bg-[#0a0e17] shadow-2xl"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="camera-ai-config-title"
      >
        <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-2 border-b border-[#1e2433] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-violet-500/15 border border-violet-500/30 flex items-center justify-center shrink-0">
              <Cpu className="w-4 h-4 text-violet-300" />
            </div>
            <div className="min-w-0">
              <p id="camera-ai-config-title" className="text-sm font-semibold text-foreground">
                Cấu hình AI — {cameraId}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Chọn model áp dụng · chỉ model bật mới chạy detect
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-[#1e2433] text-muted-foreground" aria-label="Đóng">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4">
          {grouped.map(({ groupId, models }) => {
            const Icon = groupId === 'DEMO' ? Cpu : GROUP_ICONS[groupId as SafetyGroupId]
            const badge = groupId === 'DEMO'
              ? 'bg-gray-500/10 text-gray-300 border-gray-500/30'
              : GROUP_BADGE[groupId as SafetyGroupId]
            const color = groupId === 'DEMO' ? 'text-gray-300' : GROUP_COLORS[groupId as SafetyGroupId]

            return (
              <section key={groupId}>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className={cn('text-[9px] px-1.5 py-0.5 rounded border inline-flex items-center gap-1 font-bold', badge)}>
                    <Icon className={cn('w-3 h-3', color)} aria-hidden />
                    {groupLabel(groupId)}
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {models.map(model => {
                    const checked = enabledModels.includes(model.id)
                    const zones = model.needsPolygon
                      ? getDefaultRoiZonesForModel(cameraId, model.id)
                      : []
                    const showPoly = expandedPolygon === model.id

                    return (
                      <li
                        key={model.id}
                        className={cn(
                          'rounded-lg border transition-colors',
                          checked ? 'border-primary/40 bg-primary/5' : 'border-[#1e2433] bg-[#0b0f1a]',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => toggleModel(model.id)}
                          className="w-full text-left px-3 py-2.5 flex items-start gap-2"
                        >
                          <span className={cn(
                            'mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0',
                            checked ? 'bg-primary border-primary text-white' : 'border-[#2a3855]',
                          )}>
                            {checked && <Check className="w-3 h-3" strokeWidth={3} />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[11px] font-semibold text-foreground">{model.label}</span>
                              {model.needsPolygon && (
                                <span className="text-[7px] px-1 py-px rounded border border-amber-500/40 bg-amber-500/10 text-amber-300 font-bold">
                                  Cần polygon
                                </span>
                              )}
                              {model.modelVersion && (
                                <span className="text-[7px] font-mono text-muted-foreground">{model.modelVersion}</span>
                              )}
                            </span>
                            <span className="block text-[9px] text-muted-foreground mt-0.5 leading-snug">
                              {model.description}
                            </span>
                            {model.modelMetric && (
                              <span className="block text-[8px] text-muted-foreground/70 mt-0.5 font-mono">
                                {model.modelMetric}
                              </span>
                            )}
                          </span>
                        </button>

                        {checked && model.needsPolygon && (
                          <div className="px-3 pb-2.5 pt-0 border-t border-[#1e2433]/60 mx-2">
                            <button
                              type="button"
                              onClick={() => setExpandedPolygon(showPoly ? null : model.id)}
                              className="mt-2 text-[9px] text-amber-300/90 hover:text-amber-200 inline-flex items-center gap-1"
                            >
                              <MapPin className="w-3 h-3" />
                              {showPoly ? 'Thu gọn ROI' : `ROI (${zones.length})`}
                            </button>
                            {showPoly && (
                              <ul className="mt-2 space-y-1">
                                {zones.length === 0 ? (
                                  <li className="text-[9px] text-red-300/80 leading-snug">
                                    Chưa có polygon mặc định — cần vẽ trước khi chạy.
                                    {model.polygonHint && (
                                      <span className="block text-muted-foreground/70 mt-1">{model.polygonHint}</span>
                                    )}
                                  </li>
                                ) : zones.map(z => (
                                  <li
                                    key={z.id}
                                    className="text-[9px] rounded border border-[#1e2433] bg-black/30 px-2 py-1 font-mono text-muted-foreground/85"
                                  >
                                    {formatZoneLine(z, cameraId)}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>

        <div className="px-4 py-3 border-t border-[#1e2433] shrink-0 space-y-2">
          {hasPolygonModels && (
            <label className="flex items-start gap-2 cursor-pointer rounded-lg border border-[#1e2433] bg-[#0b0f1a] px-3 py-2.5">
              <input
                type="checkbox"
                checked={liveRoiVisible}
                onChange={e => {
                  const next = e.target.checked
                  setLiveRoiVisible(next)
                  setCameraLiveRoiVisible(cameraId, next)
                }}
                className="mt-0.5 shrink-0"
              />
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold text-foreground">
                  Hiển thị polygon ROI trên live view
                </span>
                <span className="block text-[9px] text-muted-foreground mt-0.5 leading-snug">
                  Cam 03 mặc định bật vùng lòng đường · cấu hình chi tiết per-zone sẽ bổ sung sau
                </span>
              </span>
            </label>
          )}
          <p className="text-[9px] text-muted-foreground">
            {enabledModels.length} model đang bật · Lưu tự động trên trình duyệt
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto sm:float-right px-4 py-2 rounded-lg text-[11px] font-semibold bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25"
          >
            Xong
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

interface CameraAiConfigButtonProps {
  cameraId: string
  compact?: boolean
  className?: string
}

export function CameraAiConfigButton({ cameraId, compact, className }: CameraAiConfigButtonProps) {
  const [open, setOpen] = useState(false)
  const isPatrol = isPatrolMetricsCameraId(cameraId)

  return (
    <>
      <button
        type="button"
        onClick={e => {
          e.stopPropagation()
          setOpen(true)
        }}
        className={cn(
          className ?? cameraToolbarBtnStandalone(compact),
        )}
        title="Cấu hình model AI"
        aria-label="Cấu hình model AI"
      >
        <Cpu className={cameraToolbarIconSize(compact)} aria-hidden />
      </button>
      {isPatrol ? (
        <PatrolCameraAiConfigModal cameraId={cameraId} open={open} onClose={() => setOpen(false)} />
      ) : (
        <CameraAiConfigModal cameraId={cameraId} open={open} onClose={() => setOpen(false)} />
      )}
    </>
  )
}
