import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Loader2, ScanFace } from 'lucide-react'
import { cn } from '@/utils/cn'
import {
  fetchPatrolScanEnrollment,
  type PatrolScanEnrollment,
  type PatrolWorkerPerson,
} from '../services/patrolWorkerProfile.service'
import { fetchPatrolGalleryFaces } from '../services/patrolGalleryFaces.service'
import { patrolGalleryWorkerIdFromEmployeeCode } from '../utils/patrolIdentityEntity'
import { defaultFaceScanPoses } from '../utils/patrolFaceScanPoses'

export interface ProfileFacePose {
  slot: number
  label: string
  captured: boolean
  url: string | null
}

interface WorkerProfileFaceGalleryProps {
  person: PatrolWorkerPerson
  compact?: boolean
}

function mergeProfileFacePoses(
  enrollment: PatrolScanEnrollment,
  galleryUrls: Map<number, string | null>,
): ProfileFacePose[] {
  const base = enrollment.poses?.length ? enrollment.poses : defaultFaceScanPoses()
  return base.map(pose => ({
    slot: pose.slot,
    label: pose.label,
    captured: pose.captured,
    url: pose.url ?? galleryUrls.get(pose.slot) ?? null,
  }))
}

export function WorkerProfileFaceGallery({ person, compact = false }: WorkerProfileFaceGalleryProps) {
  const [poses, setPoses] = useState<ProfileFacePose[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const enrollment = await fetchPatrolScanEnrollment(person.pers_id)
      const galleryUrls = new Map<number, string | null>()
      for (const p of enrollment.poses ?? []) {
        if (p.url) galleryUrls.set(p.slot, p.url)
      }
      const code = (person.employee_code ?? '').trim()
      if (person.status === 'identified' && code && galleryUrls.size === 0) {
        const galleryId = patrolGalleryWorkerIdFromEmployeeCode(code)
        const galleryPoses = await fetchPatrolGalleryFaces(galleryId)
        for (const p of galleryPoses) {
          if (p.captured && p.url) galleryUrls.set(p.slot, p.url)
        }
      }
      setPoses(mergeProfileFacePoses(enrollment, galleryUrls))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được gallery mặt.')
      setPoses(defaultFaceScanPoses().map(p => ({ ...p, url: null })))
    } finally {
      setLoading(false)
    }
  }, [person.employee_code, person.pers_id, person.status])

  useEffect(() => {
    void load()
  }, [load])

  const capturedCount = poses.filter(p => p.captured).length
  const canSupplementScan = person.status === 'identified' && Boolean(person.employee_code?.trim())
  const scanHref = canSupplementScan
    ? `/module05/quet-mat?code=${encodeURIComponent(person.employee_code!.trim())}`
    : null

  return (
    <div className={cn('rounded-lg border border-[#1e2433] bg-[#0a0e17]', compact ? 'p-2.5' : 'p-3')}>
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <ScanFace className="w-3 h-3 text-violet-400" />
            Gallery mặt · 4 góc
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {person.status === 'draft'
              ? 'Vector từ camera — ảnh JPG sau khi xác minh / quét mặt.'
              : 'Ảnh đã quét — dùng để bổ sung góc còn thiếu.'}
          </p>
        </div>
        <span className={cn(
          'shrink-0 px-1.5 py-0.5 rounded text-[9px] font-semibold tabular-nums border',
          capturedCount >= 4
            ? 'text-green-400 border-green-400/30 bg-green-400/10'
            : 'text-violet-400 border-violet-400/30 bg-violet-400/10',
        )}>
          {capturedCount}/4
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-8 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {poses.map(pose => (
            <div
              key={pose.slot}
              className={cn(
                'rounded-md border overflow-hidden',
                pose.captured
                  ? 'border-green-500/25 bg-green-500/5'
                  : 'border-[#1e2433] bg-[#0b0f1a]',
              )}
            >
              <div className={cn('relative bg-black', compact ? 'aspect-square' : 'aspect-[3/4]')}>
                {pose.url ? (
                  <img
                    src={pose.url}
                    alt={pose.label}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
                    <ScanFace className="w-5 h-5 opacity-40" />
                    <span className="text-[8px] uppercase tracking-wide opacity-70">
                      {pose.captured ? 'Vector' : 'Thiếu'}
                    </span>
                  </div>
                )}
                {pose.captured && (
                  <span className="absolute top-1 right-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-500/90 text-white">
                    <Check className="w-2.5 h-2.5" />
                  </span>
                )}
              </div>
              <p className={cn(
                'px-1.5 py-1 text-[9px] font-medium truncate text-center',
                pose.captured ? 'text-green-400' : 'text-muted-foreground',
              )}>
                {pose.label}
              </p>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="text-[10px] text-amber-400 mt-2">{error}</p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {scanHref ? (
          <Link
            to={scanHref}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-semibold border border-violet-400/30 text-violet-300 hover:bg-violet-500/10"
          >
            <ScanFace className="w-3 h-3" />
            Bổ sung góc mặt
          </Link>
        ) : person.status === 'draft' ? (
          <span className="text-[10px] text-amber-300/80">
            Xác minh hồ sơ trước — sau đó quét bổ sung tại Quét mặt.
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Làm mới gallery
        </button>
      </div>
    </div>
  )
}
