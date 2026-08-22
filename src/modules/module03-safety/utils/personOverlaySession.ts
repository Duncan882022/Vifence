/**
 * Session memory cho objectID (sgc-*) trên overlay live:
 * lần đầu gặp → "person"; rời khung rồi gặp lại → hiện objectID.
 */

const activeIds = new Set<string>()
const seenAndLeftIds = new Set<string>()

function isSgcObjectId(id: string | null | undefined): id is string {
  const trimmed = id?.trim()
  return Boolean(trimmed && trimmed.startsWith('sgc-0'))
}

/** Gọi mỗi frame với danh sách worker_id person đang thấy trên cam. */
export function syncPersonOverlaySession(workerIds: Array<string | null | undefined>): void {
  const current = new Set<string>()
  for (const raw of workerIds) {
    if (!isSgcObjectId(raw)) continue
    current.add(raw.trim())
  }
  for (const id of activeIds) {
    if (!current.has(id)) {
      seenAndLeftIds.add(id)
    }
  }
  activeIds.clear()
  for (const id of current) {
    activeIds.add(id)
  }
}

/** True nếu objectID đã từng rời khung và quay lại trong session. */
export function hasPersonObjectReturned(workerId: string | null | undefined): boolean {
  if (!isSgcObjectId(workerId)) return false
  return seenAndLeftIds.has(workerId.trim())
}

export function resetPersonOverlaySession(): void {
  activeIds.clear()
  seenAndLeftIds.clear()
}

export function isSgcWorkerId(workerId: string | null | undefined): boolean {
  return isSgcObjectId(workerId)
}
