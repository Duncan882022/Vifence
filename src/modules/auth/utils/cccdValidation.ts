export function normalizeCccdInput(raw: string): string {
  return raw.replace(/\D/g, '')
}

export function validateCccd(raw: string): string | null {
  const digits = normalizeCccdInput(raw)
  if (!digits) return 'Vui lòng nhập số CCCD'
  if (digits.length < 9) return 'Số CCCD phải có độ dài từ 9 ký tự trở lên'
  if (digits.length > 12) return 'Số CCCD không hợp lệ'
  return null
}

export function maskCccd(cccd: string): string {
  const digits = normalizeCccdInput(cccd)
  if (digits.length <= 4) return digits
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`
}
