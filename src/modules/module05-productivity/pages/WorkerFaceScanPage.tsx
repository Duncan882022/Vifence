import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertCircle, ArrowLeft, ArrowRight, CheckCircle, IdCard, Loader2, ScanFace, Search, User,
} from 'lucide-react'
import { PageLayout, Panel } from '@/components/common/PageLayout/PageLayout'
import { cn } from '@/utils/cn'
import { hasPatrolRole } from '@/services/patrolApiClient'
import { PatrolFaceScannerPanel } from '../components/PatrolFaceScannerPanel'
import {
  completePatrolEnrollSession,
  createPatrolEnrollSession,
  createPatrolWorkerProfile,
  lookupPatrolWorkerByCode,
  type PatrolScanEnrollment,
  type PatrolWorkerPerson,
} from '../services/patrolWorkerProfile.service'

type SelfStep = 'scan' | 'profile' | 'done'
type AdminStep = 'lookup' | 'scan'

export function WorkerFaceScanPage() {
  const [params] = useSearchParams()
  const presetCode = params.get('code') ?? ''
  /** Link ?code= — công nhân tự đăng ký: quét mặt trước, không dùng màn HR tra cứu. */
  const forceSelfEnroll = Boolean(presetCode.trim())
  const adminMode = hasPatrolRole('hr') && !forceSelfEnroll

  const [selfStep, setSelfStep] = useState<SelfStep>('scan')
  const [adminStep, setAdminStep] = useState<AdminStep>(presetCode ? 'lookup' : 'lookup')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionEnrollment, setSessionEnrollment] = useState<PatrolScanEnrollment | null>(null)
  const [sessionBooting, setSessionBooting] = useState(!adminMode)

  const [codeInput, setCodeInput] = useState(presetCode)
  const [nameInput, setNameInput] = useState('')
  const [contractorInput, setContractorInput] = useState('')
  const [profileName, setProfileName] = useState('')
  const [profileCode, setProfileCode] = useState(presetCode)
  const [profileContractor, setProfileContractor] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [person, setPerson] = useState<PatrolWorkerPerson | null>(null)
  const [creating, setCreating] = useState(false)
  const [submittingProfile, setSubmittingProfile] = useState(false)
  const [savedPerson, setSavedPerson] = useState<PatrolWorkerPerson | null>(null)
  const [scanComplete, setScanComplete] = useState(false)
  const [consentChecked, setConsentChecked] = useState(false)

  useEffect(() => {
    if (adminMode) {
      if (presetCode) void handleLookup(presetCode)
      return
    }
    let cancelled = false
    void (async () => {
      setSessionBooting(true)
      setError(null)
      try {
        const { sessionId: sid, enrollment } = await createPatrolEnrollSession()
        if (!cancelled) {
          setSessionId(sid)
          setSessionEnrollment(enrollment)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Không tạo được phiên quét.')
        }
      } finally {
        if (!cancelled) setSessionBooting(false)
      }
    })()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLookup(codeOverride?: string) {
    const code = (codeOverride ?? codeInput).trim()
    if (!code) {
      setError('Nhập mã nhân viên.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const found = await lookupPatrolWorkerByCode(code)
      setPerson(found)
      setAdminStep('scan')
    } catch (err) {
      setPerson(null)
      setError(err instanceof Error ? err.message : 'Tra cứu thất bại.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateAndScan(e: React.FormEvent) {
    e.preventDefault()
    const code = codeInput.trim()
    const name = nameInput.trim()
    if (!code || !name) {
      setError('Nhập mã nhân viên và họ tên để tạo hồ sơ mới.')
      return
    }
    setCreating(true)
    setError(null)
    try {
      const created = await createPatrolWorkerProfile({
        full_name: name,
        employee_code: code,
        contractor: contractorInput.trim(),
      })
      setPerson(created)
      setAdminStep('scan')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tạo hồ sơ thất bại.')
    } finally {
      setCreating(false)
    }
  }

  async function handleCompleteProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!sessionId) return
    const full_name = profileName.trim()
    const employee_code = profileCode.trim()
    const contractor = profileContractor.trim()
    if (!full_name || !employee_code) {
      setError('Nhập đủ họ tên và mã nhân viên.')
      return
    }
    if (!consentChecked) {
      setError('Vui lòng đồng ý cho phép thu thập và lưu dữ liệu khuôn mặt.')
      return
    }
    setSubmittingProfile(true)
    setError(null)
    try {
      const { person: saved } = await completePatrolEnrollSession(sessionId, {
        full_name,
        employee_code,
        contractor,
        consented_at: Math.floor(Date.now() / 1000),
      })
      setSavedPerson(saved)
      setSelfStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lưu hồ sơ thất bại.')
    } finally {
      setSubmittingProfile(false)
    }
  }

  if (!adminMode) {
    return (
      <PageLayout scrollable>
        <div className="max-w-2xl mx-auto w-full space-y-4 pb-8">
          <div className="text-center space-y-2 pt-2 sm:pt-4">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-violet-400/10 border border-violet-400/25 flex items-center justify-center">
              <ScanFace className="w-7 h-7 text-violet-400" />
            </div>
            <h1 className="text-lg font-bold">Đăng ký khuôn mặt tuần tra</h1>
            <p className="text-[11px] text-muted-foreground leading-relaxed px-2">
              Bước 1: Đưa mặt vào khung, làm theo hướng dẫn (tự quét 4 góc TRÊN·TRÁI·PHẢI·DƯỚI) · Bước 2: Nhập họ tên, mã nhân viên và đơn vị.
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-wider">
            <StepPill active={selfStep === 'scan'} done={selfStep !== 'scan'} n={1} label="Quét mặt" />
            <span className="text-muted-foreground/40">→</span>
            <StepPill active={selfStep === 'profile'} done={selfStep === 'done'} n={2} label="Thông tin" />
            <span className="text-muted-foreground/40">→</span>
            <StepPill active={selfStep === 'done'} done={false} n={3} label="Hoàn tất" />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-200 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {selfStep === 'scan' && (
            sessionBooting || !sessionId ? (
              <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
                <span className="text-xs">Đang chuẩn bị phiên quét…</span>
              </div>
            ) : (
              <Panel title="Bước 1 — Quét mặt" className="overflow-visible">
                <div className="p-3 sm:p-4">
                  <PatrolFaceScannerPanel
                    sessionId={sessionId}
                    initialEnrollment={sessionEnrollment ?? undefined}
                    onEnrollmentChange={e => setScanComplete(e.complete)}
                    onScanComplete={() => {
                      setScanComplete(true)
                      setSelfStep('profile')
                    }}
                  />
                  <button
                    type="button"
                    disabled={!scanComplete}
                    onClick={() => setSelfStep('profile')}
                    className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-emerald-500 text-white hover:bg-emerald-500/90 disabled:opacity-40 disabled:pointer-events-none"
                  >
                    Tiếp tục nhập thông tin
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </Panel>
            )
          )}

          {selfStep === 'profile' && sessionId && (
            <Panel title="Bước 2 — Thông tin công nhân" className="overflow-visible">
              <form onSubmit={e => void handleCompleteProfile(e)} className="p-4 space-y-3">
                <p className="text-[10px] text-muted-foreground">
                  Cùng cột dữ liệu với import Excel: Họ tên, Mã nhân viên, Đơn vị.
                </p>
                <label className="block space-y-1">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Họ tên *</span>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                    <input
                      value={profileName}
                      onChange={e => { setProfileName(e.target.value); setError(null) }}
                      placeholder="Nguyễn Văn A"
                      className="w-full pl-10 pr-3 py-2.5 text-sm rounded-lg border border-[#1e2433] bg-[#0a0e17] outline-none focus:border-violet-400/50"
                      required
                    />
                  </div>
                </label>
                <label className="block space-y-1">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Mã nhân viên *</span>
                  <div className="relative">
                    <IdCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                    <input
                      value={profileCode}
                      onChange={e => { setProfileCode(e.target.value); setError(null) }}
                      placeholder="NV001 / SGC-0000123"
                      className="w-full pl-10 pr-3 py-2.5 text-sm rounded-lg border border-[#1e2433] bg-[#0a0e17] outline-none font-mono focus:border-violet-400/50"
                      required
                    />
                  </div>
                </label>
                <label className="block space-y-1">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Đơn vị</span>
                  <input
                    value={profileContractor}
                    onChange={e => setProfileContractor(e.target.value)}
                    placeholder="Vincons / SGC"
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-[#1e2433] bg-[#0a0e17] outline-none focus:border-violet-400/50"
                  />
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentChecked}
                    onChange={e => {
                      setConsentChecked(e.target.checked)
                      setError(null)
                    }}
                    className="mt-0.5 rounded border-[#1e2433] bg-[#0a0e17] text-violet-500 focus:ring-violet-400/40"
                  />
                  <span className="text-[10px] text-muted-foreground leading-relaxed">
                    Tôi đồng ý cho phép hệ thống thu thập, lưu trữ và sử dụng dữ liệu khuôn mặt
                    nhằm mục đích nhận diện tuần tra an toàn lao động tại công trường.
                  </span>
                </label>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setSelfStep('scan')}
                    className="flex-1 py-2.5 rounded-lg text-xs font-semibold border border-[#1e2433] hover:bg-[#1a2235]"
                  >
                    Quay lại quét
                  </button>
                  <button
                    type="submit"
                    disabled={submittingProfile || !consentChecked}
                    className="flex-[2] inline-flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold bg-violet-500 text-white hover:bg-violet-500/90 disabled:opacity-50"
                  >
                    {submittingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    Lưu hồ sơ
                  </button>
                </div>
              </form>
            </Panel>
          )}

          {selfStep === 'done' && savedPerson && (
            <Panel title="Hoàn tất" className="overflow-visible">
              <div className="p-6 text-center space-y-4">
                <CheckCircle className="w-12 h-12 text-green-400 mx-auto" />
                <div>
                  <p className="text-sm font-bold">{savedPerson.full_name}</p>
                  <p className="text-[11px] text-muted-foreground font-mono mt-1">{savedPerson.employee_code}</p>
                  {savedPerson.contractor && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">{savedPerson.contractor}</p>
                  )}
                </div>
                <p className="text-[11px] text-green-400/90">
                  Vector đã lưu — sẵn sàng nhận diện trên mũ tuần tra Module 05.
                </p>
              </div>
            </Panel>
          )}
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout scrollable>
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
        <Link
          to="/module05/ho-so"
          className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Quản lý hồ sơ
        </Link>
        {adminStep === 'scan' && person && (
          <button
            type="button"
            onClick={() => {
              setAdminStep('lookup')
              setPerson(null)
              setError(null)
            }}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            Tra cứu mã khác
          </button>
        )}
      </div>

      {adminStep === 'lookup' && (
        <div className="max-w-lg mx-auto w-full space-y-4">
          <div className="text-center space-y-2 pt-4">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-violet-400/10 border border-violet-400/25 flex items-center justify-center">
              <ScanFace className="w-7 h-7 text-violet-400" />
            </div>
            <h1 className="text-lg font-bold">Quét mặt công nhân (HR)</h1>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Tra cứu theo mã đã import Excel, rồi đưa mặt vào khung — hệ thống tự quét bổ sung vector.
            </p>
          </div>

          <Panel title="Tra cứu hồ sơ" className="overflow-visible">
            <form
              onSubmit={e => {
                e.preventDefault()
                void handleLookup()
              }}
              className="p-4 space-y-3"
            >
              <label className="block space-y-1">
                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Mã nhân viên</span>
                <div className="relative">
                  <IdCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                  <input
                    value={codeInput}
                    onChange={e => { setCodeInput(e.target.value); setError(null) }}
                    placeholder="NV001 / SGC-0000123"
                    className={cn(
                      'w-full pl-10 pr-3 py-2.5 text-sm rounded-lg border bg-[#0a0e17] outline-none font-mono',
                      error ? 'border-red-500/40' : 'border-[#1e2433] focus:border-violet-400/50',
                    )}
                  />
                </div>
              </label>

              {error && !creating && (
                <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-200 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-violet-500 text-white hover:bg-violet-500/90 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Tìm hồ sơ
              </button>
            </form>
          </Panel>

          <Panel title="Chưa có trong danh sách?" className="overflow-visible">
            <form onSubmit={e => void handleCreateAndScan(e)} className="p-4 space-y-3">
              <p className="text-[10px] text-muted-foreground">Tạo nhanh hồ sơ rồi quét mặt ngay (không cần Excel).</p>
              <input
                value={codeInput}
                onChange={e => setCodeInput(e.target.value)}
                placeholder="Mã nhân viên *"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#1e2433] bg-[#0a0e17] font-mono"
                required
              />
              <input
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                placeholder="Họ tên *"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#1e2433] bg-[#0a0e17]"
                required
              />
              <input
                value={contractorInput}
                onChange={e => setContractorInput(e.target.value)}
                placeholder="Đơn vị (tuỳ chọn)"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#1e2433] bg-[#0a0e17]"
              />
              <button
                type="submit"
                disabled={creating || !codeInput.trim() || !nameInput.trim()}
                className="w-full py-2 rounded-lg text-[11px] font-semibold border border-violet-400/40 bg-violet-500/15 text-violet-200 hover:bg-violet-500/25 disabled:opacity-50"
              >
                {creating ? 'Đang tạo…' : 'Tạo hồ sơ & quét mặt'}
              </button>
            </form>
          </Panel>
        </div>
      )}

      {adminStep === 'scan' && person && (
        <Panel title={person.full_name ?? person.display_name} className="overflow-visible shrink-0">
          <div className="p-3 sm:p-4 border-b border-[#1e2433] text-[10px] text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
            <span>Mã: <strong className="text-foreground font-mono">{person.employee_code}</strong></span>
            {person.contractor && <span>Đơn vị: <strong className="text-foreground">{person.contractor}</strong></span>}
            <span className="font-mono text-[9px]">{person.pers_id}</span>
          </div>
          <div className="p-3 sm:p-4">
            <PatrolFaceScannerPanel person={person} />
          </div>
        </Panel>
      )}
    </PageLayout>
  )
}

function StepPill({
  n, label, active, done,
}: {
  n: number
  label: string
  active: boolean
  done: boolean
}) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border',
      active && 'border-violet-400/50 bg-violet-400/10 text-violet-300',
      done && !active && 'border-green-400/30 bg-green-400/5 text-green-400/90',
      !active && !done && 'border-[#1e2433] text-muted-foreground',
    )}>
      <span className="w-4 h-4 rounded-full bg-black/30 flex items-center justify-center text-[9px] font-bold">{n}</span>
      {label}
    </span>
  )
}
