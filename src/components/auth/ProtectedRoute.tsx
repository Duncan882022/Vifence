import { Navigate, useLocation } from 'react-router-dom'
import { IS_DEMO_AUTH } from '@/modules/dao-tao-tuan-thu/services/ghpagesDemo.service'
import { isPatrolAuthenticated } from '@/services/patrolApiClient'

interface ProtectedRouteProps {
  children: React.ReactNode
  minimumRole?: 'viewer' | 'operator' | 'hr' | 'admin'
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const location = useLocation()

  if (IS_DEMO_AUTH || isPatrolAuthenticated()) {
    return children
  }

  return <Navigate to="/signin" replace state={{ from: location.pathname }} />
}
