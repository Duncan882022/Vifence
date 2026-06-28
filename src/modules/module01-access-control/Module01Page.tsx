import { Routes, Route } from 'react-router-dom'
import { Header } from '@/components/common/Header/Header'
import { AccessControlDashboardPage } from './pages/AccessControlDashboardPage'

export function Module01Page() {
  return (
    <Routes>
      <Route
        index
        element={(
          <>
            <Header
              title="01 Kiểm Soát Vào Ra"
              subtitle="Giám sát người và phương tiện ra vào công trường"
            />
            <AccessControlDashboardPage />
          </>
        )}
      />
    </Routes>
  )
}
