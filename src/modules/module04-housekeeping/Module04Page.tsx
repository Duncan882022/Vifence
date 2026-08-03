import { Routes, Route } from 'react-router-dom'
import { Header } from '@/components/common/Header/Header'
import { HousekeepingDashboardPage } from './pages/HousekeepingDashboardPage'

export function Module04Page() {
  return (
    <Routes>
      <Route
        index
        element={(
          <>
            <Header
              title="04 Vệ Sinh & Logistics"
              subtitle="Giám sát Housekeeping & Logistics bằng AI — ROI đường nội bộ · LOG-01 · HK-01–04"
            />
            <HousekeepingDashboardPage />
          </>
        )}
      />
    </Routes>
  )
}
