import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle, CheckCircle2, Loader2, Pencil, Trash2, X,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { formatTime } from '@/utils/format'
import {
  createPatrolEnrollSession,
  deletePatrolWorkerProfile,
  fetchPatrolWorkerProfile,
  updatePatrolWorkerProfile,
  verifyPatrolDraftProfile,
  type PatrolScanEnrollment,
  type PatrolWorkerPerson,
} from '../services/patrolWorkerProfile.service'
import { WorkerProfileFaceGallery } from './WorkerProfileFaceGallery'
import { PatrolFaceScannerPanel } from './PatrolFaceScannerPanel'
import { FACE_SCAN_POSE_REQUIRED } from '../utils/patrolFaceScanPoses'

interface WorkerProfileDetailModalProps {
  persId: string | null
  initialMode?: 'view' | 'edit' | 'verify'
  onClose: () => void
  onChanged: () => void
}

function tsLabel(ts: number | null | undefined): string {
  if (!ts) return '—'
  return formatTime(new Date(ts * 1000))
}

export function WorkerProfileDetailModal({
  persId,
  initialMode = 'view',
  onClose,
  onChanged,
}: WorkerProfileDetailModalProps) {
  const [mode, setMode] = useState<'view' | 'edit' | 'verify'>(initialMode)
  const [person, setPerson] = useState<PatrolWorkerPerson | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [fullName, setFullName] = useState('')
  const [employeeCode, setEmployeeCode] = useState('')
  const [contractor, setContractor] = useState('')

  const [verifySessionId, setVerifySessionId] = useState<string | null>(null)
  const [verifyEnrollment, setVerifyEnrollment] = useState<PatrolScanEnrollment | null>(null)
  const [verifySessionLoading, setVerifySessionLoading] = useState(false)

  const load = useCallback(async () => {
    if (!persId) return
    setLoading(true)
    setError(null)
    try {
      const p = await fetchPatrolWorkerProfile(persId)
      setPerson(p)
      setFullName(p.full_name ?? '')
      setEmployeeCode(p.employee_code ?? '')
      setContractor(p.contractor ?? '')
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
    else setPerson(null)
  }, [persId, initialMode, load])

  useEffect(() => {
    if (mode !== 'verify' || !persId) {
      setVerifySessionId(null)
      setVerifyEnrollment(null)
      return
    }
    let cancelled = false
    setVerifySessionLoading(true)
    setError(null)
    void (async () => {
      try {
        const { sessionId, enrollment } = await createPatrolEnrollSession()
        if (!cancelled) {
          setVerifySessionId(sessionId)
          setVerifyEnrollment(enrollment)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Không tạo phiên quét mặt.')
        }
      } finally {
        if (!cancelled) setVerifySessionLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mode, persId])

  if (!persId) return null

  const verifyScanReady = verifyEnrollment?.complete === true

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!persId) return
    if (mode === 'verify' && (!verifySessionId || !verifyScanReady)) {
      setError(`Quét đủ ${FACE_SCAN_POSE_REQUIRED} góc mặt bắt buộc trước khi xác minh.`)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        full_name: fullName.trim(),
        employee_code: employeeCode.trim(),
        contractor: contractor.trim(),
      }
      const updated = mode === 'verify'
        ? await verifyPatrolDraftProfile(persId, payload, verifySessionId!)
        : await updatePatrolWorkerProfile(persId, payload)
      setPerson(updated)
      setMode('view')
      setVerifySessionId(null)
      setVerifyEnrollment(null)
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
            {mode === 'verify' ? 'Xác minh hồ sơ' : mode === 'edit' ? 'Sửa hồ sơ' : 'Chi tiết hồ sơ'}
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
              {person.status === 'draft' && (
                <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-[10px] text-amber-300">
                  Hồ sơ bản nháp — tạo tự động từ camera. Quét 3 góc mặt rồi xác minh với mã NV thật.
                </div>
              )}
              <div className="space-y-3">
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Họ tên</p>
                  <p className="text-sm font-semibold mt-0.5">{person.full_name ?? person.display_name}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Mã NV</p>
                    <p className="text-sm font-mono mt-0.5">{person.employee_code ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Đơn vị</p>
                    <p className="text-sm mt-0.5">{person.contractor ?? '—'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-[10px]">
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Mã nội bộ</p>
                    <p className="font-mono text-muted-foreground mt-0.5">{person.pers_id}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Vector HR</p>
                    <p className={cn(
                      'mt-0.5 font-semibold tabular-nums',
                      person.face_enrollment_complete ? 'text-green-400' : 'text-violet-400',
                    )}>
                      {person.face_count ?? 0}/{FACE_SCAN_POSE_REQUIRED}
                      {person.face_enrollment_complete && ' ✓'}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-[10px] text-muted-foreground">
                  <div>
                    <span className="text-[9px] uppercase tracking-wider block">Lần đầu thấy</span>
                    {tsLabel(person.first_seen)}
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-wider block">Lần cuối</span>
                    {tsLabel(person.last_seen)}
                  </div>
                </div>
              </div>

              <WorkerProfileFaceGallery person={person} />

              <div className="flex flex-wrap gap-2 pt-1">
                {person.status === 'draft' ? (
                  <button
                    type="button"
                    onClick={() => setMode('verify')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Xác minh
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setMode('edit')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold border border-[#1e2433] hover:bg-[#1a2235]"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Sửa
                  </button>
                )}
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
          ) : person && (mode === 'edit' || mode === 'verify') ? (
            <form onSubmit={e => void handleSave(e)} className="space-y-3">
              {mode === 'verify' && (
                <>
                  <p className="text-[10px] text-amber-300/90 rounded-lg border border-amber-400/20 bg-amber-400/5 px-2.5 py-2">
                    Bước 1: Quét {FACE_SCAN_POSE_REQUIRED} góc (chính diện, trái, phải) · Bước 2: Nhập mã NV chính thức.
                  </p>
                  {verifySessionLoading ? (
                    <div className="flex justify-center py-8 text-muted-foreground">
                      <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                  ) : verifySessionId ? (
                    <PatrolFaceScannerPanel
                      sessionId={verifySessionId}
                      initialEnrollment={verifyEnrollment ?? undefined}
                      subtitle="Vector cho nhận diện — chỉ chính diện lưu JPG avatar"
                      onEnrollmentChange={setVerifyEnrollment}
                    />
                  ) : null}
                </>
              )}
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
              {person && mode === 'edit' && <WorkerProfileFaceGallery person={person} compact />}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMode('view')}
                  className="flex-1 py-2 rounded-lg text-[11px] font-semibold border border-[#1e2433] hover:bg-[#1a2235]"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  disabled={saving || (mode === 'verify' && !verifyScanReady)}
                  className="flex-[2] inline-flex items-center justify-center gap-2 py-2 rounded-lg text-[11px] font-semibold bg-violet-500 text-white disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (mode === 'verify' ? 'Xác minh hồ sơ' : 'Lưu thay đổi')}
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
