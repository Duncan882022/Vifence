import { useCallback, useEffect, useState } from 'react'
import { Settings2, Wifi, WifiOff } from 'lucide-react'
import { cn } from '@/utils/cn'
import {
  getMobileAiBackendUrl,
  pingMobileAiBackend,
  setMobileAiBackendUrl,
} from '../services/mobileAiBackend.service'

interface MobileAiBackendConfigProps {
  compact?: boolean
  /** Tự mở form khi chưa có URL backend */
  autoOpen?: boolean
  onSaved?: () => void
}

export function MobileAiBackendConfig({
  compact,
  autoOpen = true,
  onSaved,
}: MobileAiBackendConfigProps) {
  const savedUrl = getMobileAiBackendUrl()
  const [open, setOpen] = useState(() => autoOpen && !savedUrl)
  const [url, setUrl] = useState(savedUrl)
  const [checking, setChecking] = useState(false)
  const [checkOk, setCheckOk] = useState<boolean | null>(null)
  const [errorMsg, setErrorMsg] = useState<string>()

  useEffect(() => {
    if (autoOpen && !getMobileAiBackendUrl()) setOpen(true)
  }, [autoOpen])

  const persistUrl = useCallback((skipPing = false) => {
    const trimmed = url.trim()
    if (!trimmed) return
    setMobileAiBackendUrl(trimmed)
    setOpen(false)
    setErrorMsg(undefined)
    onSaved?.()
    if (skipPing) setCheckOk(null)
  }, [url, onSaved])

  const handleSave = useCallback(async () => {
    if (!url.trim()) return
    setChecking(true)
    setErrorMsg(undefined)
    setCheckOk(null)
    const ok = await pingMobileAiBackend(url)
    setChecking(false)
    if (ok) {
      setCheckOk(true)
      persistUrl()
      return
    }
    setCheckOk(false)
    setErrorMsg(
      'Không ping được /health. Kiểm tra backend + ngrok đang chạy. '
      + 'Vẫn có thể lưu URL và thử kết nối WebSocket bên dưới.',
    )
  }, [url, persistUrl])

  const formPanel = open && (
    <div className={cn(
      'absolute inset-x-2 z-[20] rounded border border-sky-500/40 bg-[#0a1219]/98 backdrop-blur-sm shadow-lg',
      compact ? 'top-8 p-2' : 'top-12 p-3',
    )}>
      <p className={cn('font-semibold text-sky-200 mb-1', compact ? 'text-[8px]' : 'text-[11px]')}>
        Cấu hình backend AI (máy tính + ngrok)
      </p>
      <p className={cn('text-white/50 mb-2 leading-snug', compact ? 'text-[6px]' : 'text-[9px]')}>
        Chạy backend trên máy tính → ngrok http 8000 → dán URL https vào đây.
      </p>
      <input
        type="url"
        value={url}
        onChange={(e) => { setUrl(e.target.value); setCheckOk(null); setErrorMsg(undefined) }}
        placeholder="https://xxxx.ngrok-free.app"
        className={cn(
          'w-full rounded border border-white/20 bg-black/50 text-white placeholder:text-white/35 px-2 py-1.5',
          compact ? 'text-[8px]' : 'text-[12px]',
        )}
      />
      {errorMsg && (
        <p className={cn('text-amber-200/90 mt-1.5 leading-snug', compact ? 'text-[6px]' : 'text-[9px]')}>
          {errorMsg}
        </p>
      )}
      {checkOk === true && (
        <p className={cn('text-green-300/90 mt-1 flex items-center gap-1', compact ? 'text-[7px]' : 'text-[10px]')}>
          <Wifi className="w-3 h-3" />
          Kết nối OK — đang gửi frame lên backend
        </p>
      )}
      <div className={cn('flex flex-wrap gap-2 mt-2', compact && 'gap-1')}>
        <button
          type="button"
          disabled={checking || !url.trim()}
          onClick={() => { void handleSave() }}
          className={cn(
            'flex-1 min-w-[40%] rounded font-semibold bg-sky-500/30 border border-sky-500/50 text-sky-100 disabled:opacity-40',
            compact ? 'text-[7px] py-1' : 'text-[11px] py-1.5',
          )}
        >
          {checking ? 'Đang kiểm tra…' : 'Kiểm tra & lưu'}
        </button>
        <button
          type="button"
          disabled={!url.trim()}
          onClick={() => persistUrl(true)}
          className={cn(
            'rounded font-semibold bg-white/8 border border-white/20 text-white/80',
            compact ? 'text-[7px] px-2 py-1' : 'text-[11px] px-3 py-1.5',
          )}
        >
          Lưu URL
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={cn(
            'rounded font-semibold bg-white/5 border border-white/15 text-white/60',
            compact ? 'text-[7px] px-2 py-1' : 'text-[11px] px-3 py-1.5',
          )}
        >
          Đóng
        </button>
      </div>
    </div>
  )

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={cn(
          'absolute z-[15] rounded font-semibold bg-sky-500/25 border border-sky-500/45 text-sky-100 hover:bg-sky-500/35 transition-colors flex items-center gap-1',
          compact ? 'top-1 right-1 text-[6px] px-1 py-0.5' : 'top-2 right-2 text-[10px] px-2 py-1',
        )}
      >
        <Settings2 className={cn(compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5')} />
        {!compact && 'Cấu hình AI'}
      </button>

      {formPanel}

      {!open && !getMobileAiBackendUrl() && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            'absolute z-[12] flex items-center gap-1 rounded font-semibold bg-amber-500/20 border border-amber-500/45 text-amber-100 hover:bg-amber-500/30 transition-colors',
            compact ? 'top-1 left-12 text-[6px] px-1 py-0.5 max-w-[calc(100%-3rem)]' : 'top-2 left-20 text-[9px] px-2 py-1 max-w-[70%]',
          )}
        >
          <WifiOff className={cn(compact ? 'w-2 h-2 shrink-0' : 'w-3 h-3 shrink-0')} />
          <span className="truncate">Chưa cấu hình AI — bấm để thiết lập</span>
        </button>
      )}

      {!open && getMobileAiBackendUrl() && (
        <div className={cn(
          'absolute z-[12] flex items-center gap-1 rounded bg-green-500/15 border border-green-500/35 text-green-200/90 truncate max-w-[55%]',
          compact ? 'top-1 left-12 text-[6px] px-1 py-0.5' : 'top-2 left-20 text-[8px] px-1.5 py-0.5',
        )}>
          <Wifi className={cn(compact ? 'w-2 h-2 shrink-0' : 'w-2.5 h-2.5 shrink-0')} />
          <span className="truncate">{getMobileAiBackendUrl().replace(/^https?:\/\//, '')}</span>
        </div>
      )}
    </>
  )
}
