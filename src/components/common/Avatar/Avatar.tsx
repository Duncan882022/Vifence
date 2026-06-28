import { cn } from '@/utils/cn'

export function Avatar({ name, color, src, size = 'md' }: {
  name: string
  color: string
  src?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const initials = name.split(' ').slice(-2).map(w => w[0]).join('').toUpperCase()
  const sz = size === 'sm' ? 'w-7 h-7 text-[9px]' : size === 'lg' ? 'w-12 h-12 text-base' : 'w-9 h-9 text-[11px]'
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        loading="lazy"
        className={cn('rounded-full object-cover shrink-0', sz)}
        style={{ boxShadow: `0 0 0 2px ${color}55` }}
      />
    )
  }
  return (
    <div
      className={cn('rounded-full flex items-center justify-center font-bold shrink-0', sz)}
      style={{ backgroundColor: color + '28', border: `2px solid ${color}55`, color }}
    >
      {initials}
    </div>
  )
}
