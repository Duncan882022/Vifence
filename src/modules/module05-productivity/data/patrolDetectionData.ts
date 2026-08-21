/**
 * Layer 2 — Detection dots.
 * Mỗi dot = 1 unique object (person/vehicle/equipment) được camera mũ ghi nhận.
 * Dữ liệu tĩnh (deterministic seeded) — sẽ thay bằng WS stream khi có backend thật.
 */
import { PATROL_GPS_ZONES } from './patrolSiteMap'

export type DetectionType = 'person' | 'vehicle' | 'equipment'

export interface DetectionDot {
  id: string
  type: DetectionType
  position: [number, number]
  zoneId: string
  cameraId: string
  confidence: number
}

/* ── Seeded LCG — deterministic, no Math.random() ───────────── */
function makeLcg(seed: number) {
  let s = (seed ^ 0xdeadbeef) >>> 0
  return (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

function scatterDots(
  zoneId: string,
  type: DetectionType,
  center: [number, number],
  count: number,
  spreadLat: number,
  spreadLng: number,
  seedBase: number,
  cameras: string[],
): DetectionDot[] {
  const rng = makeLcg(seedBase)
  return Array.from({ length: count }, (_, i) => ({
    id: `${zoneId}-${type}-${i}`,
    type,
    position: [
      center[0] + (rng() * 2 - 1) * spreadLat,
      center[1] + (rng() * 2 - 1) * spreadLng,
    ] as [number, number],
    zoneId,
    cameraId: cameras[i % cameras.length],
    confidence: parseFloat((0.75 + rng() * 0.24).toFixed(2)),
  }))
}

/* ── Zone-level detection config ────────────────────────────── */
interface ZoneDetectionConfig {
  zoneId: string
  personCount: number
  vehicleCount: number
  equipmentCount: number
  cameras: string[]
}

const ZONE_DETECTION_CONFIG: ZoneDetectionConfig[] = [
  { zoneId: 'ZONE_A', personCount: 18, vehicleCount: 6, equipmentCount: 2, cameras: ['HC-01'] },
  { zoneId: 'ZONE_B', personCount: 22, vehicleCount: 8, equipmentCount: 3, cameras: ['HC-02'] },
  { zoneId: 'ZONE_C', personCount: 14, vehicleCount: 4, equipmentCount: 1, cameras: ['HC-03'] },
  { zoneId: 'ZONE_D', personCount: 9,  vehicleCount: 2, equipmentCount: 1, cameras: ['HC-04'] },
  { zoneId: 'ZONE_E', personCount: 6,  vehicleCount: 1, equipmentCount: 0, cameras: ['HC-05'] },
  { zoneId: 'ZONE_F', personCount: 4,  vehicleCount: 4, equipmentCount: 2, cameras: ['HC-01', 'HC-03'] },
  { zoneId: 'ZONE_G', personCount: 5,  vehicleCount: 2, equipmentCount: 0, cameras: ['HC-04', 'HC-05'] },
  { zoneId: 'ZONE_H', personCount: 10, vehicleCount: 5, equipmentCount: 2, cameras: ['HC-02', 'HC-03'] },
]

/* ── Build full detection dot list (module-level constant) ───── */
function buildDetectionDots(): DetectionDot[] {
  const zoneMap = new Map(PATROL_GPS_ZONES.map(z => [z.zone_id, z]))
  const dots: DetectionDot[] = []
  let seedCounter = 1

  for (const cfg of ZONE_DETECTION_CONFIG) {
    const zone = zoneMap.get(cfg.zoneId)
    if (!zone) continue

    // Spread radius ≈ 40% of ~100m zone half-width → ~0.00016° lat / ~0.0002° lng
    const spreadLat = 0.00016
    const spreadLng = 0.00020

    dots.push(
      ...scatterDots(cfg.zoneId, 'person',    zone.center, cfg.personCount,    spreadLat, spreadLng, seedCounter++, cfg.cameras),
      ...scatterDots(cfg.zoneId, 'vehicle',   zone.center, cfg.vehicleCount,   spreadLat, spreadLng, seedCounter++, cfg.cameras),
      ...scatterDots(cfg.zoneId, 'equipment', zone.center, cfg.equipmentCount, spreadLat, spreadLng, seedCounter++, cfg.cameras),
    )
  }

  return dots
}

export const PATROL_DETECTION_DOTS: DetectionDot[] = buildDetectionDots()

/* ── Per-zone summary (used by density heat blob) ───────────── */
export function getZoneDetectionCounts(zoneId: string): {
  personCount: number
  vehicleCount: number
  equipmentCount: number
  total: number
} {
  const dots = PATROL_DETECTION_DOTS.filter(d => d.zoneId === zoneId)
  const personCount    = dots.filter(d => d.type === 'person').length
  const vehicleCount   = dots.filter(d => d.type === 'vehicle').length
  const equipmentCount = dots.filter(d => d.type === 'equipment').length
  return { personCount, vehicleCount, equipmentCount, total: dots.length }
}

/* ── Visual config per type ─────────────────────────────────── */
export const DETECTION_DOT_STYLE: Record<DetectionType, { color: string; radius: number; weight: number }> = {
  person:    { color: '#38bdf8', radius: 1.5, weight: 0.5 },
  vehicle:   { color: '#f97316', radius: 2,   weight: 0.5 },
  equipment: { color: '#a78bfa', radius: 2,   weight: 0.5 },
}
