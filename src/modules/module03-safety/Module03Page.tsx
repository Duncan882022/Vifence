import { useLayoutEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Header } from '@/components/common/Header/Header'
import { useTenantStore } from '@/store/tenant.store'
import type { TenantId } from '@/data/tenants'
import { SafetyDashboardPage } from './pages/SafetyDashboardPage'
import { SafetyGroupPage } from './pages/SafetyGroupPage'
import { SafetyZonePage } from './pages/SafetyZonePage'

const DEFAULT_SAFETY_TENANT_ID: TenantId = 'ocp1'

function useSafetyTenant() {
  const setActiveTenant = useTenantStore(s => s.setActiveTenant)
  useLayoutEffect(() => {
    setActiveTenant(DEFAULT_SAFETY_TENANT_ID)
  }, [setActiveTenant])
}

export function Module03Page() {
  useSafetyTenant()

  return (
    <Routes>
      <Route
        index
        element={(
          <>
            <Header
              title="Giám Sát An Toàn Lao Động"
              subtitle="Theo dõi rủi ro, vi phạm và tình trạng xử lý"
            />
            <SafetyDashboardPage />
          </>
        )}
      />
      <Route
        path="group/:groupId"
        element={(
          <>
            <Header title="Chi Tiết Nhóm An Toàn" subtitle="Giám sát theo nhóm và kịch bản" />
            <SafetyGroupPage />
          </>
        )}
      />
      <Route
        path="zones/:zoneId"
        element={(
          <>
            <Header title="Chi Tiết Khu Vực" subtitle="Thiết bị, profile và sự kiện theo zone" />
            <SafetyZonePage />
          </>
        )}
      />
    </Routes>
  )
}
