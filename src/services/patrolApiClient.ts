/**
 * Patrol API client — tự gắn Bearer token từ localStorage.
 */
import { IS_DEMO_AUTH } from '@/modules/dao-tao-tuan-thu/services/ghpagesDemo.service'
import { getVmsBackendUrl } from '@/modules/module03-safety/services/vmsDetections.service'
import { getMobileAiBackendUrl } from '@/modules/module02-training/services/mobileAiBackend.service'

const TOKEN_KEY = 'vifence_patrol_access_token'
const LEGACY_TOKEN_KEY = 'vifence_access_token'

export interface PatrolAuthUser {
  username: string
  role: string
}

export interface PatrolSigninResponse {
  ok: boolean
  access_token: string
  token_type: string
  user: PatrolAuthUser
}

export function patrolBackendBase(): string {
  const explicit = import.meta.env.VITE_PATROL_BACKEND_URL
  if (typeof explicit === 'string' && explicit.trim()) {
    return explicit.trim().replace(/\/+$/, '')
  }
  return getVmsBackendUrl() || getMobileAiBackendUrl() || ''
}

export function getPatrolAccessToken(): string | null {
  if (typeof localStorage === 'undefined') return null
  return (
    localStorage.getItem(TOKEN_KEY)
    || localStorage.getItem(LEGACY_TOKEN_KEY)
  )
}

export function setPatrolAccessToken(token: string, user?: PatrolAuthUser): void {
  localStorage.setItem(TOKEN_KEY, token)
  if (user) {
    localStorage.setItem('vifence_patrol_user', JSON.stringify(user))
  }
}

export function clearPatrolAccessToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem('vifence_patrol_user')
}

export function getPatrolAuthUser(): PatrolAuthUser | null {
  if (IS_DEMO_AUTH) return { username: 'demo', role: 'admin' }
  const raw = localStorage.getItem('vifence_patrol_user')
  if (!raw) return null
  try {
    return JSON.parse(raw) as PatrolAuthUser
  } catch {
    return null
  }
}

export function isPatrolAuthenticated(): boolean {
  return IS_DEMO_AUTH || Boolean(getPatrolAccessToken())
}

export function hasPatrolRole(minimum: 'viewer' | 'operator' | 'hr' | 'admin'): boolean {
  if (IS_DEMO_AUTH) return true
  const user = getPatrolAuthUser()
  if (!user) return false
  const rank: Record<string, number> = { viewer: 0, operator: 1, hr: 2, admin: 3 }
  return (rank[user.role] ?? -1) >= (rank[minimum] ?? 99)
}

export async function patrolSignin(username: string, password: string): Promise<PatrolSigninResponse | null> {
  const base = patrolBackendBase()
  if (!base) return null
  const res = await fetch(`${base}/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) return null
  const data = (await res.json()) as PatrolSigninResponse
  if (data.ok && data.access_token) {
    setPatrolAccessToken(data.access_token, data.user)
  }
  return data
}

export async function fetchPatrol<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = 12_000,
): Promise<T | null> {
  const base = patrolBackendBase()
  if (!base) return null
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  }
  const token = getPatrolAccessToken()
  if (token && !IS_DEMO_AUTH) {
    headers.Authorization = `Bearer ${token}`
  }
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
      mode: 'cors',
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  } finally {
    window.clearTimeout(timer)
  }
}

export async function signPatrolSnapshot(path: string): Promise<string | null> {
  const base = patrolBackendBase()
  if (!base) return null
  const signed = await fetchPatrol<{ ok: boolean; token: string; exp: number }>(
    '/patrol/snapshot/sign',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    },
  )
  if (!signed?.ok) return null
  const q = encodeURIComponent(path)
  return `${base}/patrol/snapshot?path=${q}&token=${signed.token}&exp=${signed.exp}`
}
