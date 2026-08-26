import { useEffect, useState } from 'react'
import {
  getHelmetLocalStream,
  subscribeHelmetLocalBroadcast,
} from '@/services/helmetLocalBroadcast'

/**
 * Luồng camera của chính thiết bị này cho một mũ, nếu đang phát sóng trong cùng tab.
 * Trả null cho mọi camera khác — tile vẫn xem qua HLS như bình thường.
 */
export function useHelmetLocalStream(cameraId: string): MediaStream | null {
  const [stream, setStream] = useState<MediaStream | null>(
    () => getHelmetLocalStream(cameraId),
  )

  useEffect(() => {
    setStream(getHelmetLocalStream(cameraId))
    return subscribeHelmetLocalBroadcast(() => {
      setStream(getHelmetLocalStream(cameraId))
    })
  }, [cameraId])

  return stream
}
