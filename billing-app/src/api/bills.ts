import { apiRequest } from './client'

export type BillItemRead = {
  product_id: number
  product_name: string
  quantity: number
  unit_price: string
  line_total: string
}

export type BillRead = {
  id: number
  customer_id: number | null
  staff_id: number
  items: BillItemRead[]
  total_amount: string
  discount_amount: string
  customer_tier_applied: 'bronze' | 'silver' | 'gold' | null
  points_earned: number
  created_at: string
}

export type BillCreate = {
  customer_id?: number | null
  items: { product_id: number; quantity: number }[]
}

export async function createBill(body: BillCreate): Promise<BillRead> {
  return apiRequest<BillRead>('/bills', {
    method: 'POST',
    body,
  })
}
