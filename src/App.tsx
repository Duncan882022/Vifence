import type { ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Sidebar } from '@/components/common/Sidebar/Sidebar'
import { Module01Page } from '@/modules/module01-access-control/Module01Page'
import { DTTTPage } from '@/modules/dao-tao-tuan-thu/DTTTPage'
import { Module03Page } from '@/modules/module03-safety/Module03Page'
import { Module04Page } from '@/modules/module04-housekeeping/Module04Page'
import { Module05Page } from '@/modules/module05-productivity/Module05Page'
import { Module06Page } from '@/modules/module06-assets/Module06Page'
import { Module07Page } from '@/modules/module07-inspection/Module07Page'
import { Module08Page } from '@/modules/module08-reporting/Module08Page'
import { EquipmentPage } from '@/modules/equipment-intelligence/EquipmentPage'
import { EquipmentProductivityPage } from '@/modules/module01-equipment-productivity/EquipmentProductivityPage'
import { SigninPage } from '@/modules/auth/SigninPage'
import { ProfilePage } from '@/modules/auth/ProfilePage'
import { useAppStore } from '@/store/app.store'
import { DEFAULT_HOME_PATH } from '@/config'
import { IS_GHPAGES } from '@/modules/dao-tao-tuan-thu/services/ghpagesDemo.service'

function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAppStore()
  if (IS_GHPAGES || user) return <>{children}</>
  return <Navigate to="/signin" replace />
}

export default function App() {
  const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || undefined
  const { user } = useAppStore()
  const authed = IS_GHPAGES || !!user

  return (
    <BrowserRouter basename={basename}>
      <div className="min-h-screen bg-background">
        {authed && <Sidebar />}
        <Routes>
          <Route
            path="/signin"
            element={authed ? <Navigate to={DEFAULT_HOME_PATH} replace /> : <SigninPage />}
          />

          <Route path="/" element={<Navigate to={authed ? DEFAULT_HOME_PATH : '/signin'} replace />} />

          <Route path="/equipment/*" element={<RequireAuth><EquipmentPage /></RequireAuth>} />
          <Route path="/equipmentpro" element={<RequireAuth><EquipmentProductivityPage /></RequireAuth>} />

          {/* Legacy module02 → dttt */}
          <Route path="/module02/*" element={<Navigate to="/dttt" replace />} />
          <Route path="/module02/equipment-intelligence-center" element={<Navigate to="/equipment" replace />} />
          <Route path="/module02/raw-sany-data" element={<Navigate to="/equipment/raw-sany-data" replace />} />

          <Route path="/module01/*" element={<RequireAuth><Module01Page /></RequireAuth>} />
          <Route path="/dttt/*" element={<RequireAuth><DTTTPage /></RequireAuth>} />
          <Route path="/module03/*" element={<RequireAuth><Module03Page /></RequireAuth>} />
          <Route path="/module04/*" element={<RequireAuth><Module04Page /></RequireAuth>} />
          <Route path="/module05/*" element={<RequireAuth><Module05Page /></RequireAuth>} />
          <Route path="/module06/*" element={<RequireAuth><Module06Page /></RequireAuth>} />
          <Route path="/module07/*" element={<RequireAuth><Module07Page /></RequireAuth>} />
          <Route path="/module08/*" element={<RequireAuth><Module08Page /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />

          <Route path="*" element={<Navigate to={authed ? DEFAULT_HOME_PATH : '/signin'} replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
