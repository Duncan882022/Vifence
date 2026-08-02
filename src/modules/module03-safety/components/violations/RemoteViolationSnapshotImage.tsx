import { useEffect, useState } from 'react'
import { cn } from '@/utils/cn'

const TUNNEL_HEADERS: Record<string, string> = {
  'ngrok-skip-browser-warning': 'true',
}

function needsTunnelFetch(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

/** Snapshot từ backend/ngrok — img tag không gửi được header ngrok, phải fetch blob. */
export function RemoteViolationSnapshotImage({
  src,
  alt,
  className,
}: {
  src: string
  alt: string
  className?: string
}) {
  const [displaySrc, setDisplaySrc] = useState(() => (
    needsTunnelFetch(src) ? undefined : src
  ))

  useEffect(() => {
    if (!needsTunnelFetch(src)) {
      setDisplaySrc(src)
      return
    }

    let cancelled = false
    let objectUrl: string | undefined

    fetch(src, { headers: TUNNEL_HEADERS, mode: 'cors' })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.blob()
      })
      .then(blob => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setDisplaySrc(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setDisplaySrc(undefined)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src])

  if (!displaySrc) {
    return (
      <div className={cn('bg-[#0a0e17]', className)} aria-hidden />
    )
  }

  return (
    <img
      src={displaySrc}
      alt={alt}
      className={className}
      loading="lazy"
    />
  )
}
