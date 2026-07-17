import { Routes, Route } from "react-router-dom";
import { Header } from "@/components/common/Header/Header";
import { DTTTDashboardPage } from "./pages/DTTTDashboardPage";
import { CourseManagementPage } from "./pages/CourseManagementPage";
import { ExecutiveReportPage } from "./pages/ExecutiveReportPage";
import { WorkerManagementPage } from "./pages/WorkerManagementPage";
import { ContractorManagementPage } from "./pages/ContractorManagementPage";
import { CameraManagementPage } from "./pages/CameraManagementPage";
import { UserManagementPage } from "./pages/UserManagementPage";
import { RoleManagementPage } from "./pages/RoleManagementPage";

export function DTTTPage() {
  return (
    <Routes>
      <Route
        index
        element={
          <>
            <Header
              title="Đào Tạo & Tuân Thủ"
              subtitle="Giám sát đào tạo, huấn luyện an toàn và tuân thủ quy định"
            />
            <DTTTDashboardPage />
          </>
        }
      />
      <Route
        path="quan-ly-khoa-hoc"
        element={
          <>
            <Header
              title="Quản Lý Khoá Học"
              subtitle="Tạo và quản lý lịch đào tạo trên công trường"
            />
            <CourseManagementPage />
          </>
        }
      />
      <Route
        path="bao-cao-dieu-hanh"
        element={
          <>
            <Header
              title="Báo Cáo Điều Hành"
              subtitle="Thống kê ca đào tạo theo khoảng thời gian"
            />
            <ExecutiveReportPage />
          </>
        }
      />
      <Route
        path="quan-ly-nhan-su"
        element={
          <>
            <Header
              title="Quản Lý Nhân Sự"
              subtitle="Quản lý danh sách nhân sự trên công trường"
            />
            <WorkerManagementPage />
          </>
        }
      />
      <Route
        path="quan-ly-nha-thau"
        element={
          <>
            <Header
              title="Quản Lý Nhà Thầu"
              subtitle="Tạo và quản lý thông tin nhà thầu phụ"
            />
            <ContractorManagementPage />
          </>
        }
      />
      <Route
        path="quan-ly-camera"
        element={
          <>
            <Header
              title="Quản Lý Camera"
              subtitle="Quản lý danh sách camera từ hệ thống Vision AI"
            />
            <CameraManagementPage />
          </>
        }
      />
      <Route
        path="quan-ly-tai-khoan"
        element={
          <>
            <Header
              title="Quản Lý Tài Khoản"
              subtitle="Quản trị danh sách người dùng và phân quyền hệ thống"
            />
            <UserManagementPage />
          </>
        }
      />
      <Route
        path="quan-ly-vai-tro"
        element={
          <>
            <Header
              title="Quản Lý Vai Trò"
              subtitle="Quản trị nhóm quyền và vai trò hệ thống"
            />
            <RoleManagementPage />
          </>
        }
      />
    </Routes>
  );
}
