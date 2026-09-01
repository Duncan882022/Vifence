/**
 * Nhắc giữ tab + cảnh báo trước khi đóng khi đang phát WHIP.
 */
import { useEffect } from 'react'

export function usePublisherKeepAlive(isLive: boolean): void {
  useEffect(() => {
    if (!isLive) return

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isLive])
}
