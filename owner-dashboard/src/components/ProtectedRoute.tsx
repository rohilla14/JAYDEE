import { Navigate, Outlet } from 'react-router-dom'
import { getStoredRole } from '../api/auth'
import {
  SESSION_EXPIRED_MESSAGE,
  clearStoredToken,
  getStoredToken,
  setLoginFlashMessage,
} from '../api/client'

export function ProtectedRoute() {
  const token = getStoredToken()
  const role = getStoredRole()

  if (!token) {
    return <Navigate to="/login" replace />
  }

  // Garbage / non-owner tokens never hit the API — clear them and explain why.
  if (role !== 'owner') {
    clearStoredToken()
    setLoginFlashMessage(SESSION_EXPIRED_MESSAGE)
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
