/**
 * Reset toàn bộ dữ liệu patrol để kiểm tra sạch:
 * - Gọi DELETE /patrol/reset trên backend (events + sgc registry + mobile metrics + HC tracks)
 * - Xóa localStorage patrol (sgc→OBJ link) — giữ định danh thủ công v2 (Duncan)
 * - Xóa sessionStorage heatmap registry
 */
import { getMobileAiBackendUrl } from '@/modules/module02-training/services/mobileAiBackend.service'
import { clearPatrolHelmetGps } from '@/services/patrolHelmetGpsBridge'
import { resetHelmetPositionEngine } from '../utils/positionEngine'

const PATROL_LS_KEYS = [
  'vifence_patrol_manual_identity_v1',
  'vifence_patrol_sgc_object_link_v1',
]

const PATROL_SS_KEYS = [
  'vifence_patrol_heatmap_persons_v1',
]

function clearPatrolLocalStorage(): void {
  if (typeof localStorage === 'undefined') return
  for (const key of PATROL_LS_KEYS) {
    localStorage.removeItem(key)
  }
}

function clearPatrolSessionStorage(): void {
  if (typeof sessionStorage === 'undefined') return
  for (const key of PATROL_SS_KEYS) {
    sessionStorage.removeItem(key)
  }
}

export interface PatrolResetResult {
  ok: boolean
  backend?: {
    events_cleared: number
    sgc_tracks_cleared: number
    mobile_metrics_cleared: number
    hc_tracks_cleared: number
  }
  error?: string
}

export async function resetPatrolTestData(): Promise<PatrolResetResult> {
  let backend: PatrolResetResult['backend'] | undefined

  const url = getMobileAiBackendUrl()
  if (url) {
    try {
      const res = await fetch(`${url}/patrol/reset`, { method: 'DELETE' })
      if (res.ok) {
        backend = await res.json()
      } else {
        console.warn('[patrolReset] backend trả', res.status)
      }
    } catch (err) {
      console.warn('[patrolReset] không kết nối được backend:', err)
    }
  }

  clearPatrolLocalStorage()
  clearPatrolSessionStorage()
  clearPatrolHelmetGps('HC-02')
  resetHelmetPositionEngine('HC-02')

  return { ok: true, backend }
}
