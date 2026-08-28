/**
 * Layer 2 — Detection dots.
 * Mỗi dot = 1 unique object (person/vehicle/equipment) được camera mũ ghi nhận.
 * Vị trí: có thể ngoài polygon zone, bắt buộc trong PATROL_SITE_BOUNDARY (polygon đỏ).
 */
import { PATROL_GPS_ZONES } from './patrolSiteMap'
import { clampPointToSiteBoundary, isPointInSiteBoundary } from './patrolSiteGeometry'

import type { PatrolTier } from '../utils/patrolTierTokens'

export type DetectionType = 'person' | 'vehicle' | 'equipment'

export interface DetectionDot {
  id: string
  type: DetectionType
  position: [number, number]
  zoneId: string
  cameraId: string
  confidence: number
  /** Nhãn hiển thị tooltip — sgc / tên gallery */
  label?: string
  /** Epoch ms — dùng TTL / time filter heatmap (spec Module 05) */
  lastSeenAt?: number
  /** ACTIVE 0–30s → cao; RECENTLY_OBSERVED 30–120s → TB (spec §7.2) */
  opacity?: number
  /** Object ID — click mở bottom sheet */
  objectId?: string
  /** @deprecated Dùng tier — giữ cho flycam aerial (verified=false dù tier identity). */
  verified?: boolean
  /** Ba tầng nhận diện — màu chấm heatmap */
  tier?: PatrolTier
  /** true = đang trong tầm nhìn camera (ACTIVE / vừa detect) */
  inCameraView?: boolean
  /** Lượt gặp SQLite — khóa upsert chấm heatmap. */
  presenceId?: number
  presenceSeq?: number
}

/* ── Seeded LCG — deterministic, no Math.random() ───────────── */
function makeLcg(seed: number) {
  let s = (seed ^ 0xdeadbeef) >>> 0
  return (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

function scatterDotsInSite(
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
  const dots: DetectionDot[] = []
  let attempts = 0
  const maxAttempts = Math.max(count * 50, 50)

  while (dots.length < count && attempts < maxAttempts) {
    attempts += 1
    const rawLat = center[0] + (rng() * 2 - 1) * spreadLat
    const rawLng = center[1] + (rng() * 2 - 1) * spreadLng
    const position = isPointInSiteBoundary(rawLat, rawLng)
      ? [parseFloat(rawLat.toFixed(6)), parseFloat(rawLng.toFixed(6))] as [number, number]
      : clampPointToSiteBoundary(rawLat, rawLng)

    if (!isPointInSiteBoundary(position[0], position[1])) continue

    dots.push({
      id: `${zoneId}-${type}-${dots.length}`,
      type,
      position,
      zoneId,
      cameraId: cameras[dots.length % cameras.length],
      confidence: parseFloat((0.75 + rng() * 0.24).toFixed(2)),
    })
  }

  return dots
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
  { zoneId: 'ZONE_SITE', personCount: 24, vehicleCount: 8, equipmentCount: 3, cameras: ['HC-01', 'HC-02'] },
]

function buildDetectionDots(): DetectionDot[] {
  const zoneMap = new Map(PATROL_GPS_ZONES.map(z => [z.zone_id, z]))
  const dots: DetectionDot[] = []
  let seedCounter = 1

  for (const cfg of ZONE_DETECTION_CONFIG) {
    const zone = zoneMap.get(cfg.zoneId)
    if (!zone) continue

    /* Spread rộng hơn zone — dot có thể ngoài polygon zone nhưng trong site */
    const spreadLat = 0.00028
    const spreadLng = 0.00035

    dots.push(
      ...scatterDotsInSite(cfg.zoneId, 'person',    zone.center, cfg.personCount,    spreadLat, spreadLng, seedCounter++, cfg.cameras),
      ...scatterDotsInSite(cfg.zoneId, 'vehicle',   zone.center, cfg.vehicleCount,   spreadLat, spreadLng, seedCounter++, cfg.cameras),
      ...scatterDotsInSite(cfg.zoneId, 'equipment', zone.center, cfg.equipmentCount, spreadLat, spreadLng, seedCounter++, cfg.cameras),
    )
  }

  return dots.filter(d => isPointInSiteBoundary(d.position[0], d.position[1]))
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
  person:    { color: '#38bdf8', radius: 3, weight: 1 },
  vehicle:   { color: '#f97316', radius: 3, weight: 1 },
  equipment: { color: '#a78bfa', radius: 3, weight: 1 },
}

/** Dot trong FOV camera — nhấp nháy; ngoài FOV — mờ. */
export const DETECTION_DOT_IN_VIEW_MS = 8000
export const DETECTION_DOT_OPACITY_IN_VIEW = 0.92
export const DETECTION_DOT_OPACITY_OUT_OF_VIEW = 0.28
