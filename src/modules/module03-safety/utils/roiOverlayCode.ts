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
  person: 'person',
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
  hard_median: 'LÀN+',
  soft_median: 'LÀN+',
  no_soft_median: 'ATGT-004',
  smoking: 'PCCC-001',
  fire: 'PCCC-002',
  mud: 'BPTC-007',
  water: 'BPTC-008',
  object: 'BPTC-009',
  mesh_missing: 'BPTC-001',
  mesh_torn: 'BPTC-001',
  mesh_dirty: 'BPTC-001',
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
  const kind = options?.machineKind?.trim()
    || (behavior !== 'crane' && behavior in MACHINE_KIND_LABEL ? behavior : null)
  if (behavior === 'crane' || kind) {
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
  if (behavior in MACHINE_KIND_LABEL) {
    return MACHINE_KIND_LABEL[behavior]
  }
  if (behavior === 'crane') {
    return BEHAVIOR_ROI_CODE.crane
  }
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

/** Nhãn bbox máy nét đứt — vd Máy khoan 88%. */
export function formatMachineRoiBadge(
  machineKind?: string | null,
  confidence?: number | null,
): string {
  const label = machineKindLabel(machineKind)
  const pct = confidence != null ? (confidence * 100).toFixed(0) : '0'
  return `${label} ${pct}%`
}

/** Khoảng cách mép biên — dấu phẩy thập phân (vd 0,2m). */
export function formatDistanceSuffixMeters(distanceM?: number | null): string {
  if (distanceM == null || distanceM <= 0) return ''
  return ` - ${distanceM.toFixed(1).replace('.', ',')}m`
}

/** Nhãn vi phạm trên bbox — đồng bộ snapshot BPTC-001 88% / WAH-001 88% - 0,2m. */
export function formatViolationRoiBadge(
  behavior: string,
  confidence: number,
  options?: {
    scenarioId?: string | null
    distanceM?: number | null
  },
): string {
  const code = formatRoiOverlayCode(behavior, options?.scenarioId)
  if (behavior === 'no_harness' || options?.scenarioId === 'WAH-001') {
    const dist = options?.distanceM ?? 0.2
    return formatRoiOverlayBadge(code, confidence, formatDistanceSuffixMeters(dist))
  }
  if (options?.distanceM != null && options.distanceM > 0) {
    return formatRoiOverlayBadge(code, confidence, formatDistanceSuffixMeters(options.distanceM))
  }
  return formatRoiOverlayBadge(code, confidence)
}
