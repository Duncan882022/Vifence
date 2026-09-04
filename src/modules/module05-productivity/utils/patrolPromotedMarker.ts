/**
 * Dấu "vừa thăng hạng" cho thẻ Người.
 *
 * Một thẻ Người có thể mang ảnh chụp badge "Đối tượng": lượt gặp bắt đầu khi
 * chưa thấy mặt, giữa lượt mới bắt được mặt và thẻ được dồn từ `obj-*` sang
 * `tk-*`. Không có dấu này thì người xem không phân biệt được đó là hệ quả của
 * thăng hạng hay là nhận dạng sai — đúng chỗ người dùng đang nghi ngờ.
 */
import type { PatrolEvent } from '../data/patrolTypes'

export interface PatrolPromotedMarker {
  /** Số mã `obj-*` đã dồn vào thẻ này. */
  count: number
  /** Nhãn ngắn hiện trên thẻ. */
  label: string
  /** Giải thích đầy đủ, kèm danh sách mã gốc. */
  tooltip: string
}

export function resolvePatrolPromotedMarker(
  event: Pick<PatrolEvent, 'promotedFrom'>,
): PatrolPromotedMarker | null {
  const ids = (event.promotedFrom ?? []).map(s => String(s).trim()).filter(Boolean)
  if (ids.length === 0) return null

  // Nhiều mã gốc nghĩa là thẻ này gom từ nhiều lần gặp lúc còn là Đối tượng —
  // đáng để hiện số, vì đó cũng là nơi lịch sử dễ lẫn người.
  const label = ids.length > 1 ? `Thăng hạng ×${ids.length}` : 'Thăng hạng'
  const tooltip = ids.length > 1
    ? `Thẻ này dồn từ ${ids.length} Đối tượng: ${ids.join(', ')}.`
      + ' Ảnh chụp trước lúc thăng hạng vẫn mang badge "Đối tượng".'
    : `Thẻ này vốn là ${ids[0]}, thăng hạng khi bắt được mặt.`
      + ' Ảnh chụp trước lúc thăng hạng vẫn mang badge "Đối tượng".'

  return { count: ids.length, label, tooltip }
}
