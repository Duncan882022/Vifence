import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Settings2, Wifi, X } from 'lucide-react'
import { cn } from '@/utils/cn'
import {
  fetchMobileAiBackendConfig,
  getMobileAiBackendUrl,
  pingMobileAiBackend,
  saveMobileAiBackendUrl,
} from '../services/mobileAiBackend.service'

interface MobileAiBackendConfigProps {
  compact?: boolean
  onSaved?: () => void
}

export function MobileAiBackendConfig({ compact, onSaved }: MobileAiBackendConfigProps) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState(() => getMobileAiBackendUrl())
  const [checking, setChecking] = useState(false)
  const [checkOk, setCheckOk] = useState<boolean | null>(null)
  const [errorMsg, setErrorMsg] = useState<string>()

  useEffect(() => {
    if (!open) return
    const cached = getMobileAiBackendUrl()
    if (!cached) return
    void fetchMobileAiBackendConfig(cached).then((record) => {
      if (record?.backend_url) setUrl(record.backend_url)
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const handleSave = useCallback(async () => {
    setChecking(true)
    setErrorMsg(undefined)
    setCheckOk(null)
    const ok = await pingMobileAiBackend(url)
    setChecking(false)
    setCheckOk(ok)
    if (!ok) {
      setErrorMsg('Không kết nối được backend. Kiểm tra máy tính đang bật backend + ngrok, rồi thử lại.')
      return
    }
    await saveMobileAiBackendUrl(url)
    setOpen(false)
    onSaved?.()
  }, [url, onSaved])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'rounded bg-black/55 border border-sky-500/40 text-sky-200 hover:bg-black/70 transition-colors shrink-0',
          compact ? 'p-0.5' : 'p-1',
        )}
        title="Cấu hình backend AI"
      >
        <Settings2 className={cn(compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5')} />
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-sky-500/35 bg-[#0a1219] shadow-xl p-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <p className="text-sm font-semibold text-sky-200">
                URL backend AI
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded bg-white/5 hover:bg-white/10 text-white/70"
                aria-label="Đóng"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-white/45 mb-2 leading-snug">
              Dán URL tunnel (ngrok / localtunnel) trỏ tới máy tính đang chạy backend.
            </p>
            <input
              type="url"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setCheckOk(null) }}
              placeholder="https://xxxx.ngrok-free.app"
              className="w-full rounded border border-white/15 bg-black/40 text-white placeholder:text-white/30 px-3 py-2 text-sm"
            />
            {errorMsg && (
              <p className="text-red-300/90 mt-2 text-xs">{errorMsg}</p>
            )}
            {checkOk === true && (
              <p className="text-green-300/90 mt-2 flex items-center gap-1 text-xs">
                <Wifi className="w-3.5 h-3.5" />
                Kết nối OK
              </p>
            )}
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                disabled={checking || !url.trim()}
                onClick={() => { void handleSave() }}
                className="flex-1 rounded font-semibold bg-sky-500/25 border border-sky-500/40 text-sky-100 disabled:opacity-40 text-sm py-2"
              >
                {checking ? 'Đang kiểm tra…' : 'Lưu & kết nối'}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded font-semibold bg-white/5 border border-white/15 text-white/70 text-sm px-4 py-2"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
