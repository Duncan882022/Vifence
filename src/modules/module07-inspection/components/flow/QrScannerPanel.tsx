import { memo, useEffect, useRef, useState } from 'react'
import QrScanner from 'qr-scanner'
import { Keyboard, QrCode, RefreshCw } from 'lucide-react'

interface Props {
  expected?: string
  onResult: (value: string, method: 'camera' | 'manual') => void
}

/** §4 Quét QR bằng camera sau iPad (qr-scanner) + nhập tay dự phòng (ghi audit "manual"). */
export const QrScannerPanel = memo(function QrScannerPanel({ expected, onResult }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [manual, setManual] = useState('')
  const [attempt, setAttempt] = useState(0)
  const resultRef = useRef(onResult)
  resultRef.current = onResult

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (!window.isSecureContext) {
      setError('Camera cần HTTPS (hoặc localhost). Mở CMS qua https:// trên iPad, hoặc nhập mã bên dưới.')
      return
    }
    setError(null)
    let done = false
    const scanner = new QrScanner(
      video,
      res => {
        if (done || !res.data) return
        done = true
        scanner.stop()
        resultRef.current(res.data.trim(), 'camera')
      },
      { preferredCamera: 'environment', highlightScanRegion: true, highlightCodeOutline: true, returnDetailedScanResult: true, maxScansPerSecond: 8 },
    )
    scanner.start().catch((err: unknown) => {
      setError(err instanceof Error ? `Không mở được camera: ${err.message}` : 'Không mở được camera sau — kiểm tra quyền Camera cho trình duyệt.')
    })
    return () => {
      done = true
      scanner.stop()
      scanner.destroy()
    }
  }, [attempt])

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-video max-h-[46vh] rounded-lg overflow-hidden bg-black border border-[#1e2433]">
        <video ref={videoRef} muted playsInline className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute top-2 left-2 bg-black/60 rounded px-2 py-1 text-[10px] text-white flex items-center gap-1">
          <QrCode className="w-3 h-3" /> Hướng camera sau vào tem QR trên hạng mục{expected && <> · mong đợi <b className="font-mono">{expected}</b></>}
        </div>
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 text-center px-6">
            <p className="text-[12px] text-amber-300">{error}</p>
            <button type="button" onClick={() => setAttempt(a => a + 1)} className="inline-flex items-center gap-1 text-[11px] text-sky-300">
              <RefreshCw className="w-3.5 h-3.5" /> Thử lại
            </button>
          </div>
        )}
      </div>
      <form
        className="flex flex-wrap sm:flex-nowrap items-center gap-2"
        onSubmit={e => {
          e.preventDefault()
          if (manual.trim()) onResult(manual.trim().toUpperCase(), 'manual')
        }}
      >
        <Keyboard className="w-4 h-4 text-muted-foreground" />
        <input
          value={manual}
          onChange={e => setManual(e.target.value)}
          placeholder="Nhập mã QR khi tem hỏng / không quét được"
          className="flex-1 min-w-0 h-10 rounded-lg bg-white/5 border border-white/10 px-3 text-[12px] font-mono text-foreground"
        />
        <button type="submit" disabled={!manual.trim()} className="h-10 px-4 rounded-lg border border-white/10 text-[12px] text-foreground disabled:opacity-40 w-full sm:w-auto">
          Xác nhận mã
        </button>
      </form>
    </div>
  )
})
