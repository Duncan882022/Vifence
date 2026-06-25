import { useState, useRef, useEffect, useCallback } from 'react'

const TRIAL_DISMISS_MS = 2800

export function useTrialLock() {
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dismiss = useCallback(() => setVisible(false), [])

  const show = useCallback(() => {
    setVisible(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setVisible(false), TRIAL_DISMISS_MS)
  }, [])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  return { visible, show, dismiss }
}
