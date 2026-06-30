import { Navigate, Route, Routes } from 'react-router-dom'
import { CeoDashboardPage } from './ceo-dashboard/CeoDashboardPage'
import { RawSanyDataPage } from './pages/RawSanyDataPage'

export function EquipmentPage() {
  return (
    <Routes>
      <Route index element={<CeoDashboardPage />} />
      <Route path="raw-sany-data" element={<RawSanyDataPage />} />
      <Route path="*" element={<Navigate to="/equipment" replace />} />
    </Routes>
  )
}
