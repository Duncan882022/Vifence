import { fetchPatrol, patrolBackendBase } from '@/services/patrolApiClient'

export interface PatrolGalleryFacePose {
  slot: number
  label: string
  captured: boolean
  filename: string
  url: string | null
}

export interface PatrolGalleryFacesResponse {
  ok: boolean
  worker_id?: string
  worker_name?: string | null
  employee_code?: string | null
  poses?: PatrolGalleryFacePose[]
  poses_captured?: number
  complete?: boolean
}

function absolutizeGalleryFaceUrl(relative: string | null | undefined): string | null {
  const raw = relative?.trim()
  if (!raw) return null
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
  const base = patrolBackendBase()
  if (!base) return raw
  return `${base}${raw.startsWith('/') ? raw : `/${raw}`}`
}

export async function fetchPatrolGalleryFaces(
  workerId: string,
): Promise<PatrolGalleryFacePose[]> {
  const id = workerId.trim()
  if (!id) return []
  const data = await fetchPatrol<PatrolGalleryFacesResponse>(
    `/patrol/gallery/${encodeURIComponent(id)}/faces`,
    undefined,
    12_000,
  )
  if (!data?.ok || !Array.isArray(data.poses)) return []
  return data.poses.map(pose => ({
    ...pose,
    url: absolutizeGalleryFaceUrl(pose.url),
  }))
}

export function resolveFrontGalleryFaceUrl(poses: PatrolGalleryFacePose[]): string | null {
  const front = poses.find(p => p.slot === 1 && p.captured && p.url)?.url
  if (front) return front
  return poses.find(p => p.captured && p.url)?.url ?? null
}

export function listCapturedGalleryFacePoses(poses: PatrolGalleryFacePose[]): PatrolGalleryFacePose[] {
  return poses.filter(p => p.captured && p.url)
}
