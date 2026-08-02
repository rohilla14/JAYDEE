import { apiRequest } from './client'

export type DailySalesReport = {
  date: string
  total_revenue: string
  total_bills: number
  total_items_sold: number
}

export type LowStockItem = {
  product_id: number
  name: string
  barcode: string | null
  quantity: number
  reorder_threshold: number
}

export type TopProductItem = {
  product_id: number
  name: string
  total_quantity_sold: number
  total_revenue: string
}

export function getDailySales(date?: string): Promise<DailySalesReport> {
  const query = date ? `?date=${encodeURIComponent(date)}` : ''
  return apiRequest<DailySalesReport>(`/reports/daily-sales${query}`)
}

export function getLowStock(): Promise<LowStockItem[]> {
  return apiRequest<LowStockItem[]>('/reports/low-stock')
}

export function getTopProducts(days = 7): Promise<TopProductItem[]> {
  return apiRequest<TopProductItem[]>(`/reports/top-products?days=${days}`)
}
