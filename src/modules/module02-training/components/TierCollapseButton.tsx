import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/utils/cn'

interface TierCollapseButtonProps {
  open: boolean
  onToggle: () => void
  label: string
  className?: string
}

export function TierCollapseButton({ open, onToggle, label, className }: TierCollapseButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'p-1 rounded hover:bg-[#1a2235] text-muted-foreground hover:text-foreground transition-colors shrink-0',
        className,
      )}
      title={open ? `Thu gọn ${label}` : `Mở rộng ${label}`}
      aria-expanded={open}
      aria-label={open ? `Thu gọn ${label}` : `Mở rộng ${label}`}
    >
      {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
    </button>
  )
}
