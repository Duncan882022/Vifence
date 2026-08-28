/**
 * Tự đăng nhập patrol khi mở trang phát sóng (/phat-song).
 *
 * Trang kiosk không qua ProtectedRoute — người đeo mũ không cần biết tài khoản
 * CMS. Backend bật JWT nên kênh telemetry GPS cần token; hook này lấy token trước
 * khi bắt đầu phát sóng.
 */
import { useEffect, useState } from 'react'
import {
  getPatrolAccessToken,
  patrolSignin,
} from '@/services/patrolApiClient'

function readPublisherCreds(): { username: string; password: string } | null {
  const username = import.meta.env.VITE_HELMET_PUBLISHER_USER?.trim()
  const password = import.meta.env.VITE_HELMET_PUBLISHER_PASS?.trim()
  if (!username || !password) return null
  return { username, password }
}

export type PublisherAuthState = 'idle' | 'ready' | 'failed'

export function usePublisherPatrolAuth(): PublisherAuthState {
  const [state, setState] = useState<PublisherAuthState>(() =>
    getPatrolAccessToken() ? 'ready' : 'idle',
  )

  useEffect(() => {
    if (getPatrolAccessToken()) {
      setState('ready')
      return
    }

    const creds = readPublisherCreds()
    if (!creds) {
      setState('failed')
      return
    }

    let cancelled = false
    void (async () => {
      const res = await patrolSignin(creds.username, creds.password)
      if (cancelled) return
      setState(res?.ok && res.access_token ? 'ready' : 'failed')
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return state
}
