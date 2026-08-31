import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Header } from '@/components/common/Header/Header'
import { Module05Page } from './Module05Page'

const WorkerProfileManagementPage = lazy(() =>
  import('./pages/WorkerProfileManagementPage').then(m => ({ default: m.WorkerProfileManagementPage })),
)
const WorkerFaceScanPage = lazy(() =>
  import('./pages/WorkerFaceScanPage').then(m => ({ default: m.WorkerFaceScanPage })),
)

function RouteFallback() {
  return <div className="min-h-[40vh] bg-[#0a0f16]" />
}

export function Module05Routes() {
  return (
    <Routes>
      <Route index element={<Module05Page />} />
      <Route
        path="ho-so"
        element={(
          <>
            <Header
              title="Hồ Sơ Công Nhân"
              subtitle="Import Excel · xem · sửa · xóa hồ sơ công nhân"
            />
            <Suspense fallback={<RouteFallback />}>
              <WorkerProfileManagementPage />
            </Suspense>
          </>
        )}
      />
      <Route
        path="quet-mat"
        element={(
          <>
            <Header
              title="Quét Mặt Công Nhân"
              subtitle="Tra mã bổ sung vector · hoặc tạo hồ sơ mới + quét 4 góc eKYC"
            />
            <Suspense fallback={<RouteFallback />}>
              <WorkerFaceScanPage />
            </Suspense>
          </>
        )}
      />
    </Routes>
  )
}
