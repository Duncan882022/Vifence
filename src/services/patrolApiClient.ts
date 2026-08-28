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

/** Demo CMS / VPS build — credentials baked at build (khớp PATROL_AUTH_USERS backend). */
function demoPatrolCredentials(): { username: string; password: string } | null {
  const username = import.meta.env.VITE_PATROL_DEMO_USERNAME?.trim()
  const password = import.meta.env.VITE_PATROL_DEMO_PASSWORD?.trim()
  if (username && password) return { username, password }
  return null
}

let ensureAuthPromise: Promise<boolean> | null = null

const snapshotSignCache = new Map<string, { token: string; exp: number }>()

/**
 * Tự đăng nhập patrol khi build có VITE_PATROL_DEMO_* (ghpages/VPS).
 * Backend bật JWT — /patrol/metrics, /patrol/day/* cần Bearer.
 */
export async function ensurePatrolAuth(): Promise<boolean> {
  if (getPatrolAccessToken()) return true
  const creds = demoPatrolCredentials()
  if (!creds) return false
  if (!ensureAuthPromise) {
    ensureAuthPromise = patrolSignin(creds.username, creds.password)
      .then(res => Boolean(res?.ok && res.access_token))
      .finally(() => {
        ensureAuthPromise = null
      })
  }
  return ensureAuthPromise
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
  await ensurePatrolAuth()
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  }
  const token = getPatrolAccessToken()
  if (token) {
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
    if (res.status === 401 && token) {
      clearPatrolAccessToken()
      const reauthed = await ensurePatrolAuth()
      const retryToken = getPatrolAccessToken()
      if (reauthed && retryToken) {
        const retryHeaders = { ...headers, Authorization: `Bearer ${retryToken}` }
        const retry = await fetch(`${base}${path}`, {
          ...init,
          headers: retryHeaders,
          signal: controller.signal,
          mode: 'cors',
        })
        if (!retry.ok) return null
        return (await retry.json()) as T
      }
    }
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
  const trimmed = path.trim()
  if (!trimmed) return null

  const cached = snapshotSignCache.get(trimmed)
  if (cached && cached.exp * 1000 > Date.now() + 30_000) {
    const q = encodeURIComponent(trimmed)
    return `${base}/patrol/snapshot?path=${q}&token=${cached.token}&exp=${cached.exp}`
  }

  const signed = await fetchPatrol<{ ok: boolean; token: string; exp: number }>(
    '/patrol/snapshot/sign',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: trimmed }),
    },
  )
  if (!signed?.ok) return null
  snapshotSignCache.set(trimmed, { token: signed.token, exp: signed.exp })
  const q = encodeURIComponent(trimmed)
  return `${base}/patrol/snapshot?path=${q}&token=${signed.token}&exp=${signed.exp}`
}
