/**
 * Mỗi lần vào Module 05 — hỏi Camera + Location (HC-02).
 * GPS trên iPhone trong nhà có thể mất 15–30s — UI hiện countdown.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, MapPin } from 'lucide-react'
import { cn } from '@/utils/cn'
import {
  describeLocationHelp,
  requestHelmetDevicePermissions,
} from '../services/requestHelmetDevicePermissions'

export function PatrolDevicePermissionGate() {
  const [open, setOpen] = useState(true)
  const [busy, setBusy] = useState(false)
  const [waitSec, setWaitSec] = useState(0)
  const [error, setError] = useState<string>()
  const timerRef = useRef(0)

  useEffect(() => () => window.clearInterval(timerRef.current), [])

  const request = useCallback(async () => {
    setBusy(true)
    setError(undefined)
    setWaitSec(0)
    window.clearInterval(timerRef.current)
    timerRef.current = window.setInterval(() => {
      setWaitSec(s => s + 1)
    }, 1000)

    try {
      const result = await requestHelmetDevicePermissions('HC-02')

      if (result.camera === 'denied' && result.location !== 'granted') {
        setError(
          result.locationMessage
            ?? 'Camera & Location bị từ chối. Mở Cài đặt trình duyệt → Cho phép cả hai, reload rồi bấm lại.',
        )
        return
      }
      if (result.camera === 'denied') {
        setError('Camera bị từ chối. Cho phép Camera rồi bấm lại.')
        return
      }
      if (result.location !== 'granted') {
        setError(
          `${result.locationMessage ?? 'Vị trí chưa được cấp.'}\n${describeLocationHelp()}`,
        )
        return
      }
      setOpen(false)
    } finally {
      window.clearInterval(timerRef.current)
      setBusy(false)
      setWaitSec(0)
    }
  }, [])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-4">
      <div className="w-full max-w-sm rounded-xl border border-[#334155] bg-[#0d1117] shadow-2xl p-4 space-y-3">
        <div className="space-y-1">
          <p className="text-[13px] font-semibold text-white">
            Cấp quyền Camera + GPS
          </p>
          <p className="text-[11px] text-[#94a3b8] leading-relaxed">
            Helmet 02 cần camera và vị trí. Trong nhà GPS có thể mất tới ~30 giây — giữ màn hình sáng khi đang xin quyền.
          </p>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-[#cbd5e1]">
          <span className="inline-flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5 text-sky-400" /> Camera
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-emerald-400" /> Location
          </span>
        </div>

        {busy && (
          <p className="text-[10px] text-sky-300/90">
            Đang lấy GPS… {waitSec}s (tối đa ~35s)
          </p>
        )}

        {error && (
          <p className="text-[10px] text-amber-300/95 leading-relaxed whitespace-pre-line">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => { void request() }}
            className={cn(
              'flex-1 rounded-lg px-3 py-2 text-[12px] font-semibold',
              'bg-sky-500/90 hover:bg-sky-400 text-white transition-colors',
              busy && 'opacity-60',
            )}
          >
            {busy ? 'Đang xin quyền…' : 'Cho phép ngay'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setOpen(false)}
            className="rounded-lg px-3 py-2 text-[11px] font-medium text-[#94a3b8] border border-[#334155] hover:bg-white/5"
          >
            Để sau
          </button>
        </div>
      </div>
    </div>
  )
}
