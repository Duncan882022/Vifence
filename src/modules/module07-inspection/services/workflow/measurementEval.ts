import type { CriterionDef } from '../../workflow.types'

export interface ToleranceRange {
  min: number
  max: number
}

export interface MeasurementVerdict {
  status: 'pass' | 'fail'
  values: number[]
  range: ToleranceRange
  /** Giá trị lệch xa nhất khỏi khoảng cho phép (0 khi đạt). */
  worstDeviation: number
  summary: string
}

const num = (s: string) => Number(s.replace(',', '.'))

const LENGTH_MM: Record<string, number> = { mm: 1, cm: 10, m: 1000 }

/** Hệ số đổi đơn vị dung sai → đơn vị thiết kế; `null` khi không đổi được. */
function unitFactor(tolUnit: string | undefined, designUnit: string | undefined): number | null {
  if (!tolUnit || !designUnit || tolUnit === designUnit) return 1
  const from = LENGTH_MM[tolUnit]
  const to = LENGTH_MM[designUnit]
  return from && to ? from / to : null
}

/** Khoảng cho phép từ chuỗi dung sai (±a, ±a%, −a / +b, ≥ a, ≤ a, 0). `null` khi không định lượng được. */
export function toleranceRange(criterion: Pick<CriterionDef, 'tolerance' | 'designValue' | 'unit'>): ToleranceRange | null {
  const t = criterion.tolerance.trim()
  const design = criterion.designValue
  const tolUnit = t.match(/\b(mm|cm|m)\b/)?.[1]
  const k = unitFactor(tolUnit, criterion.unit)
  if (k == null) return null
  const min = t.match(/^≥\s*([\d.,]+)/)
  if (min) return { min: num(min[1]) * k, max: Number.POSITIVE_INFINITY }
  const max = t.match(/^≤\s*([\d.,]+)/)
  if (max) return { min: Number.NEGATIVE_INFINITY, max: num(max[1]) * k }
  if (design == null) return null
  const pct = t.match(/^±\s*([\d.,]+)\s*%/)
  if (pct) {
    const d = Math.abs(design) * num(pct[1]) / 100
    return { min: design - d, max: design + d }
  }
  const sym = t.match(/^±\s*([\d.,]+)/)
  if (sym) return { min: design - num(sym[1]) * k, max: design + num(sym[1]) * k }
  const asym = t.match(/^[−-]\s*([\d.,]+)\s*\/\s*\+\s*([\d.,]+)/)
  if (asym) return { min: design - num(asym[1]) * k, max: design + num(asym[2]) * k }
  if (/^0$/.test(t)) return { min: design, max: design }
  return null
}

/** Tách nhiều giá trị: "148; 176", "148, 176", "18,5" (dấu phẩy thập phân). */
export function parseMeasuredValues(raw: string): number[] {
  return raw
    .split(/[;\s]+|,\s+/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(num)
    .filter(n => Number.isFinite(n))
}

const EPS = 1e-9

function fmt(n: number): string {
  return String(Number(n.toFixed(3)))
}

/**
 * Tự chấm số đo theo dung sai thiết kế. Trả `null` khi tiêu chí không định lượng được
 * hoặc đơn vị nhập khác đơn vị thiết kế — khi đó KS chấm tay.
 */
export function evaluateMeasurement(
  criterion: Pick<CriterionDef, 'tolerance' | 'designValue' | 'unit'>,
  raw: string,
  unit?: string,
): MeasurementVerdict | null {
  const range = toleranceRange(criterion)
  if (!range) return null
  if (unit && criterion.unit && unit.trim().toLowerCase() !== criterion.unit.toLowerCase()) return null
  const values = parseMeasuredValues(raw)
  if (values.length === 0) return null
  const deviation = (v: number) => (v < range.min - EPS ? v - range.min : v > range.max + EPS ? v - range.max : 0)
  const worst = values.map(deviation).reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0)
  const out = values.filter(v => deviation(v) !== 0)
  const u = criterion.unit ? ` ${criterion.unit}` : ''
  const summary = out.length === 0
    ? `Đạt dung sai ${criterion.tolerance} (${values.map(fmt).join(', ')}${u})`
    : `${out.length}/${values.length} giá trị ngoài dung sai ${criterion.tolerance} · lệch ${worst > 0 ? '+' : ''}${fmt(worst)}${u}`
  return { status: out.length === 0 ? 'pass' : 'fail', values, range, worstDeviation: worst, summary }
}
