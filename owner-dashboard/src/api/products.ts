import { apiRequest, getStoredToken, NetworkError, ApiError } from './client'

function getBaseUrl(): string {
  const base = import.meta.env.VITE_API_URL
  if (!base) {
    throw new Error('VITE_API_URL is not set')
  }
  return base.replace(/\/$/, '')
}

export type Category = {
  id: number
  name: string
}

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

export type ProductCreateBody = {
  name: string
  category_id: number
  barcode?: string | null
  mrp: string
  member_price: string
  cost_price: string
  initial_quantity?: number
}

export function listCategories(): Promise<Category[]> {
  return apiRequest<Category[]>('/categories')
}

export function createCategory(name: string): Promise<Category> {
  return apiRequest<Category>('/categories', {
    method: 'POST',
    body: { name },
  })
}

export function listProducts(search?: string): Promise<ProductWithInventory[]> {
  const query =
    search && search.trim()
      ? `?search=${encodeURIComponent(search.trim())}`
      : ''
  return apiRequest<ProductWithInventory[]>(`/products${query}`)
}

export function createProduct(
  body: ProductCreateBody,
): Promise<ProductWithInventory> {
  return apiRequest<ProductWithInventory>('/products', {
    method: 'POST',
    body,
  })
}

export function adjustProductStock(
  productId: number,
  delta: number,
): Promise<ProductWithInventory> {
  return apiRequest<ProductWithInventory>(`/products/${productId}/stock`, {
    method: 'PATCH',
    body: { delta },
  })
}

/** Fetch label PDF with auth and open it in a new tab (Bearer headers don't apply to window.open). */
export async function openProductLabelPdf(productId: number): Promise<void> {
  const token = getStoredToken()
  let response: Response
  try {
    response = await fetch(`${getBaseUrl()}/products/${productId}/label-pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  } catch {
    throw new NetworkError()
  }

  if (!response.ok) {
    let errorBody: unknown = null
    try {
      errorBody = await response.json()
    } catch {
      errorBody = await response.text()
    }
    throw new ApiError(response.status, errorBody)
  }

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener,noreferrer')
  // Revoke later so the new tab has time to load.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
