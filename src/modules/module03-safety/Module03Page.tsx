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
              title="An Toàn Lao Động"
              subtitle="Giám sát PPE thời gian thực · OCP1 · Hạ Long Xanh — phát hiện vi phạm, heatmap rủi ro và xử lý sự cố"
            />
            <SafetyDashboardPage />
          </>
        )}
      />
    </Routes>
  )
}
