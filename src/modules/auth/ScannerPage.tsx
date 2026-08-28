import { Navigate } from 'react-router-dom'

/** Legacy kiosk URL — Module 05 enroll thống nhất tại /module05/quet-mat. */
export function ScannerPage() {
  return <Navigate to="/module05/quet-mat" replace />
}
