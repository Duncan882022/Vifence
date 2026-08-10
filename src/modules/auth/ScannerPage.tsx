import { useState } from 'react'
import { AlertCircle, ArrowLeft, IdCard, ScanFace, Shield } from 'lucide-react'
import { cn } from '@/utils/cn'
import { FacialScannerPanel } from './components/FacialScannerPanel'
import type { FacialScannerIdentity } from './services/workerGallery.service'
import { maskCccd, normalizeCccdInput, validateCccd } from './utils/cccdValidation'

type ScannerStep = 'cccd' | 'scan'

export function ScannerPage() {
  const [step, setStep] = useState<ScannerStep>('cccd')
  const [cccdInput, setCccdInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [identity, setIdentity] = useState<FacialScannerIdentity | null>(null)

  const handleStartScan = (event: React.FormEvent) => {
    event.preventDefault()
    const validationError = validateCccd(cccdInput)
    if (validationError) {
      setError(validationError)
      return
    }

    const cccd = normalizeCccdInput(cccdInput)
    setIdentity({
      cccd,
      workerName: 'Công nhân chưa đăng ký',
      employeeCode: cccd,
    })
    setError(null)
    setStep('scan')
  }

  const handleBack = () => {
    setStep('cccd')
    setIdentity(null)
    setError(null)
  }

  return (
    <div className="min-h-screen bg-[#070b13] text-foreground flex flex-col">
      <header className="border-b border-[#1e2433] bg-[#0a0e17]/95 backdrop-blur-sm shrink-0">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold tracking-tight">Vifence ATLĐ</p>
            <p className="text-[10px] text-muted-foreground">Đăng ký khuôn mặt công nhân</p>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-10">
        {step === 'cccd' ? (
          <div className="max-w-md mx-auto space-y-6">
            <div className="text-center space-y-2">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-sky-400/10 border border-sky-400/25 flex items-center justify-center">
                <IdCard className="w-7 h-7 text-sky-400" />
              </div>
              <h1 className="text-lg font-bold">Công nhân chưa đăng ký khuôn mặt</h1>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Nhập số CCCD (Căn cước công dân) để bắt đầu quét 3 góc mặt.
                Dữ liệu dùng để nhận diện trên camera an toàn lao động.
              </p>
            </div>

            <form
              onSubmit={handleStartScan}
              className="rounded-xl border border-[#1e2433] bg-[#0d111a] p-5 space-y-4"
            >
              <div className="space-y-1.5">
                <label htmlFor="scanner-cccd" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Số CCCD
                </label>
                <div className="relative">
                  <IdCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                  <input
                    id="scanner-cccd"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="Nhập 9–12 số trên CCCD"
                    value={cccdInput}
                    onChange={e => {
                      setCccdInput(e.target.value)
                      if (error) setError(null)
                    }}
                    className={cn(
                      'w-full pl-10 pr-3 py-3 text-sm rounded-lg border bg-[#131924] outline-none transition-all',
                      error
                        ? 'border-red-500/40 focus:border-red-500/60 focus:ring-2 focus:ring-red-500/20'
                        : 'border-[#1e2433] focus:border-sky-400/50 focus:ring-2 focus:ring-sky-400/20',
                    )}
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-red-500/25 bg-red-500/10 text-red-400 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/95 transition-all"
              >
                <ScanFace className="w-4 h-4" />
                Bắt đầu quét
              </button>
            </form>

            <p className="text-[10px] text-center text-muted-foreground/70 leading-relaxed">
              Bạn cần cho phép quyền camera ở bước tiếp theo.
              Nếu đã quét trước đó, hệ thống sẽ tiếp tục từ góc còn thiếu.
            </p>
          </div>
        ) : identity ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#1e2433] text-muted-foreground hover:text-foreground hover:border-[#2a3855] transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Nhập lại CCCD
              </button>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                CCCD: <span className="font-mono text-foreground">{maskCccd(identity.cccd ?? '')}</span>
              </span>
            </div>

            <div className="rounded-xl border border-[#1e2433] bg-[#0d111a] p-4 sm:p-6">
              <FacialScannerPanel
                identity={identity}
                subtitle={`Quét 3 góc mặt để đăng ký nhận diện ATLĐ — CCCD ${maskCccd(identity.cccd ?? '')}.`}
              />
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}
