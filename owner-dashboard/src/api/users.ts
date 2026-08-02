import { apiRequest } from './client'

export type StaffRole = 'owner' | 'billing_staff' | 'stock_staff'

export type StaffUser = {
  id: number
  name: string
  phone: string
  role: StaffRole
  is_active: boolean
  created_at: string
}

export type RegisterStaffBody = {
  name: string
  phone: string
  password: string
  role: StaffRole
}

export function listUsers(): Promise<StaffUser[]> {
  return apiRequest<StaffUser[]>('/users')
}

export function registerStaff(body: RegisterStaffBody): Promise<StaffUser> {
  return apiRequest<StaffUser>('/auth/register', {
    method: 'POST',
    body,
  })
}

export function deactivateUser(userId: number): Promise<StaffUser> {
  return apiRequest<StaffUser>(`/users/${userId}/deactivate`, {
    method: 'PATCH',
  })
}
