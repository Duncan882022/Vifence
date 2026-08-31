/**
 * Module 05 — gán định danh patrol qua BE (gallery enroll + DB bindings).
 */
import { fetchPatrol, patrolBackendBase } from '@/services/patrolApiClient'
import { expandPatrolIdentityAliasKeys } from '../services/patrolTkObjectLink.service'

const TUNNEL_HEADERS: Record<string, string> = {
  'ngrok-skip-browser-warning': 'true',
}

export interface PatrolIdentityBinding {
  gallery_worker_id: string
  worker_name: string | null
  employee_code: string | null
  contractor_name: string | null
  aliases: string[]
  updated_at?: number
}

export interface PatrolIdentityAssignResult {
  ok: boolean
  error?: string
  gallery_worker_id?: string
  worker_name?: string
  employee_code?: string
  contractor_name?: string
  face_enrolled?: boolean
}

export async function fetchSnapshotAsBase64(snapshotUrl: string): Promise<string | null> {
  const url = snapshotUrl.trim()
  if (!url) return null
  try {
    if (url.startsWith('data:')) {
      const comma = url.indexOf(',')
      return comma >= 0 ? url.slice(comma + 1) : null
    }
    const res = await fetch(url, { headers: TUNNEL_HEADERS, mode: 'cors' })
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise(resolve => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const data = reader.result
        if (typeof data !== 'string') {
          resolve(null)
          return
        }
        const comma = data.indexOf(',')
        resolve(comma >= 0 ? data.slice(comma + 1) : null)
      }
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export async function assignPatrolIdentityOnBackend(input: {
  objectKey: string
  workerName: string
  employeeCode: string
  contractorName: string
  snapshotUrl?: string | null
  cameraId?: string | null
  trackId?: string | null
}): Promise<PatrolIdentityAssignResult> {
  const base = patrolBackendBase()
  if (!base) {
    return { ok: false, error: 'no_backend' }
  }

  const health = await fetchPatrol<{ status?: string }>('/health', undefined, 8_000)
  if (!health || health.status !== 'ok') {
    return { ok: false, error: health ? 'backend_unhealthy' : 'backend_unreachable' }
  }

  const aliasKeys = expandPatrolIdentityAliasKeys(input.objectKey)
  let imageB64: string | null = null
  if (input.snapshotUrl) {
    imageB64 = await fetchSnapshotAsBase64(input.snapshotUrl)
  }

  const data = await fetchPatrol<PatrolIdentityAssignResult>(
    '/patrol/identity/assign',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        object_key: input.objectKey,
        worker_name: input.workerName,
        employee_code: input.employeeCode,
        contractor_name: input.contractorName,
        image_b64: imageB64,
        alias_keys: aliasKeys,
        camera_id: input.cameraId ?? undefined,
        track_id: input.trackId ?? undefined,
      }),
    },
    20_000,
  )

  if (!data) return { ok: false, error: 'assign_failed' }
  return data
}

export async function fetchPatrolIdentityBindings(): Promise<PatrolIdentityBinding[]> {
  const data = await fetchPatrol<{
    ok: boolean
    bindings?: PatrolIdentityBinding[]
    alias_to_gallery?: Record<string, string>
  }>(
    '/patrol/identity/bindings',
  )
  const bindings = data?.bindings ?? []
  const aliasMap = data?.alias_to_gallery ?? {}
  if (Object.keys(aliasMap).length === 0) return bindings
  return bindings.map(row => {
    const wid = row.gallery_worker_id.trim()
    const canonical = (row.aliases ?? []).filter(alias => {
      const owner = aliasMap[alias.trim()] ?? aliasMap[alias]
      return String(owner ?? '').trim() === wid
    })
    return { ...row, aliases: canonical.length > 0 ? canonical : row.aliases }
  })
}
