import type { ElementType, ReactNode } from 'react'
import { cn } from '@/utils/cn'

interface TruncateTextProps {
  children: ReactNode
  /** Tooltip — mặc định lấy từ children nếu là string */
  title?: string
  className?: string
  as?: ElementType
}

/** Text truncate + tooltip khi nội dung bị cắt. */
export function TruncateText({
  children,
  title,
  className,
  as: Tag = 'span',
}: TruncateTextProps) {
  const tip = title ?? (typeof children === 'string' ? children : undefined)

  return (
    <Tag className={cn('truncate block min-w-0', className)} title={tip}>
      {children}
    </Tag>
  )
}
