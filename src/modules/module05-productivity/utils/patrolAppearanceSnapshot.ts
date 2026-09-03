/**
 * Ảnh bằng chứng cho từng lượt trong popup Lịch sử xuất hiện.
 *
 * Quy tắc: mỗi mốc thời gian hiện ảnh của **chính lượt đó**. Lượt cũ thiếu ảnh
 * thì để trống, không mượn ảnh thẻ — mượn ảnh khiến mọi mốc thời gian trông
 * giống hệt nhau và người trực tưởng đã đối chiếu xong trong khi chưa xem gì.
 */
import type { PatrolAppearanceSegment } from '../services/patrolDayEvents.service'

export function resolveAppearanceSnapshotUrl(
  segment: PatrolAppearanceSegment,
): string | undefined {
  return segment.snapshotUrl?.trim() || undefined
}

/**
 * Lượt mới nhất thiếu ảnh — lấy ảnh thẻ.
 *
 * Ảnh thẻ là khung đẹp nhất backend giữ cho đối tượng, và lượt mới nhất chính
 * là lượt sinh ra nó, nên đây là lần mượn duy nhất không sai thời điểm.
 * `segments` phải đã sắp xếp mới nhất trước.
 */
export function fillMissingNewestAppearanceSnapshot(
  segments: PatrolAppearanceSegment[],
  cardSnapshotUrl: string | undefined,
): PatrolAppearanceSegment[] {
  const cardSnap = cardSnapshotUrl?.trim()
  if (!cardSnap || segments.length === 0) return segments
  const [newest, ...rest] = segments
  if (newest.snapshotUrl?.trim()) return segments
  return [{ ...newest, snapshotUrl: cardSnap }, ...rest]
}
