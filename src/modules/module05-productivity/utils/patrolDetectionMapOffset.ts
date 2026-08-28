/**
 * Vị trí chấm Người / Định danh trên bản đồ — lệch phía trước mũ (~3.5 m theo heading).
 *
 * Polygon đỏ (công trường) rộng hàng trăm mét — 3.5 m trên bản đồ vẫn rất nhỏ; nhiều chấm
 * có thể chồng nhau. Mỗi chấm = một lượt presence (L#) — upsert cập nhật vị trí tại chỗ.
 */
import { clampPointToSiteInterior } from '../data/patrolSiteGeometry'
import { offsetLatLngByMeters } from './patrolLivePersonDots'

/** Khoảng cách mặc định phía trước mũ (m) — quan sát quanh nắp, không chồng icon mũ. */
export const PATROL_DETECTION_FORWARD_M = 3.5
/** Trải ngang tối đa khi nhiều lượt presence (m). */
export const PATROL_DETECTION_LATERAL_MAX_M = 1.5
/** GPS gần mũ hơn ngưỡng này → coi là chồng mũ, cần offset. */
export const PATROL_HELMET_COLLAPSE_THRESHOLD_M = 4

export function haversineM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const r = 6_371_000
  const p1 = (lat1 * Math.PI) / 180
  const p2 = (lat2 * Math.PI) / 180
  const dp = ((lat2 - lat1) * Math.PI) / 180
  const dl = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dp / 2) ** 2
    + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)))
}

function lateralOffsetM(offsetSeed: string): number {
  let h = 2166136261
  for (let i = 0; i < offsetSeed.length; i++) {
    h ^= offsetSeed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const t = ((h >>> 0) % 1000) / 1000
  return (t - 0.5) * 2 * PATROL_DETECTION_LATERAL_MAX_M
}

/** Đặt chấm phía trước mũ theo heading + lệch ngang nhẹ theo offsetSeed (presence id). */
export function offsetPatrolDetectionFromHelmet(
  helmetLat: number,
  helmetLng: number,
  headingDeg: number,
  offsetSeed: string,
  forwardM = PATROL_DETECTION_FORWARD_M,
): [number, number] {
  const br = (headingDeg * Math.PI) / 180
  const lateral = lateralOffsetM(offsetSeed)
  const forwardNorth = forwardM * Math.cos(br)
  const forwardEast = forwardM * Math.sin(br)
  const lateralNorth = lateral * Math.cos(br + Math.PI / 2)
  const lateralEast = lateral * Math.sin(br + Math.PI / 2)
  const [lat, lng] = offsetLatLngByMeters(
    helmetLat,
    helmetLng,
    forwardEast + lateralEast,
    forwardNorth + lateralNorth,
  )
  return clampPointToSiteInterior(lat, lng)
}

/** Không có heading — lệch về phía nam (dưới trên bản đồ) + ngang nhẹ. */
export function offsetPatrolDetectionBelowHelmet(
  helmetLat: number,
  helmetLng: number,
  offsetSeed: string,
  forwardM = PATROL_DETECTION_FORWARD_M,
): [number, number] {
  const lateral = lateralOffsetM(offsetSeed)
  const [lat, lng] = offsetLatLngByMeters(helmetLat, helmetLng, lateral, -forwardM)
  return clampPointToSiteInterior(lat, lng)
}

export function resolvePatrolDetectionMapPosition(
  rawLat: number,
  rawLng: number,
  offsetSeed: string,
  helmetPosition: [number, number] | null | undefined,
  headingDeg: number | null | undefined,
): [number, number] {
  if (!helmetPosition) {
    return clampPointToSiteInterior(rawLat, rawLng)
  }
  const [helmetLat, helmetLng] = helmetPosition
  if (
    haversineM(rawLat, rawLng, helmetLat, helmetLng) > PATROL_HELMET_COLLAPSE_THRESHOLD_M
  ) {
    return clampPointToSiteInterior(rawLat, rawLng)
  }
  if (headingDeg != null && Number.isFinite(headingDeg)) {
    return offsetPatrolDetectionFromHelmet(
      helmetLat,
      helmetLng,
      headingDeg,
      offsetSeed,
    )
  }
  return offsetPatrolDetectionBelowHelmet(helmetLat, helmetLng, offsetSeed)
}
