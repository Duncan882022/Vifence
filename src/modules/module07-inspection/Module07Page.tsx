import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AssetPassportPage } from './pages/flow/AssetPassportPage'
import { AssetsPage, ProjectsPage, StructuresPage } from './pages/flow/HierarchyPages'
import { StagePreparePage } from './pages/flow/StagePreparePage'
import { legacyFlowRedirect } from './services/workflow/flowNav'

const LiveInspectionPage = lazy(() => import('./pages/flow/LiveInspectionPage').then(m => ({ default: m.LiveInspectionPage })))
const FinishPage = lazy(() => import('./pages/flow/FinishPage').then(m => ({ default: m.FinishPage })))
const ReviewPage = lazy(() => import('./pages/flow/ReviewPage').then(m => ({ default: m.ReviewPage })))
const ReportPage = lazy(() => import('./pages/flow/ReportPage').then(m => ({ default: m.ReportPage })))
const EngineeringPage = lazy(() => import('./pages/InspectionWorkspacePage').then(m => ({ default: m.InspectionWorkspacePage })))

function LegacyGate() {
  const { legacy = '' } = useParams()
  return <Navigate to={legacyFlowRedirect(legacy) ?? '/inspection'} replace />
}

/**
 * Luồng chính: PROJECT → STRUCTURE → ASSET → STAGE → QR → CAMERA → INSPECTION → EVIDENCE → REVIEW → RESULT.
 * BIM/IFC Tree chỉ ở Engineering Mode.
 */
export function Module07Page() {
  return (
    <Suspense fallback={<div className="p-6 text-[12px] text-muted-foreground">Đang tải...</div>}>
      <Routes>
        <Route index element={<ProjectsPage />} />
        <Route path="p/:projectId" element={<StructuresPage />} />
        <Route path="p/:projectId/s/:structureId" element={<AssetsPage />} />
        <Route path="asset/:assetId" element={<AssetPassportPage />} />
        <Route path="asset/:assetId/stage/:stageId/prepare" element={<StagePreparePage />} />
        <Route path="asset/:assetId/engineering" element={<EngineeringPage />} />
        <Route path="session/:sessionId/live" element={<LiveInspectionPage />} />
        <Route path="session/:sessionId/finish" element={<FinishPage />} />
        <Route path="session/:sessionId/review" element={<ReviewPage />} />
        <Route path="session/:sessionId/report" element={<ReportPage />} />
        <Route path=":legacy/*" element={<LegacyGate />} />
        <Route path="*" element={<Navigate to="." replace />} />
      </Routes>
    </Suspense>
  )
}
