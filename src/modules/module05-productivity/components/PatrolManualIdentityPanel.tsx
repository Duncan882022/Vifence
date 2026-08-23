import { useEffect, useState } from 'react'
import { UserCheck } from 'lucide-react'
import { cn } from '@/utils/cn'
import {
  assignPatrolManualIdentity,
  findPatrolIdentityByWorkerId,
  getPatrolManualIdentity,
  normalizePatrolWorkerId,
  type PatrolManualIdentity,
} from '../services/patrolManualIdentity.service'

interface PatrolManualIdentityPanelProps {
  objectKey: string
  suggestedWorkerId?: string | null
  compact?: boolean
  onAssigned?: (identity: PatrolManualIdentity) => void
}

export function PatrolManualIdentityPanel({
  objectKey,
  suggestedWorkerId,
  compact,
  onAssigned,
}: PatrolManualIdentityPanelProps) {
  const [open, setOpen] = useState(false)
  const [workerId, setWorkerId] = useState('')
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [error, setError] = useState<string | null>(null)
  const existing = getPatrolManualIdentity(objectKey)

  useEffect(() => {
    if (!open) return
    const baseWorkerId = existing?.workerId || suggestedWorkerId || ''
    setWorkerId(baseWorkerId)
    setName(existing?.workerName ?? '')
    setUnit(existing?.unitName ?? '')
    setError(null)
  }, [open, objectKey, existing?.workerId, existing?.workerName, existing?.unitName, suggestedWorkerId])

  const loadFromWorkerId = (rawId: string, keepNameIfFilled = false) => {
    const id = normalizePatrolWorkerId(rawId)
    if (!id) return
    const found = findPatrolIdentityByWorkerId(id)
    if (!found) return
    if (!keepNameIfFilled || !name.trim()) setName(found.workerName)
    if (!keepNameIfFilled || !unit.trim()) setUnit(found.unitName)
  }

  const submit = () => {
    const code = normalizePatrolWorkerId(workerId)
    const workerName = name.trim()
    const unitName = unit.trim()
    if (!code) {
      setError('Nhập mã định danh')
      return
    }
    if (!workerName) {
      setError('Nhập họ tên')
      return
    }
    if (!unitName) {
      setError('Nhập đơn vị')
      return
    }
    const row = assignPatrolManualIdentity({
      objectKey,
      workerId: code,
      workerName,
      unitName,
    })
    if (!row) {
      setError('Không lưu được — thử lại')
      return
    }
    setOpen(false)
    setError(null)
    onAssigned?.(row)
  }

  if (existing && !open) {
    return (
      <div className={cn(
        'rounded-lg border border-violet-500/30 bg-violet-500/5 px-2.5 py-2 space-y-0.5',
        compact && 'py-1.5',
      )}>
        <p className="text-[9px] font-mono text-violet-300/80">{existing.workerId}</p>
        <p className="text-[10px] font-semibold text-violet-200">{existing.workerName}</p>
        <p className="text-[9px] text-muted-foreground">Đơn vị: {existing.unitName}</p>
        {existing.objectKeys.length > 1 && (
          <p className="text-[8px] text-muted-foreground/80">
            {existing.objectKeys.length} track đã gộp
          </p>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[8px] text-violet-300/90 hover:text-violet-200 underline-offset-2 hover:underline"
        >
          Sửa định danh
        </button>
      </div>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-semibold',
          'bg-violet-500/15 text-violet-300 border border-violet-500/35 hover:bg-violet-500/25 transition-colors',
          compact && 'px-2 py-1 text-[9px]',
        )}
      >
        <UserCheck className="w-3 h-3" />
        Định danh
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-violet-500/35 bg-violet-500/5 p-2.5 space-y-2">
      <p className="text-[10px] font-semibold text-violet-200">Gán định danh thủ công</p>
      <p className="text-[8px] text-muted-foreground font-mono">Track hiện tại: {objectKey}</p>
      <label className="block space-y-1">
        <span className="text-[9px] text-muted-foreground">Mã định danh</span>
        <input
          type="text"
          value={workerId}
          onChange={e => {
            setWorkerId(e.target.value)
            loadFromWorkerId(e.target.value, true)
          }}
          onBlur={() => loadFromWorkerId(workerId)}
          placeholder="SGC-0000123 / WRK-001"
          className="w-full rounded-md border border-[#334155] bg-[#0a0e17] px-2 py-1.5 text-[11px] font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-violet-500/50"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[9px] text-muted-foreground">Họ tên</span>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Nguyễn Văn A"
          className="w-full rounded-md border border-[#334155] bg-[#0a0e17] px-2 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-violet-500/50"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[9px] text-muted-foreground">Đơn vị</span>
        <input
          type="text"
          value={unit}
          onChange={e => setUnit(e.target.value)}
          placeholder="SGC / Vincons / …"
          className="w-full rounded-md border border-[#334155] bg-[#0a0e17] px-2 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-violet-500/50"
        />
      </label>
      {error && <p className="text-[9px] text-amber-400">{error}</p>}
      <div className="flex flex-wrap gap-2 pt-0.5">
        <button
          type="button"
          onClick={submit}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-violet-500 text-white hover:opacity-90"
        >
          <UserCheck className="w-3 h-3" />
          Lưu
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setError(null)
          }}
          className="px-2.5 py-1 rounded-md text-[10px] font-medium text-muted-foreground border border-[#334155] hover:bg-[#1a2235]"
        >
          Huỷ
        </button>
      </div>
    </div>
  )
}
