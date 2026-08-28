import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Activity, Check, Cpu, Lock, Users, X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { getCameraAiModel } from '@/modules/module02-training/data/cameraAiModelCatalog'
import { getCameraAiConfigSections } from '@/modules/module02-training/data/cameraAiModelTokens'
import { useCameraAiEnabledModels } from '@/modules/module02-training/hooks/useCameraAiConfig'
import type { CameraAiModelId } from '@/modules/module02-training/types/cameraAi.types'
import { PATROL_BODYCAM_LABELS } from '../data/patrolCameras'
import { isPatrolDroneCameraId, PATROL_DRONE_LABELS } from '../data/patrolDrones'

interface PatrolCameraAiConfigModalProps {
  cameraId: string
  open: boolean
  onClose: () => void
}

const PATROL_MODEL_META: Partial<Record<CameraAiModelId, { icon: typeof Users; accent: string }>> = {
  patrol_person: { icon: Users, accent: 'text-emerald-400' },
}

function resolvePatrolCameraLabel(cameraId: string): string {
  return PATROL_BODYCAM_LABELS[cameraId] ?? PATROL_DRONE_LABELS[cameraId] ?? cameraId
}

function resolvePatrolCameraKindLabel(cameraId: string): string {
  return isPatrolDroneCameraId(cameraId) ? 'Module 05 flycam' : 'Module 05 bodycam'
}

export function PatrolCameraAiConfigModal({ cameraId, open, onClose }: PatrolCameraAiConfigModalProps) {
  const { enabledModels, toggleModel } = useCameraAiEnabledModels(cameraId)
  const cameraLabel = resolvePatrolCameraLabel(cameraId)
  const cameraKindLabel = resolvePatrolCameraKindLabel(cameraId)
  const droneCamera = isPatrolDroneCameraId(cameraId)

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

  const sections = useMemo(() => {
    return getCameraAiConfigSections(cameraId)
      .map(section => ({
        ...section,
        models: section.modelIds
          .map(id => getCameraAiModel(id))
          .filter(Boolean),
      }))
      .filter(section => section.models.length > 0)
  }, [cameraId])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md max-h-[80vh] flex flex-col rounded-xl border border-[#2a3855] bg-[#0a0e17] shadow-2xl"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="patrol-ai-config-title"
      >
        <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-2 border-b border-[#1e2433] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn(
              'w-8 h-8 rounded-lg border flex items-center justify-center shrink-0',
              droneCamera
                ? 'bg-sky-500/15 border-sky-500/30'
                : 'bg-emerald-500/15 border-emerald-500/30',
            )}>
              <Cpu className={cn('w-4 h-4', droneCamera ? 'text-sky-300' : 'text-emerald-300')} />
            </div>
            <div className="min-w-0">
              <p id="patrol-ai-config-title" className="text-sm font-semibold text-foreground">
                Cấu hình AI tuần tra — {cameraLabel}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {cameraId} · {cameraKindLabel}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-[#1e2433] text-muted-foreground" aria-label="Đóng">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4">
          {sections.map(section => (
            <section key={section.title}>
              <div className="flex items-center gap-1.5 mb-2">
                <Activity className={cn('w-3 h-3', droneCamera ? 'text-sky-400/80' : 'text-emerald-400/80')} aria-hidden />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-foreground">{section.title}</p>
                  <p className="text-[9px] text-muted-foreground">{section.subtitle}</p>
                </div>
              </div>
              <ul className="space-y-1.5">
                {section.models.map(model => {
                  if (!model) return null
                  const checked = enabledModels.includes(model.id)
                  const locked = droneCamera && model.id === 'patrol_person'
                  const meta = PATROL_MODEL_META[model.id]
                  const Icon = meta?.icon ?? Users

                  return (
                    <li
                      key={model.id}
                      className={cn(
                        'rounded-lg border transition-colors',
                        checked ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-[#1e2433] bg-[#0b0f1a]',
                      )}
                    >
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => {
                          if (locked) return
                          toggleModel(model.id)
                        }}
                        className={cn(
                          'w-full text-left px-3 py-2.5 flex items-start gap-2',
                          locked && 'cursor-default opacity-95',
                        )}
                      >
                        <span className={cn(
                          'mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0',
                          checked ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-[#2a3855]',
                        )}>
                          {checked && <Check className="w-3 h-3" strokeWidth={3} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <Icon className={cn('w-3 h-3 shrink-0', meta?.accent ?? 'text-emerald-400')} aria-hidden />
                            <span className="text-[11px] font-semibold text-foreground">{model.label}</span>
                            {locked && (
                              <span className="inline-flex items-center gap-0.5 text-[8px] font-semibold text-sky-300/90">
                                <Lock className="w-2.5 h-2.5" aria-hidden />
                                Bắt buộc
                              </span>
                            )}
                          </span>
                          <span className="block text-[9px] text-muted-foreground mt-0.5 leading-snug">
                            {model.description}
                          </span>
                          {model.scenarioIds.length > 0 && (
                            <span className="block text-[8px] text-muted-foreground/70 mt-0.5 font-mono">
                              {model.scenarioIds.join(' · ')}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-[#1e2433] shrink-0 space-y-2">
          <p className="text-[9px] text-muted-foreground leading-snug">
            {enabledModels.length} model đang bật · Lưu tự động trên trình duyệt
            {droneCamera ? ' · ROI người luôn bật trên tile flycam' : ' · Không cần polygon ROI'}
          </p>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'w-full sm:w-auto sm:float-right px-4 py-2 rounded-lg text-[11px] font-semibold border',
              droneCamera
                ? 'bg-sky-500/15 text-sky-300 border-sky-500/30 hover:bg-sky-500/25'
                : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25',
            )}
          >
            Xong
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
