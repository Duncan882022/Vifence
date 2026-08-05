/** Nhãn hiển thị khi thiếu dữ liệu — không fake, không để trống. */
export const UNKNOWN_LABEL = 'Unknown'

export function displayUnknown(value?: string | null): string {
  const trimmed = value?.trim()
  if (!trimmed) return UNKNOWN_LABEL
  if (trimmed.toLowerCase() === 'unknown') return UNKNOWN_LABEL
  return trimmed
}

export function joinDisplayUnknown(
  parts: Array<string | null | undefined>,
  separator = ' · ',
): string {
  return parts.map(displayUnknown).join(separator)
}
