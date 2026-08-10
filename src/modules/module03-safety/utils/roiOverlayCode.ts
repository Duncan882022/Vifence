/** Mã ngắn trên bbox ROI — đồng bộ kịch bản ATLĐ, tránh text dài trên overlay. */

/** Tên hiển thị máy thi công — ưu tiên hơn mã nhóm DZ trên bbox live/snapshot. */
export const MACHINE_KIND_LABEL: Record<string, string> = {
  tower_crane: 'Máy cẩu tháp',
  crane_green: 'Máy xúc',
  sany_drill: 'Máy khoan',
  excavator_orange: 'Máy khoan',
  road_roller: 'Xe lăn đường',
  dump_truck: 'Xe tải ben',
  forklift: 'Xe nâng',
  machinery: 'Máy thi công',
  machinery_yellow: 'Máy thi công',
}

const BEHAVIOR_ROI_CODE: Record<string, string> = {
  person: 'NV',
  unknown: '?',
  hard_hat: 'PPE+',
  safety_vest: 'PPE+',
  safety_shoes: 'PPE+',
  no_helmet: 'PPE-001',
  no_vest: 'PPE-002',
  no_shoes: 'PPE-003',
  safety_harness: 'WAH+',
  no_harness: 'WAH-001',
  crane: 'Máy thi công',
  crane_green: 'Máy xúc',
  sany_drill: 'Máy khoan',
  excavator_orange: 'Máy khoan',
  tower_crane: 'Máy cẩu tháp',
  road_roller: 'Xe lăn đường',
  dump_truck: 'Xe tải ben',
  forklift: 'Xe nâng',
  machinery: 'Máy thi công',
  crane_proximity: 'DZ-003',
  vehicle: 'ATGT',
  speeding: 'ATGT-002',
  hard_median: 'ATGT-004',
  soft_median: 'ATGT-004',
  no_soft_median: 'ATGT-004',
  smoking: 'PCCC-001',
  fire: 'PCCC-002',
  mud: 'BPTC-007',
  water: 'BPTC-008',
  object: 'BPTC-009',
}

export function formatCraneOverlayLabel(
  behavior: string,
  options?: {
    machineKind?: string | null
    scenarioId?: string | null
    label?: string | null
  },
): string {
  if (behavior === 'crane_proximity') {
    return formatRoiOverlayCode('crane_proximity', options?.scenarioId)
  }
  if (behavior === 'person') {
    return formatRoiOverlayCode('person')
  }
  if (behavior === 'crane') {
    const kind = options?.machineKind?.trim()
    if (kind && MACHINE_KIND_LABEL[kind]) {
      return MACHINE_KIND_LABEL[kind]
    }
    const backendLabel = options?.label?.trim()
    if (backendLabel && !/^DZ/i.test(backendLabel)) {
      return backendLabel
    }
    return 'Máy thi công'
  }
  return formatRoiOverlayCode(behavior, options?.scenarioId)
}

export function formatRoiOverlayCode(
  behavior: string,
  scenarioId?: string | null,
): string {
  const sid = scenarioId?.trim()
  if (sid && /^[A-Z]+-\d{3}$/.test(sid)) return sid
  return BEHAVIOR_ROI_CODE[behavior] ?? behavior.slice(0, 10).toUpperCase()
}

export function machineKindLabel(kind?: string | null): string {
  if (!kind) return 'Máy thi công'
  return MACHINE_KIND_LABEL[kind] ?? 'Máy thi công'
}

export function formatRoiOverlayBadge(
  code: string,
  confidence: number,
  suffix = '',
): string {
  const pct = `${(confidence * 100).toFixed(0)}%`
  return suffix ? `${code} ${pct}${suffix}` : `${code} ${pct}`
}
