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
              subtitle="Giám sát, phát hiện vi phạm và quản lý an toàn lao động trên công trường"
            />
            <SafetyDashboardPage />
          </>
        )}
      />
    </Routes>
  )
}
