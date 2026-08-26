import { Routes, Route } from 'react-router-dom'
import { Header } from '@/components/common/Header/Header'
import { Module05Page } from './Module05Page'
import { WorkerProfileManagementPage } from './pages/WorkerProfileManagementPage'
import { WorkerFaceScanPage } from './pages/WorkerFaceScanPage'

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
              subtitle="Import Excel & quản lý danh tính tuần tra Module 05"
            />
            <WorkerProfileManagementPage />
          </>
        )}
      />
      <Route
        path="quet-mat"
        element={(
          <>
            <Header
              title="Quét Mặt Công Nhân"
              subtitle="Công nhân tự quét → nhập thông tin · HR dùng ?admin=1"
            />
            <WorkerFaceScanPage />
          </>
        )}
      />
    </Routes>
  )
}
