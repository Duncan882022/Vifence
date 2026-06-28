import { Routes, Route } from 'react-router-dom'
import { Header } from '@/components/common/Header/Header'
import { SafetyDashboardPage } from './pages/SafetyDashboardPage'

export function Module03Page() {
  return (
    <Routes>
      <Route
        index
        element={(
          <>
            <Header
              title="Giám Sát An Toàn"
              subtitle="Phát hiện và xử lý vi phạm an toàn lao động"
            />
            <SafetyDashboardPage />
          </>
        )}
      />
    </Routes>
  )
}
