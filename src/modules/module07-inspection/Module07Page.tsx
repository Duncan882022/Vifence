import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { MatrixPage } from './pages/flow/MatrixPage'
import { InspectPage } from './pages/flow/InspectPage'
import { SignPage } from './pages/flow/SignPage'
import { flowPaths, legacyFlowRedirect } from './services/workflow/flowNav'

const ReportPage = lazy(() => import('./pages/flow/ReportPage').then(m => ({ default: m.ReportPage })))
const BimViewPage = lazy(() => import('./pages/flow/BimViewPage').then(m => ({ default: m.BimViewPage })))
const EngineeringPage = lazy(() => import('./pages/InspectionWorkspacePage').then(m => ({ default: m.InspectionWorkspacePage })))

function LegacyGate() {
  const { legacy = '' } = useParams()
  return <Navigate to={legacyFlowRedirect(legacy) ?? '/inspection'} replace />
}

function AssetRedirect() {
  const { assetId = '' } = useParams()
  return <Navigate to={flowPaths.asset(assetId)} replace />
}

function SessionRedirect({ to }: { to: 'inspect' | 'sign' }) {
  const { sessionId = '' } = useParams()
  return <Navigate to={to === 'inspect' ? flowPaths.inspect(sessionId) : flowPaths.sign(sessionId)} replace />
}

export function Module07Page() {
  return (
    <Suspense fallback={<div className="p-6 text-[12px] text-muted-foreground">Đang tải...</div>}>
      <Routes>
        <Route index element={<MatrixPage />} />
        <Route path="asset/:assetId" element={<MatrixPage />} />
        <Route path="asset/:assetId/bim" element={<BimViewPage />} />
        <Route path="asset/:assetId/engineering" element={<EngineeringPage />} />
        <Route path="asset/:assetId/stage/:stageId/prepare" element={<AssetRedirect />} />
        <Route path="session/:sessionId/inspect" element={<InspectPage />} />
        <Route path="session/:sessionId/sign" element={<SignPage />} />
        <Route path="session/:sessionId/live" element={<SessionRedirect to="inspect" />} />
        <Route path="session/:sessionId/finish" element={<SessionRedirect to="sign" />} />
        <Route path="session/:sessionId/review" element={<SessionRedirect to="sign" />} />
        <Route path="session/:sessionId/report" element={<ReportPage />} />
        <Route path="p/:projectId" element={<Navigate to="/inspection" replace />} />
        <Route path="p/:projectId/s/:structureId" element={<Navigate to="/inspection" replace />} />
        <Route path=":legacy/*" element={<LegacyGate />} />
        <Route path="*" element={<Navigate to="." replace />} />
      </Routes>
    </Suspense>
  )
}
