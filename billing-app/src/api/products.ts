import { apiRequest } from './client'

export type ProductWithInventory = {
  id: number
  name: string
  category_id: number
  barcode: string | null
  mrp: string
  member_price: string
  cost_price: string
  created_at: string
  inventory: {
    quantity: number
    reorder_threshold: number
  } | null
}

export async function getProductByBarcode(
  barcode: string,
): Promise<ProductWithInventory> {
  const encoded = encodeURIComponent(barcode)
  return apiRequest<ProductWithInventory>(`/products/barcode/${encoded}`)
}
