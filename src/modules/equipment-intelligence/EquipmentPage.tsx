import { Navigate, Route, Routes } from 'react-router-dom'
import { Header } from '@/components/common/Header/Header'
import { AiRecommendationDrawer } from './ceo-dashboard/components/AiRecommendationDrawer'
import { CeoDashboardPage } from './ceo-dashboard/CeoDashboardPage'
import { useEquipmentAiNotifications } from './store/equipmentAiNotifications.store'
import { RawSanyDataPage } from './pages/RawSanyDataPage'

function EquipmentAiOverlays() {
  const { selectedItem, drawerOpen, closeDrawer } = useEquipmentAiNotifications()

  return (
    <AiRecommendationDrawer
      item={selectedItem}
      open={drawerOpen}
      onOpenChange={open => !open && closeDrawer()}
    />
  )
}

export function EquipmentPage() {
  return (
    <>
    <EquipmentAiOverlays />
    <Routes>
      <Route
        index
        element={(
          <>
            <Header
              title="Quản Lý MMTB"
              subtitle="Tổng quan điều hành máy móc thiết bị"
            />
            <CeoDashboardPage />
          </>
        )}
      />
      <Route
        path="raw-sany-data"
        element={(
          <>
            <Header
              title="Tra Cứu Raw SANY"
              subtitle="Dữ liệu telemetry thô từ thiết bị SANY"
            />
            <RawSanyDataPage />
          </>
        )}
      />
      <Route path="*" element={<Navigate to="/equipment" replace />} />
    </Routes>
    </>
  )
}
