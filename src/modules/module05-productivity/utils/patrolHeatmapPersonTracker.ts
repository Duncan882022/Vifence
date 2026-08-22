import type { MobileAiDetection } from '@/modules/module02-training/services/mobileAiBackend.service'

const TRACK_EXPIRE_MS = 12_000
const IOU_MATCH = 0.22

export interface PersonTrack {
  trackId: string
  bbox: [number, number, number, number]
  workerId?: string
  workerName?: string
  lastSeen: number
}

function bboxIou(
  a: [number, number, number, number],
  b: [number, number, number, number],
): number {
  const ix1 = Math.max(a[0], b[0])
  const iy1 = Math.max(a[1], b[1])
  const ix2 = Math.min(a[2], b[2])
  const iy2 = Math.min(a[3], b[3])
  const iw = Math.max(0, ix2 - ix1)
  const ih = Math.max(0, iy2 - iy1)
  const inter = iw * ih
  if (inter <= 0) return 0
  const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1])
  const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1])
  const union = areaA + areaB - inter
  return union > 0 ? inter / union : 0
}

function isKnownWorkerId(id: string | undefined): id is string {
  return Boolean(id && id.trim() && id !== 'unknown')
}

function canonicalPersonId(track: PersonTrack): string {
  if (isKnownWorkerId(track.workerId)) return track.workerId.trim()
  return track.trackId
}

let nextTrackSeq = 1

export function matchPersonTracks(
  detections: MobileAiDetection[],
  tracks: Map<string, PersonTrack>,
  now = Date.now(),
): Array<{ personId: string; label: string; confidence: number }> {
  const persons = detections.filter(d => d.behavior === 'person' && d.bbox?.length === 4)
  const matchedTrackIds = new Set<string>()
  const out: Array<{ personId: string; label: string; confidence: number }> = []

  for (const det of persons) {
    const bbox = det.bbox
    let bestTrack: PersonTrack | null = null
    let bestIou = IOU_MATCH

    for (const track of tracks.values()) {
      if (matchedTrackIds.has(track.trackId)) continue
      const iou = bboxIou(bbox, track.bbox)
      if (iou <= bestIou) continue
      bestIou = iou
      bestTrack = track
    }

    let track: PersonTrack
    if (bestTrack) {
      track = bestTrack
      track.bbox = bbox
      track.lastSeen = now
      if (isKnownWorkerId(det.worker_id)) {
        track.workerId = det.worker_id.trim()
        track.workerName = det.worker_name?.trim() || track.workerName
      }
      matchedTrackIds.add(track.trackId)
    } else {
      const trackId = `trk-${String(nextTrackSeq).padStart(4, '0')}`
      nextTrackSeq += 1
      track = {
        trackId,
        bbox,
        workerId: isKnownWorkerId(det.worker_id) ? det.worker_id.trim() : undefined,
        workerName: det.worker_name?.trim() || undefined,
        lastSeen: now,
      }
      tracks.set(trackId, track)
      matchedTrackIds.add(trackId)
    }

    const personId = canonicalPersonId(track)
    const label = track.workerName?.trim()
      || (isKnownWorkerId(track.workerId) ? track.workerId : personId)
    out.push({
      personId,
      label,
      confidence: det.confidence,
    })
  }

  for (const [trackId, track] of tracks.entries()) {
    if (now - track.lastSeen > TRACK_EXPIRE_MS) {
      tracks.delete(trackId)
    }
  }

  return out
}

export function resetPersonTrackSeq(): void {
  nextTrackSeq = 1
}
