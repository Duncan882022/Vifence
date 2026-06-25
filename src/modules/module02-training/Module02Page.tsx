import { Routes, Route } from 'react-router-dom'
import { Header } from '@/components/common/Header/Header'
import { Module02DashboardPage } from './pages/Module02DashboardPage'
import { CourseManagementPage } from './pages/CourseManagementPage'
import { ExecutiveReportPage } from './pages/ExecutiveReportPage'

export function Module02Page() {
  return (
    <Routes>
      <Route
        index
        element={(
          <>
            <Header
              title="Đào Tạo & Tuân Thủ"
              subtitle="Giám sát đào tạo, huấn luyện an toàn và tuân thủ quy định"
            />
            <Module02DashboardPage />
          </>
        )}
      />
      <Route
        path="quan-ly-khoa-hoc"
        element={(
          <>
            <Header
              title="Quản Lý Khoá Học"
              subtitle="Tạo và quản lý lịch đào tạo trên công trường"
            />
            <CourseManagementPage />
          </>
        )}
      />
      <Route
        path="bao-cao-dieu-hanh"
        element={(
          <>
            <Header
              title="Báo Cáo Điều Hành"
              subtitle="Thống kê ca đào tạo theo khoảng thời gian"
            />
            <ExecutiveReportPage />
          </>
        )}
      />
    </Routes>
  )
}
