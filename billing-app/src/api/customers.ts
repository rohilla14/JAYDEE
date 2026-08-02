import { apiRequest } from './client'

export type Customer = {
  id: number
  name: string
  phone: string
  tier: 'bronze' | 'silver' | 'gold'
  points_balance: number
  lifetime_spend: string
  created_at: string
}

export async function getCustomerByPhone(phone: string): Promise<Customer> {
  const encoded = encodeURIComponent(phone)
  return apiRequest<Customer>(`/customers/phone/${encoded}`)
}

export async function createCustomer(body: {
  name: string
  phone: string
}): Promise<Customer> {
  return apiRequest<Customer>('/customers', {
    method: 'POST',
    body,
  })
}
