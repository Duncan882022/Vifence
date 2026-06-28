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
              title="04 Vệ Sinh Công Trường"
              subtitle="Giám sát vệ sinh – Chấm điểm tự động – Cải thiện liên tục"
            />
            <HousekeepingDashboardPage />
          </>
        )}
      />
    </Routes>
  )
}
