/** Mã ngắn trên bbox ROI — đồng bộ kịch bản ATLĐ, tránh text dài trên overlay. */

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
  crane: 'DZ',
  crane_green: 'DZ-M1',
  sany_drill: 'DZ-M2',
  excavator_orange: 'DZ-M3',
  tower_crane: 'DZ-C',
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

export function formatRoiOverlayCode(
  behavior: string,
  scenarioId?: string | null,
): string {
  const sid = scenarioId?.trim()
  if (sid && /^[A-Z]+-\d{3}$/.test(sid)) return sid
  return BEHAVIOR_ROI_CODE[behavior] ?? behavior.slice(0, 10).toUpperCase()
}

export function formatRoiOverlayBadge(
  code: string,
  confidence: number,
  suffix = '',
): string {
  const pct = `${(confidence * 100).toFixed(0)}%`
  return suffix ? `${code} ${pct}${suffix}` : `${code} ${pct}`
}
