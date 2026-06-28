import { useState } from 'react'
import { Search, Lock } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useTrialLock } from '@/hooks/useTrialLock'

interface AccessGlobalSearchProps {
  className?: string
}

export function AccessGlobalSearch({ className }: AccessGlobalSearchProps) {
  const [value, setValue] = useState('')
  const { show: showTrial } = useTrialLock()

  return (
    <div className={cn('relative max-w-xl w-full', className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
      <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/30" />
      <input
        type="search"
        readOnly
        value={value}
        onClick={showTrial}
        onChange={e => setValue(e.target.value)}
        placeholder="Tìm kiếm người, biển số, thẻ, nhà thầu…"
        className="w-full pl-9 pr-9 py-2 text-xs bg-[#1a2235] border border-[#1e2433] rounded-lg text-foreground placeholder:text-muted-foreground/50 cursor-pointer hover:border-[#2a3855] transition-colors"
      />
    </div>
  )
}
