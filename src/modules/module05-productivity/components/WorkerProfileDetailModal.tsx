import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle, CheckCircle, Loader2, Pencil, ScanFace, Trash2, X,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { formatTime } from '@/utils/format'
import {
  deletePatrolWorkerProfile,
  fetchPatrolScanEnrollment,
  fetchPatrolWorkerProfile,
  updatePatrolWorkerProfile,
  type PatrolScanEnrollment,
  type PatrolWorkerPerson,
} from '../services/patrolWorkerProfile.service'
import {
  fetchPatrolGalleryFaces,
  resolveFrontGalleryFaceUrl,
  type PatrolGalleryFacePose,
} from '../services/patrolGalleryFaces.service'
import { patrolGalleryWorkerIdFromEmployeeCode } from '../utils/patrolIdentityEntity'

interface WorkerProfileDetailModalProps {
  persId: string | null
  initialMode?: 'view' | 'edit'
  onClose: () => void
  onChanged: () => void
}

function tsLabel(ts: number | null | undefined): string {
  if (!ts) return '—'
  return formatTime(new Date(ts * 1000))
}

function ProfileFaceGrid({
  poses,
  compact = false,
}: {
  poses: PatrolGalleryFacePose[]
  compact?: boolean
}) {
  const captured = poses.filter(p => p.captured && p.url)
  const capturedCount = captured.length
  const complete = poses.length > 0 && capturedCount >= poses.length

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
          Khuôn mặt đã quét
        </span>
        <span className={cn(
          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold border tabular-nums',
          complete
            ? 'bg-green-400/10 text-green-400 border-green-400/30'
            : capturedCount > 0
              ? 'bg-violet-400/10 text-violet-400 border-violet-400/30'
              : 'bg-amber-400/10 text-amber-400 border-amber-400/30',
        )}>
          <ScanFace className="w-2.5 h-2.5" />
          {capturedCount}/{poses.length || 4}
        </span>
      </div>
      <div className={cn(
        'grid gap-1.5',
        compact ? 'grid-cols-4' : 'grid-cols-2 sm:grid-cols-4',
      )}>
        {(poses.length > 0 ? poses : [1, 2, 3, 4].map(slot => ({
          slot,
          label: `Góc ${slot}`,
          captured: false,
          filename: '',
          url: null,
        }))).map(pose => (
          <div
            key={pose.slot}
            className="relative aspect-square rounded-lg overflow-hidden border border-[#1e2433] bg-[#0a0e17]"
          >
            {pose.url ? (
              <img
                src={pose.url}
                alt={pose.label}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/40 p-1">
                <ScanFace className="w-4 h-4 mb-0.5" />
                <span className="text-[7px] text-center leading-tight">{pose.label}</span>
              </div>
            )}
            {pose.captured && (
              <span className="absolute top-0.5 right-0.5 rounded-full bg-black/55 p-0.5">
                <CheckCircle className="w-3 h-3 text-green-400" />
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export function WorkerProfileDetailModal({
  persId,
  initialMode = 'view',
  onClose,
  onChanged,
}: WorkerProfileDetailModalProps) {
  const [mode, setMode] = useState<'view' | 'edit'>(initialMode)
  const [person, setPerson] = useState<PatrolWorkerPerson | null>(null)
  const [enrollment, setEnrollment] = useState<PatrolScanEnrollment | null>(null)
  const [facePoses, setFacePoses] = useState<PatrolGalleryFacePose[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [fullName, setFullName] = useState('')
  const [employeeCode, setEmployeeCode] = useState('')
  const [contractor, setContractor] = useState('')

  const frontFaceUrl = useMemo(
    () => resolveFrontGalleryFaceUrl(facePoses),
    [facePoses],
  )

  const load = useCallback(async () => {
    if (!persId) return
    setLoading(true)
    setError(null)
    try {
      const [p, e] = await Promise.all([
        fetchPatrolWorkerProfile(persId),
        fetchPatrolScanEnrollment(persId).catch(() => null),
      ])
      setPerson(p)
      setEnrollment(e)
      setFullName(p.full_name ?? '')
      setEmployeeCode(p.employee_code ?? '')
      setContractor(p.contractor ?? '')

      const wid = p.employee_code?.trim()
        ? patrolGalleryWorkerIdFromEmployeeCode(p.employee_code)
        : null
      if (wid) {
        const poses = await fetchPatrolGalleryFaces(wid).catch(() => [])
        setFacePoses(poses)
      } else {
        setFacePoses([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được hồ sơ.')
    } finally {
      setLoading(false)
    }
  }, [persId])

  useEffect(() => {
    setMode(initialMode)
    setConfirmDelete(false)
    if (persId) void load()
    else {
      setPerson(null)
      setEnrollment(null)
      setFacePoses([])
    }
  }, [persId, initialMode, load])

  if (!persId) return null

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!persId) return
    setSaving(true)
    setError(null)
    try {
      const updated = await updatePatrolWorkerProfile(persId, {
        full_name: fullName.trim(),
        employee_code: employeeCode.trim(),
        contractor: contractor.trim(),
      })
      setPerson(updated)
      setMode('view')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lưu thất bại.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!persId) return
    setDeleting(true)
    setError(null)
    try {
      await deletePatrolWorkerProfile(persId)
      onChanged()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xóa thất bại.')
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const scanHref = person?.employee_code
    ? `/module05/quet-mat?code=${encodeURIComponent(person.employee_code)}`
    : '/module05/quet-mat'

  const displayPoses = facePoses.length > 0
    ? facePoses
    : (enrollment?.poses ?? []).map(p => ({
      slot: p.slot,
      label: p.label,
      captured: p.captured,
      filename: '',
      url: null as string | null,
    }))

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-label="Đóng"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-xl border border-[#1e2433] bg-[#0b0f1a] shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-4 py-3 border-b border-[#1e2433] bg-[#0b0f1a]/95 backdrop-blur-sm">
          <h3 className="text-sm font-bold">
            {mode === 'edit' ? 'Sửa hồ sơ' : 'Chi tiết hồ sơ'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {loading ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : person && mode === 'view' ? (
            <>
              <div className="flex items-start gap-3 rounded-lg border border-[#1e2433] bg-[#0a0e17] p-3">
                <div className="w-14 h-14 shrink-0 rounded-xl overflow-hidden border border-[#1e2433] bg-[#070a12] flex items-center justify-center">
                  {frontFaceUrl ? (
                    <img src={frontFaceUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ScanFace className="w-6 h-6 text-violet-400/50" />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-semibold leading-snug">{person.full_name ?? person.display_name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {[person.employee_code, person.contractor].filter(Boolean).join(' · ') || '—'}
                  </p>
                  <p className="text-[9px] text-muted-foreground/70 font-mono truncate">{person.pers_id}</p>
                </div>
              </div>

              <ProfileFaceGrid poses={displayPoses} />

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground border-t border-[#1e2433]/80 pt-3">
                <span>Lần đầu: <strong className="text-foreground/90">{tsLabel(person.first_seen)}</strong></span>
                <span>Lần cuối: <strong className="text-foreground/90">{tsLabel(person.last_seen)}</strong></span>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setMode('edit')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold border border-[#1e2433] hover:bg-[#1a2235]"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Sửa
                </button>
                <Link
                  to={scanHref}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold bg-violet-500 text-white hover:bg-violet-500/90"
                  onClick={onClose}
                >
                  <ScanFace className="w-3.5 h-3.5" />
                  Quét mặt
                </Link>
                {!confirmDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold text-red-400 border border-red-500/30 hover:bg-red-500/10 ml-auto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Xóa
                  </button>
                ) : (
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-[10px] text-red-300">Xóa hẳn hồ sơ?</span>
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={() => void handleDelete()}
                      className="px-2.5 py-1.5 rounded text-[10px] font-bold bg-red-500 text-white disabled:opacity-50"
                    >
                      {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Xóa'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="px-2.5 py-1.5 rounded text-[10px] border border-[#1e2433]"
                    >
                      Huỷ
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : person && mode === 'edit' ? (
            <form onSubmit={e => void handleSave(e)} className="space-y-4">
              <div className="space-y-3">
                <label className="block space-y-1">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Họ tên *</span>
                  <input
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[#1e2433] bg-[#0a0e17] outline-none focus:border-violet-400/50"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Mã nhân viên *</span>
                  <input
                    value={employeeCode}
                    onChange={e => setEmployeeCode(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[#1e2433] bg-[#0a0e17] outline-none font-mono focus:border-violet-400/50"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Đơn vị</span>
                  <input
                    value={contractor}
                    onChange={e => setContractor(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[#1e2433] bg-[#0a0e17] outline-none focus:border-violet-400/50"
                  />
                </label>
              </div>

              <div className="rounded-lg border border-[#1e2433] bg-[#0a0e17] p-3 space-y-2">
                <ProfileFaceGrid poses={displayPoses} compact />
                <Link
                  to={scanHref}
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-violet-400 hover:text-violet-300"
                >
                  <ScanFace className="w-3.5 h-3.5" />
                  Quét mặt để cập nhật ảnh
                </Link>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setMode('view')}
                  className="flex-1 py-2 rounded-lg text-[11px] font-semibold border border-[#1e2433] hover:bg-[#1a2235]"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-[2] inline-flex items-center justify-center gap-2 py-2 rounded-lg text-[11px] font-semibold bg-violet-500 text-white disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          ) : null}

          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg border border-red-500/25 bg-red-500/10 text-red-400 text-[11px]">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
