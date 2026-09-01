import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  Building2,
  CheckCircle,
  Clock,
  Hash,
  Info,
  Loader2,
  Pencil,
  ScanFace,
  Trash2,
  User,
  X,
  type LucideIcon,
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
  listCapturedGalleryFacePoses,
  resolveFrontGalleryFaceUrl,
  type PatrolGalleryFacePose,
} from '../services/patrolGalleryFaces.service'
import { patrolGalleryWorkerIdFromEmployeeCode } from '../utils/patrolIdentityEntity'
import { defaultFaceScanPoses } from '../utils/patrolFaceScanPoses'

interface WorkerProfileDetailModalProps {
  persId: string | null
  initialMode?: 'view' | 'edit'
  onClose: () => void
  onChanged: () => void
}

interface ProfileDetailRowProps {
  icon: LucideIcon
  label: string
  value: string
  iconClassName?: string
  mono?: boolean
}

function ProfileDetailRow({
  icon: Icon,
  label,
  value,
  iconClassName,
  mono,
}: ProfileDetailRowProps) {
  return (
    <div className="flex items-start gap-2.5 min-w-0">
      <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 border border-[#1e2433] bg-[#0a0e17]">
        <Icon className={cn('w-3.5 h-3.5', iconClassName)} aria-hidden />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-[8px] uppercase tracking-wide text-muted-foreground/70">{label}</p>
        <p className={cn(
          'text-[11px] text-foreground font-medium mt-0.5 leading-snug break-all',
          mono && 'font-mono',
        )}>
          {value}
        </p>
      </div>
    </div>
  )
}

function ProfileSection({
  icon: Icon,
  title,
  iconClassName,
  children,
}: {
  icon: LucideIcon
  title: string
  iconClassName?: string
  children: ReactNode
}) {
  return (
    <div className="rounded-lg border border-[#1e2433] bg-[#0c1019] px-3 py-2.5 space-y-2.5">
      <div className="flex items-center gap-1.5">
        <Icon className={cn('w-3.5 h-3.5 shrink-0', iconClassName)} aria-hidden />
        <span className="text-[10px] font-semibold text-foreground uppercase tracking-wide">
          {title}
        </span>
      </div>
      {children}
    </div>
  )
}

function FaceEnrollmentBadge({ captured, total, complete }: {
  captured: number
  total: number
  complete?: boolean
}) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold border tabular-nums',
      complete
        ? 'bg-green-400/10 text-green-400 border-green-400/30'
        : captured > 0
          ? 'bg-fuchsia-400/10 text-fuchsia-400 border-fuchsia-400/30'
          : 'bg-amber-400/10 text-amber-400 border-amber-400/30',
    )}>
      <ScanFace className="w-2.5 h-2.5" />
      {captured}/{total}
    </span>
  )
}

function tsLabel(ts: number | null | undefined): string {
  if (!ts) return '—'
  return formatTime(new Date(ts * 1000))
}

const INPUT_CLASS = 'w-full px-3 py-2 text-[11px] rounded-lg border border-[#1e2433] bg-[#0a0e17] outline-none focus:border-fuchsia-400/50 focus:ring-1 focus:ring-fuchsia-400/20'

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
  const [selectedFaceSlot, setSelectedFaceSlot] = useState<number | null>(null)
  const [faceGalleryOpen, setFaceGalleryOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [fullName, setFullName] = useState('')
  const [employeeCode, setEmployeeCode] = useState('')
  const [contractor, setContractor] = useState('')

  const capturedFacePoses = useMemo(
    () => listCapturedGalleryFacePoses(facePoses),
    [facePoses],
  )

  const frontFaceUrl = useMemo(
    () => resolveFrontGalleryFaceUrl(facePoses),
    [facePoses],
  )

  const selectedFaceUrl = useMemo(() => {
    if (selectedFaceSlot != null) {
      return capturedFacePoses.find(p => p.slot === selectedFaceSlot)?.url ?? null
    }
    return frontFaceUrl
  }, [capturedFacePoses, frontFaceUrl, selectedFaceSlot])

  const displayPoses = useMemo(() => {
    if (facePoses.length > 0) return facePoses
    if (enrollment?.poses?.length) {
      return enrollment.poses.map(p => ({
        slot: p.slot,
        label: p.label,
        captured: p.captured,
        filename: '',
        url: null as string | null,
      }))
    }
    return defaultFaceScanPoses().map(p => ({
      ...p,
      filename: '',
      url: null as string | null,
    }))
  }, [enrollment?.poses, facePoses])

  const facesCaptured = capturedFacePoses.length
  const facesRequired = displayPoses.length || 4
  const facesComplete = person?.face_enrollment_complete ?? (facesCaptured >= facesRequired)

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
        const captured = listCapturedGalleryFacePoses(poses)
        if (captured[0]) setSelectedFaceSlot(captured[0].slot)
      } else {
        setFacePoses([])
        setSelectedFaceSlot(null)
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
    setFaceGalleryOpen(false)
    if (persId) void load()
    else {
      setPerson(null)
      setEnrollment(null)
      setFacePoses([])
      setSelectedFaceSlot(null)
    }
  }, [persId, initialMode, load])

  useEffect(() => {
    if (!persId) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [persId, onClose])

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

  const modalTitle = person
    ? (person.full_name ?? person.display_name)
    : (mode === 'edit' ? 'Sửa hồ sơ' : 'Chi tiết hồ sơ')

  const modalSubtitle = person
    ? [person.employee_code, person.contractor].filter(Boolean).join(' · ') || person.pers_id
    : ''

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-[2px] p-0 sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative flex flex-col w-full sm:max-w-md max-h-[96dvh] sm:max-h-[92vh] rounded-t-2xl sm:rounded-xl border border-[#2a3855] bg-[#0a0e17] shadow-2xl shadow-black/60"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="worker-profile-detail-title"
      >
        <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-3 border-b border-[#1e2433] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border bg-fuchsia-400/10 border-fuchsia-400/30">
              <User className="w-3.5 h-3.5 text-fuchsia-400" aria-hidden />
            </div>
            <div className="min-w-0">
              <p id="worker-profile-detail-title" className="text-[13px] font-semibold text-foreground leading-snug line-clamp-2">
                {mode === 'edit' ? 'Sửa hồ sơ' : modalTitle}
              </p>
              {mode === 'view' && modalSubtitle && (
                <p className="text-[9px] mt-0.5 truncate text-muted-foreground">{modalSubtitle}</p>
              )}
              {mode === 'edit' && person && (
                <p className="text-[9px] mt-0.5 truncate">
                  <span className="font-medium text-fuchsia-400">Định danh</span>
                  <span className="text-muted-foreground">{` · ${person.pers_id}`}</span>
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#1e2433] text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {faceGalleryOpen && selectedFaceUrl && mode === 'view' && (
          <div className="shrink-0 px-3 sm:px-4 pt-3 pb-2 border-b border-[#1e2433]/70 bg-[#0a0e17] space-y-2">
            <div className="relative aspect-[4/3] max-h-[36dvh] rounded-lg overflow-hidden border border-[#1e2433] bg-black">
              <img
                src={selectedFaceUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-contain"
              />
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-3 sm:p-4 space-y-3">
          {loading ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin text-fuchsia-400" />
            </div>
          ) : person && mode === 'view' ? (
            <>
              <ProfileSection icon={Info} title="Thông tin" iconClassName="text-violet-400">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                  <ProfileDetailRow
                    icon={User}
                    label="Họ tên"
                    value={person.full_name ?? person.display_name}
                    iconClassName="text-fuchsia-400"
                  />
                  <ProfileDetailRow
                    icon={Hash}
                    label="Mã nhân viên"
                    value={person.employee_code ?? '—'}
                    iconClassName="text-sky-400"
                    mono
                  />
                  <ProfileDetailRow
                    icon={Building2}
                    label="Đơn vị"
                    value={person.contractor ?? '—'}
                    iconClassName="text-amber-400/90"
                  />
                  <ProfileDetailRow
                    icon={Hash}
                    label="Mã nội bộ"
                    value={person.pers_id}
                    iconClassName="text-stone-400"
                    mono
                  />
                </div>
              </ProfileSection>

              <ProfileSection icon={ScanFace} title="Khuôn mặt" iconClassName="text-fuchsia-400">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[9px] text-muted-foreground leading-relaxed">
                    Bấm ảnh để xem phóng to · quét lại tại trang Quét mặt
                  </p>
                  <FaceEnrollmentBadge
                    captured={facesCaptured}
                    total={facesRequired}
                    complete={facesComplete}
                  />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-0.5">
                  {displayPoses.map(pose => {
                    const hasUrl = Boolean(pose.url)
                    const selected = selectedFaceSlot === pose.slot
                    return (
                      <button
                        key={pose.slot}
                        type="button"
                        disabled={!hasUrl}
                        onClick={() => {
                          if (!hasUrl) return
                          setSelectedFaceSlot(pose.slot)
                          setFaceGalleryOpen(true)
                        }}
                        className={cn(
                          'shrink-0 flex flex-col items-center gap-1 rounded-md border p-1 transition-colors',
                          !hasUrl && 'opacity-50 cursor-default',
                          selected && faceGalleryOpen
                            ? 'border-fuchsia-400/60 bg-fuchsia-500/10 ring-1 ring-fuchsia-400/30'
                            : 'border-[#1e2433] bg-[#0a0e17] hover:border-fuchsia-400/40',
                        )}
                      >
                        <div className="relative w-14 h-14 rounded overflow-hidden bg-black">
                          {hasUrl ? (
                            <img src={pose.url!} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/35">
                              <ScanFace className="w-4 h-4" />
                            </div>
                          )}
                          {pose.captured && (
                            <span className="absolute top-0.5 right-0.5 rounded-full bg-black/55 p-0.5">
                              <CheckCircle className="w-2.5 h-2.5 text-green-400" />
                            </span>
                          )}
                        </div>
                        <span className="text-[8px] text-muted-foreground max-w-[56px] truncate text-center">
                          {pose.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </ProfileSection>

              <ProfileSection icon={Clock} title="Thời gian" iconClassName="text-sky-400">
                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <div>
                    <p className="text-[8px] uppercase tracking-wide text-muted-foreground/70">Lần đầu thấy</p>
                    <p className="font-medium tabular-nums mt-0.5">{tsLabel(person.first_seen)}</p>
                  </div>
                  <div>
                    <p className="text-[8px] uppercase tracking-wide text-muted-foreground/70">Lần cuối</p>
                    <p className="font-medium tabular-nums mt-0.5">{tsLabel(person.last_seen)}</p>
                  </div>
                </div>
              </ProfileSection>

              <div className="flex flex-wrap gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setFaceGalleryOpen(false)
                    setMode('edit')
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold border border-[#1e2433] hover:bg-[#1a2235]"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Sửa
                </button>
                <Link
                  to={scanHref}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold bg-fuchsia-500/90 text-white hover:bg-fuchsia-500"
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
            <form onSubmit={e => void handleSave(e)} className="space-y-3">
              <ProfileSection icon={Info} title="Thông tin" iconClassName="text-violet-400">
                <div className="space-y-2.5">
                  <label className="block space-y-1">
                    <span className="text-[8px] uppercase tracking-wide text-muted-foreground/70">Họ tên *</span>
                    <input
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      required
                      className={INPUT_CLASS}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[8px] uppercase tracking-wide text-muted-foreground/70">Mã nhân viên *</span>
                    <input
                      value={employeeCode}
                      onChange={e => setEmployeeCode(e.target.value)}
                      required
                      className={cn(INPUT_CLASS, 'font-mono')}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[8px] uppercase tracking-wide text-muted-foreground/70">Đơn vị</span>
                    <input
                      value={contractor}
                      onChange={e => setContractor(e.target.value)}
                      className={INPUT_CLASS}
                    />
                  </label>
                </div>
              </ProfileSection>

              <ProfileSection icon={ScanFace} title="Khuôn mặt" iconClassName="text-fuchsia-400">
                <div className="flex items-center justify-between gap-2">
                  <FaceEnrollmentBadge
                    captured={facesCaptured}
                    total={facesRequired}
                    complete={facesComplete}
                  />
                  <Link
                    to={scanHref}
                    onClick={onClose}
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-fuchsia-400 hover:text-fuchsia-300"
                  >
                    <ScanFace className="w-3 h-3" />
                    Quét mặt
                  </Link>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-0.5">
                  {displayPoses.map(pose => (
                    <div
                      key={pose.slot}
                      className="shrink-0 flex flex-col items-center gap-1 rounded-md border border-[#1e2433] bg-[#0a0e17] p-1"
                    >
                      <div className="relative w-12 h-12 rounded overflow-hidden bg-black">
                        {pose.url ? (
                          <img src={pose.url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/35">
                            <ScanFace className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                      <span className="text-[7px] text-muted-foreground max-w-[48px] truncate text-center">
                        {pose.label}
                      </span>
                    </div>
                  ))}
                </div>
              </ProfileSection>

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
                  className="flex-[2] inline-flex items-center justify-center gap-2 py-2 rounded-lg text-[11px] font-semibold bg-fuchsia-500/90 text-white hover:bg-fuchsia-500 disabled:opacity-50"
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
    </div>,
    document.body,
  )
}
