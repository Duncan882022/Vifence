import { useMemo } from 'react'
import type { SafetyViolationRecord } from '../types/safety.types'

/** Luôn lấy bản ghi mới nhất từ danh sách live — popup không giữ snapshot cũ. */
export function useResolvedSafetyRecord(
  records: SafetyViolationRecord[],
  id: string | null | undefined,
): SafetyViolationRecord | null {
  return useMemo(
    () => (id ? records.find(r => r.id === id) ?? null : null),
    [records, id],
  )
}
