/**
 * Module 05 — lịch sử xuất hiện (blocks popup) từ BE.
 */
import { getVmsBackendUrl } from '@/modules/module03-safety/services/vmsDetections.service'
import { getMobileAiBackendUrl } from '@/modules/module02-training/services/mobileAiBackend.service'

export interface PatrolAppearanceBlock {
  id: string
  started_at: number
  ended_at: number
  zone_id?: string | null
  tier?: string
  event_id?: string | null
}

export interface PatrolAppearancesByCamera {
  [cameraId: string]: PatrolAppearanceBlock[]
}

function backendBase(): string {
  return (getMobileAiBackendUrl() || getVmsBackendUrl() || '').replace(/\/$/, '')
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function fetchPatrolAppearances(
  masterId: string,
  date?: string,
): Promise<{ byCamera: PatrolAppearancesByCamera; segments: PatrolAppearanceBlock[] }> {
  const base = backendBase()
  if (!base || !masterId.trim()) {
    return { byCamera: {}, segments: [] }
  }
  const params = new URLSearchParams({
    master_id: masterId.trim(),
    date: date ?? todayIsoDate(),
  })
  try {
    const res = await fetch(`${base}/patrol/appearances?${params.toString()}`, {
      mode: 'cors',
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return { byCamera: {}, segments: [] }
    const data = await res.json() as {
      ok?: boolean
      by_camera?: PatrolAppearancesByCamera
      segments?: PatrolAppearanceBlock[]
    }
    if (!data.ok) return { byCamera: {}, segments: [] }
    return {
      byCamera: data.by_camera ?? {},
      segments: data.segments ?? [],
    }
  } catch {
    return { byCamera: {}, segments: [] }
  }
}

export function formatAppearanceTimeRange(startSec: number, endSec: number): string {
  const fmt = (sec: number) => {
    const d = new Date(sec * 1000)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  }
  const a = fmt(startSec)
  const b = fmt(endSec)
  return a === b ? a : `${a} – ${b}`
}
