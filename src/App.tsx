import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Sidebar } from '@/components/common/Sidebar/Sidebar'
import { Module01Page } from '@/modules/module01-access-control/Module01Page'
import { DTTTPage } from '@/modules/dao-tao-tuan-thu/DTTTPage'
import { Module03Page } from '@/modules/module03-safety/Module03Page'
import { Module04Page } from '@/modules/module04-housekeeping/Module04Page'
import { Module05Routes } from '@/modules/module05-productivity/Module05Routes'
import { Module06Page } from '@/modules/module06-assets/Module06Page'
import { Module07Page } from '@/modules/module07-inspection/Module07Page'
import { Module08Page } from '@/modules/module08-reporting/Module08Page'
import { EquipmentPage } from '@/modules/equipment-intelligence/EquipmentPage'
import { EquipmentProductivityPage } from '@/modules/module01-equipment-productivity/EquipmentProductivityPage'
import { ProfilePage } from '@/modules/auth/ProfilePage'
import { ScannerPage } from '@/modules/auth/ScannerPage'
import { DEFAULT_HOME_PATH } from '@/config'

/** Trang phát sóng chỉ dùng trên điện thoại người đeo mũ — tách chunk khỏi CMS. */
const HelmetPublisherPage = lazy(() =>
  import('@/modules/module05-productivity/publisher/HelmetPublisherPage')
    .then(m => ({ default: m.HelmetPublisherPage })),
)

/** Trang toàn màn hình, không có Sidebar. */
const KIOSK_PATHS = new Set(['/scanner', '/vifence/scanner', '/phat-song'])

function AppRoutes() {
  const location = useLocation()
  const isKiosk = KIOSK_PATHS.has(location.pathname)

  return (
    <div className="min-h-screen bg-background">
      {!isKiosk && <Sidebar />}
      <Routes>
        <Route path="/" element={<Navigate to={DEFAULT_HOME_PATH} replace />} />
        <Route path="/signin" element={<Navigate to={DEFAULT_HOME_PATH} replace />} />

        <Route path="/scanner" element={<ScannerPage />} />
        <Route path="/vifence/scanner" element={<ScannerPage />} />

        <Route
          path="/phat-song"
          element={(
            <Suspense fallback={<div className="min-h-screen bg-[#0a0f16]" />}>
              <HelmetPublisherPage />
            </Suspense>
          )}
        />

        <Route path="/equipment/*" element={<EquipmentPage />} />
        <Route path="/equipmentpro" element={<EquipmentProductivityPage />} />

        <Route path="/module02/*" element={<Navigate to="/dttt" replace />} />
        <Route path="/module02/equipment-intelligence-center" element={<Navigate to="/equipment" replace />} />
        <Route path="/module02/raw-sany-data" element={<Navigate to="/equipment/raw-sany-data" replace />} />

        <Route path="/module01/*" element={<Module01Page />} />
        <Route path="/dttt/*" element={<DTTTPage />} />
        <Route path="/module03/*" element={<Module03Page />} />
        <Route path="/module04/*" element={<Module04Page />} />
        <Route path="/module05/*" element={<Module05Routes />} />
        <Route path="/module06/*" element={<Module06Page />} />
        <Route path="/module07/*" element={<Module07Page />} />
        <Route path="/module08/*" element={<Module08Page />} />
        <Route path="/profile" element={<ProfilePage />} />

        <Route path="*" element={<Navigate to={DEFAULT_HOME_PATH} replace />} />
      </Routes>
    </div>
  )
}

export default function App() {
  const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || undefined

  return (
    <BrowserRouter basename={basename}>
      <AppRoutes />
    </BrowserRouter>
  )
}
