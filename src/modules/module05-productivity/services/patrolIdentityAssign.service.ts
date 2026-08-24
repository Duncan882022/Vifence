/**
 * Module 05 — gán định danh patrol qua BE (gallery enroll + DB bindings).
 */
import {
  buildHealthUrl,
  getMobileAiBackendUrl,
} from '@/modules/module02-training/services/mobileAiBackend.service'
import { expandPatrolIdentityAliasKeys } from '../services/patrolSgcObjectLink.service'

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

function backendBase(): string {
  const raw = getMobileAiBackendUrl().trim().replace(/\/$/, '')
  if (!raw) return ''
  return raw.startsWith('http') ? raw : `https://${raw}`
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...TUNNEL_HEADERS, ...(init?.headers ?? {}) },
    mode: 'cors',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<T>
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
  const base = backendBase()
  if (!base) {
    return { ok: false, error: 'no_backend' }
  }
  try {
    const health = await fetchJson<{ status?: string }>(buildHealthUrl(base))
    if (health.status !== 'ok') {
      return { ok: false, error: 'backend_unhealthy' }
    }
  } catch {
    return { ok: false, error: 'backend_unreachable' }
  }

  const aliasKeys = expandPatrolIdentityAliasKeys(input.objectKey)
  let imageB64: string | null = null
  if (input.snapshotUrl) {
    imageB64 = await fetchSnapshotAsBase64(input.snapshotUrl)
  }

  try {
    const data = await fetchJson<PatrolIdentityAssignResult>(
      `${base}/patrol/identity/assign`,
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
    )
    return data
  } catch {
    return { ok: false, error: 'assign_failed' }
  }
}

export async function fetchPatrolIdentityBindings(): Promise<PatrolIdentityBinding[]> {
  const base = backendBase()
  if (!base) return []
  try {
    const data = await fetchJson<{ ok: boolean; bindings?: PatrolIdentityBinding[] }>(
      `${base}/patrol/identity/bindings`,
    )
    return data.bindings ?? []
  } catch {
    return []
  }
}
