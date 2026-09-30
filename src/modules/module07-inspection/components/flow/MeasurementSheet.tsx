import { useEffect, useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/utils/cn'
import type { CriterionDef, EvidenceType } from '../../workflow.types'

export interface MeasurementInput {
  type: Extract<EvidenceType, 'measurement' | 'test' | 'document'>
  label: string
  value: string
  unit?: string
  note?: string
}

const KINDS: { id: MeasurementInput['type']; label: string }[] = [
  { id: 'measurement', label: 'Số đo' },
  { id: 'test', label: 'Kết quả thí nghiệm / vật liệu' },
  { id: 'document', label: 'Đính kèm tài liệu' },
]

interface Props {
  open: boolean
  criterion: CriterionDef | undefined
  onOpenChange: (open: boolean) => void
  onSave: (input: MeasurementInput) => void
}

/** §14 Measurement / Test — gắn vào tiêu chí đang chọn. */
export function MeasurementSheet({ open, criterion, onOpenChange, onSave }: Props) {
  const [type, setType] = useState<MeasurementInput['type']>('measurement')
  const [value, setValue] = useState('')
  const [unit, setUnit] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!open) return
    setType(criterion?.method === 'test' ? 'test' : criterion?.method === 'document' ? 'document' : 'measurement')
    setValue('')
    setUnit(criterion?.unit ?? '')
    setNote('')
  }, [open, criterion])

  const field = 'h-10 rounded-lg bg-white/5 border border-white/10 px-3 text-[13px] text-foreground'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="center" className="p-5 max-w-lg">
        <SheetHeader>
          <SheetTitle>Đo đạc / Thí nghiệm</SheetTitle>
          <p className="text-[11px] text-muted-foreground">
            {criterion ? `${criterion.code} ${criterion.title} · Design ${criterion.design} · Dung sai ${criterion.tolerance}` : 'Chọn tiêu chí trước'}
          </p>
        </SheetHeader>
        <div className="flex gap-1.5">
          {KINDS.map(k => (
            <button
              key={k.id}
              type="button"
              onClick={() => setType(k.id)}
              className={cn('h-9 px-3 rounded-lg border text-[11px] font-semibold', type === k.id ? 'border-primary/60 bg-primary/10 text-foreground' : 'border-white/10 text-muted-foreground')}
            >
              {k.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[1fr_110px] gap-2">
          <input
            autoFocus
            value={value}
            onChange={e => setValue(e.target.value)}
            inputMode={type === 'document' ? 'text' : 'decimal'}
            placeholder={type === 'document' ? 'Mã / tên tài liệu (VD: TN-NEN-S002)' : 'Giá trị (VD: 148, 176)'}
            className={field}
          />
          <input value={unit} onChange={e => setUnit(e.target.value)} placeholder="Đơn vị" className={field} disabled={type === 'document'} />
        </div>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Ghi chú (vị trí đo, thiết bị, số mẫu...)" className={field} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => onOpenChange(false)} className="h-10 px-4 rounded-lg border border-white/10 text-[12px] text-muted-foreground">Huỷ</button>
          <button
            type="button"
            disabled={!criterion || !value.trim()}
            onClick={() => {
              const kindLabel = KINDS.find(k => k.id === type)?.label ?? type
              onSave({ type, label: `${kindLabel} · ${criterion?.code ?? ''}`, value: value.trim(), unit: type === 'document' ? undefined : unit.trim() || undefined, note: note.trim() || undefined })
              onOpenChange(false)
            }}
            className="h-10 px-5 rounded-lg bg-sky-500/15 border border-sky-500/40 text-sky-300 text-[12px] font-bold disabled:opacity-40"
          >
            Lưu kết quả
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
