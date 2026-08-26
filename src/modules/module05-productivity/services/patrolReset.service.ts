/**
 * Reset toàn bộ dữ liệu patrol để kiểm tra sạch:
 * - Gọi DELETE /patrol/reset trên backend (events + sgc registry + thư viện mặt
 *   + bindings định danh + mobile metrics + HC tracks)
 * - Xóa localStorage patrol (sgc→OBJ link + định danh thủ công)
 * - Xóa sessionStorage heatmap registry
 *
 * Thứ tự bắt buộc: backend trước, trình duyệt sau. Backend còn dữ liệu mà đã
 * xoá localStorage thì lần tải trang kế tiếp sẽ đồng bộ ngược trở lại.
 */
import { getMobileAiBackendUrl } from '@/modules/module02-training/services/mobileAiBackend.service'
import { clearPatrolHelmetGps } from '@/services/patrolHelmetGpsBridge'
import { clearPatrolMobilePpeEvents } from '@/services/patrolMobileEventsBridge'
import { clearHeatmapPersonRegistry } from '@/services/patrolHeatmapPersonRegistry'
import { clearPatrolHeatGrid } from '@/services/patrolHeatGrid'
import { resetHelmetPositionEngine } from '../utils/positionEngine'

const PATROL_LS_KEYS = [
  'vifence_patrol_manual_identity_v1',
  'vifence_patrol_manual_identity_v2',
  'vifence_patrol_sgc_object_link_v1',
]

const PATROL_SS_KEYS = [
  'vifence_patrol_heatmap_persons_v1',
  'vifence_patrol_heatmap_persons_v2',
  'vifence_patrol_heat_grid_v1',
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
    identity_bindings_cleared?: number
    gallery_cleared?: number
  }
  error?: string
}

/**
 * Xoá dữ liệu patrol. `ok` chỉ đúng khi **backend cũng đã xoá**.
 *
 * Thư viện mặt và bindings nằm ở backend. Xoá mỗi phía trình duyệt thì lần
 * tải trang sau `syncPatrolIdentityBindingsFromBackend()` lại kéo nguyên bộ
 * cũ về localStorage — người dùng bấm xoá bao nhiêu lần cũng thấy y như cũ.
 * Nên backend hỏng phải báo ra, không được nuốt vào console.
 */
export async function resetPatrolTestData(): Promise<PatrolResetResult> {
  const url = getMobileAiBackendUrl()
  if (!url) {
    return { ok: false, error: 'Chưa cấu hình URL backend — không xoá được dữ liệu trên máy chủ.' }
  }

  let backend: PatrolResetResult['backend']
  try {
    const res = await fetch(`${url}/patrol/reset`, { method: 'DELETE' })
    if (!res.ok) {
      return { ok: false, error: `Backend từ chối xoá (HTTP ${res.status}).` }
    }
    backend = await res.json()
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Không kết nối được backend để xoá: ${detail}` }
  }

  clearPatrolLocalStorage()
  clearPatrolSessionStorage()
  clearHeatmapPersonRegistry()
  clearPatrolHeatGrid()
  clearPatrolMobilePpeEvents()
  clearPatrolHelmetGps('HC-01')
  clearPatrolHelmetGps('HC-02')
  resetHelmetPositionEngine('HC-01')
  resetHelmetPositionEngine('HC-02')

  return { ok: true, backend }
}
