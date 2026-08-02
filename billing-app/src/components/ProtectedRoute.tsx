import { Navigate, Outlet } from 'react-router-dom'
import { getStoredToken } from '../api/client'

export function ProtectedRoute() {
  const token = getStoredToken()
  if (!token) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}
