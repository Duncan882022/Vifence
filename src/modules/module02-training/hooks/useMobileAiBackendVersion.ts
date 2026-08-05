import { useEffect, useState } from 'react'
import { MOBILE_AI_BACKEND_STORAGE_KEY } from '../services/mobileAiBackend.service'

/** Re-mount AI clients khi URL backend mobile đổi (localStorage / custom event). */
export function useMobileAiBackendVersion(): number {
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const bump = () => setVersion(v => v + 1)
    const onStorage = (e: StorageEvent) => {
      if (e.key === MOBILE_AI_BACKEND_STORAGE_KEY) bump()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('vifence-mobile-ai-backend-changed', bump)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('vifence-mobile-ai-backend-changed', bump)
    }
  }, [])

  return version
}
