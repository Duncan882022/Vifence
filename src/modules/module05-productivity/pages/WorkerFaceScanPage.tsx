import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertCircle, ArrowLeft, IdCard, Loader2, ScanFace, Search,
} from 'lucide-react'
import { PageLayout, Panel } from '@/components/common/PageLayout/PageLayout'
import { cn } from '@/utils/cn'
import { PatrolFaceScannerPanel } from '../components/PatrolFaceScannerPanel'
import {
  importPatrolWorkerProfiles,
  lookupPatrolWorkerByCode,
  type PatrolWorkerPerson,
} from '../services/patrolWorkerProfile.service'

type Step = 'lookup' | 'scan'

export function WorkerFaceScanPage() {
  const [params] = useSearchParams()
  const presetCode = params.get('code') ?? ''

  const [step, setStep] = useState<Step>(presetCode ? 'lookup' : 'lookup')
  const [codeInput, setCodeInput] = useState(presetCode)
  const [nameInput, setNameInput] = useState('')
  const [contractorInput, setContractorInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [person, setPerson] = useState<PatrolWorkerPerson | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (presetCode) {
      void handleLookup(presetCode)
    }
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
      setStep('scan')
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
      const result = await importPatrolWorkerProfiles([{
        full_name: name,
        employee_code: code,
        contractor: contractorInput.trim(),
      }])
      const row = result.results.find(r => r.ok && r.pers_id)
      if (!row?.pers_id) {
        throw new Error(result.results[0]?.error ?? 'Không tạo được hồ sơ.')
      }
      const found = await lookupPatrolWorkerByCode(code)
      setPerson(found)
      setStep('scan')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tạo hồ sơ thất bại.')
    } finally {
      setCreating(false)
    }
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
        {step === 'scan' && person && (
          <button
            type="button"
            onClick={() => {
              setStep('lookup')
              setPerson(null)
              setError(null)
            }}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            Tra cứu mã khác
          </button>
        )}
      </div>

      {step === 'lookup' && (
        <div className="max-w-lg mx-auto w-full space-y-4">
          <div className="text-center space-y-2 pt-4">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-violet-400/10 border border-violet-400/25 flex items-center justify-center">
              <ScanFace className="w-7 h-7 text-violet-400" />
            </div>
            <h1 className="text-lg font-bold">Quét mặt công nhân</h1>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Tra cứu theo mã nhân viên đã import từ Excel. Vector lưu vào kho tuần tra — khớp nhận diện Module 05.
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
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                placeholder="Họ tên"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#1e2433] bg-[#0a0e17]"
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
                className="w-full py-2 rounded-lg text-[11px] font-semibold border border-[#1e2433] hover:bg-[#1a2235] disabled:opacity-50"
              >
                {creating ? 'Đang tạo…' : 'Tạo hồ sơ & quét mặt'}
              </button>
            </form>
          </Panel>
        </div>
      )}

      {step === 'scan' && person && (
        <Panel title={person.full_name ?? person.display_name} className="flex flex-col min-h-0">
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
