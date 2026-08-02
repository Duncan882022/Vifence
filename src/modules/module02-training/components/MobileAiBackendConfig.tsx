import { useCallback, useState } from 'react'
import { Settings2, Wifi, WifiOff } from 'lucide-react'
import { cn } from '@/utils/cn'
import {
  getMobileAiBackendUrl,
  pingMobileAiBackend,
  setMobileAiBackendUrl,
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

  const handleSave = useCallback(async () => {
    setChecking(true)
    setErrorMsg(undefined)
    setCheckOk(null)
    const ok = await pingMobileAiBackend(url)
    setChecking(false)
    setCheckOk(ok)
    if (!ok) {
      setErrorMsg('Không kết nối được backend. Kiểm tra URL ngrok và server đang chạy.')
      return
    }
    setMobileAiBackendUrl(url)
    setOpen(false)
    onSaved?.()
  }, [url, onSaved])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={cn(
          'absolute z-[5] rounded bg-black/55 border border-sky-500/40 text-sky-200 hover:bg-black/70 transition-colors',
          compact ? 'top-1 right-1 p-0.5' : 'top-2 right-2 p-1',
        )}
        title="Cấu hình backend AI"
      >
        <Settings2 className={cn(compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5')} />
      </button>

      {open && (
        <div className={cn(
          'absolute inset-x-2 z-[6] rounded border border-sky-500/35 bg-[#0a1219]/95 backdrop-blur-sm',
          compact ? 'top-7 p-2' : 'top-10 p-3',
        )}>
          <p className={cn('font-semibold text-sky-200 mb-1', compact ? 'text-[7px]' : 'text-[10px]')}>
            URL backend AI (máy tính + ngrok)
          </p>
          <input
            type="url"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setCheckOk(null) }}
            placeholder="https://xxxx.ngrok-free.app"
            className={cn(
              'w-full rounded border border-white/15 bg-black/40 text-white placeholder:text-white/30 px-2 py-1',
              compact ? 'text-[7px]' : 'text-[10px]',
            )}
          />
          {errorMsg && (
            <p className={cn('text-red-300/90 mt-1', compact ? 'text-[6px]' : 'text-[9px]')}>{errorMsg}</p>
          )}
          {checkOk === true && (
            <p className={cn('text-green-300/90 mt-1 flex items-center gap-1', compact ? 'text-[6px]' : 'text-[9px]')}>
              <Wifi className="w-3 h-3" />
              Kết nối OK
            </p>
          )}
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              disabled={checking || !url.trim()}
              onClick={() => { void handleSave() }}
              className={cn(
                'flex-1 rounded font-semibold bg-sky-500/25 border border-sky-500/40 text-sky-100 disabled:opacity-40',
                compact ? 'text-[7px] py-1' : 'text-[10px] py-1.5',
              )}
            >
              {checking ? 'Đang kiểm tra…' : 'Lưu & kết nối'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={cn(
                'rounded font-semibold bg-white/5 border border-white/15 text-white/70',
                compact ? 'text-[7px] px-2 py-1' : 'text-[10px] px-3 py-1.5',
              )}
            >
              Đóng
            </button>
          </div>
          {!getMobileAiBackendUrl() && (
            <p className={cn('text-white/45 mt-2 leading-snug', compact ? 'text-[5.5px]' : 'text-[8px]')}>
              Chạy backend trên máy tính, mở ngrok http 8000, dán URL vào đây.
            </p>
          )}
        </div>
      )}

      {!open && !getMobileAiBackendUrl() && (
        <div className={cn(
          'absolute z-[4] flex items-center gap-1 rounded bg-amber-500/15 border border-amber-500/30 text-amber-200/90',
          compact ? 'top-1 left-14 text-[6px] px-1 py-0.5' : 'top-2 left-16 text-[8px] px-1.5 py-0.5',
        )}>
          <WifiOff className={cn(compact ? 'w-2 h-2' : 'w-2.5 h-2.5')} />
          Chưa cấu hình AI
        </div>
      )}
    </>
  )
}
