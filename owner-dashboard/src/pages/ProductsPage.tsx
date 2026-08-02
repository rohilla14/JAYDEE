import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getApiErrorMessage } from '../api/auth'
import {
  ApiError,
  SESSION_EXPIRED_MESSAGE,
  clearStoredToken,
  setLoginFlashMessage,
} from '../api/client'
import {
  adjustProductStock,
  createCategory,
  createProduct,
  listCategories,
  listProducts,
  openProductLabelPdf,
  type Category,
  type ProductWithInventory,
} from '../api/products'

export function ProductsPage() {
  const navigate = useNavigate()
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<ProductWithInventory[]>([])
  const [search, setSearch] = useState('')
  const [searchDraft, setSearchDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stockBusyId, setStockBusyId] = useState<number | null>(null)
  const stockBusyRef = useRef<number | null>(null)

  const [showAddProduct, setShowAddProduct] = useState(false)
  const [productName, setProductName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [mrp, setMrp] = useState('')
  const [costPrice, setCostPrice] = useState('')
  const [barcode, setBarcode] = useState('')
  const [initialQty, setInitialQty] = useState('0')
  const [creating, setCreating] = useState(false)
  const [createdProduct, setCreatedProduct] = useState<ProductWithInventory | null>(
    null,
  )
  const [createError, setCreateError] = useState<string | null>(null)

  const [newCategoryName, setNewCategoryName] = useState('')
  const [categoryBusy, setCategoryBusy] = useState(false)
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const [categorySuccess, setCategorySuccess] = useState<string | null>(null)

  const categoryNameById = useMemo(() => {
    const map = new Map<number, string>()
    for (const cat of categories) {
      map.set(cat.id, cat.name)
    }
    return map
  }, [categories])

  const redirectSessionExpired = useCallback(
    (message = SESSION_EXPIRED_MESSAGE) => {
      clearStoredToken()
      setLoginFlashMessage(message)
      navigate('/login', { replace: true })
    },
    [navigate],
  )

  const handleAuthError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        redirectSessionExpired()
        return true
      }
      if (err instanceof ApiError && err.status === 403) {
        redirectSessionExpired(
          'Owner access only — please log in with an owner account',
        )
        return true
      }
      return false
    },
    [redirectSessionExpired],
  )

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [cats, prods] = await Promise.all([
        listCategories(),
        listProducts(search),
      ])
      setCategories(cats)
      setProducts(prods)
      setCategoryId((current) => {
        if (current) {
          return current
        }
        return cats[0] ? String(cats[0].id) : ''
      })
    } catch (err) {
      if (handleAuthError(err)) {
        return
      }
      setError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [handleAuthError, search])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  function handleLogout() {
    clearStoredToken()
    navigate('/login', { replace: true })
  }

  async function handleSearch(event: FormEvent) {
    event.preventDefault()
    setSearch(searchDraft.trim())
  }

  function resetProductForm() {
    setProductName('')
    setMrp('')
    setCostPrice('')
    setBarcode('')
    setInitialQty('0')
    setCreateError(null)
    setCreatedProduct(null)
    if (categories[0]) {
      setCategoryId(String(categories[0].id))
    }
  }

  async function handleCreateProduct(event: FormEvent) {
    event.preventDefault()
    setCreateError(null)
    setCreatedProduct(null)

    const parsedMrp = Number.parseFloat(mrp)
    const parsedCost = Number.parseFloat(costPrice)
    const parsedQty = Number.parseInt(initialQty, 10)
    const catId = Number.parseInt(categoryId, 10)

    if (!productName.trim()) {
      setCreateError('Name is required')
      return
    }
    if (!Number.isFinite(catId)) {
      setCreateError('Choose a category')
      return
    }
    if (!Number.isFinite(parsedMrp) || parsedMrp < 0) {
      setCreateError('Enter a valid MRP')
      return
    }
    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
      setCreateError('Enter a valid cost price')
      return
    }
    if (!Number.isInteger(parsedQty) || parsedQty < 0) {
      setCreateError('Initial stock must be a whole number ≥ 0')
      return
    }

    setCreating(true)
    try {
      const mrpValue = parsedMrp.toFixed(2)
      const created = await createProduct({
        name: productName.trim(),
        category_id: catId,
        barcode: barcode.trim() ? barcode.trim() : null,
        mrp: mrpValue,
        member_price: mrpValue,
        cost_price: parsedCost.toFixed(2),
        initial_quantity: parsedQty,
      })
      setCreatedProduct(created)
      setProducts((prev) => {
        const without = prev.filter((p) => p.id !== created.id)
        return [...without, created].sort((a, b) => a.id - b.id)
      })
    } catch (err) {
      if (handleAuthError(err)) {
        return
      }
      setCreateError(getApiErrorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  async function handleAdjustStock(productId: number, delta: number) {
    if (stockBusyRef.current !== null) {
      return
    }
    stockBusyRef.current = productId
    setStockBusyId(productId)
    setError(null)
    try {
      const updated = await adjustProductStock(productId, delta)
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? updated : p)),
      )
    } catch (err) {
      if (handleAuthError(err)) {
        return
      }
      setError(getApiErrorMessage(err))
    } finally {
      stockBusyRef.current = null
      setStockBusyId(null)
    }
  }

  async function handlePrintLabel(productId: number) {
    setError(null)
    try {
      await openProductLabelPdf(productId)
    } catch (err) {
      if (handleAuthError(err)) {
        return
      }
      setError(getApiErrorMessage(err))
    }
  }

  async function handleAddCategory(event: FormEvent) {
    event.preventDefault()
    setCategoryError(null)
    setCategorySuccess(null)
    const name = newCategoryName.trim()
    if (!name) {
      setCategoryError('Category name is required')
      return
    }

    setCategoryBusy(true)
    try {
      const created = await createCategory(name)
      setCategories((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
      )
      setNewCategoryName('')
      setCategorySuccess(`Added “${created.name}”`)
      if (!categoryId) {
        setCategoryId(String(created.id))
      }
    } catch (err) {
      if (handleAuthError(err)) {
        return
      }
      setCategoryError(getApiErrorMessage(err))
    } finally {
      setCategoryBusy(false)
    }
  }

  return (
    <main className="dashboard products-page">
      <header className="page-header">
        <div>
          <h1>Products</h1>
          <p className="subtitle">Catalog, stock, and labels</p>
        </div>
        <div className="header-actions">
          <Link className="secondary link-btn" to="/dashboard">
            Dashboard
          </Link>
          <Link className="secondary link-btn" to="/staff">
            Staff
          </Link>
          <Link className="secondary link-btn" to="/architecture">
            Architecture
          </Link>
          <button
            type="button"
            className="primary"
            onClick={() => {
              setShowAddProduct(true)
              setCreatedProduct(null)
              setCreateError(null)
            }}
          >
            Add Product
          </button>
          <button type="button" className="secondary" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="panel">
        <form className="toolbar" onSubmit={handleSearch}>
          <label className="grow">
            Search
            <input
              type="search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Name or barcode"
            />
          </label>
          <button type="submit" className="secondary" disabled={loading}>
            {loading ? 'Loading…' : 'Search'}
          </button>
        </form>

        <div className="table-scroll">
          {loading && products.length === 0 ? (
            <p className="muted">Loading products…</p>
          ) : products.length === 0 ? (
            <p className="muted">No products match this search.</p>
          ) : (
            <table className="data-table products-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Barcode</th>
                  <th>MRP</th>
                  <th>Stock</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const busy = stockBusyId === product.id
                  const qty = product.inventory?.quantity ?? 0
                  return (
                    <tr key={product.id}>
                      <td>{product.name}</td>
                      <td>
                        {categoryNameById.get(product.category_id) ??
                          `#${product.category_id}`}
                      </td>
                      <td>
                        <code>{product.barcode ?? '—'}</code>
                      </td>
                      <td>₹{product.mrp}</td>
                      <td>
                        <div className="stock-inline">
                          <button
                            type="button"
                            className="secondary adjust-btn"
                            disabled={busy || qty <= 0}
                            onClick={() => void handleAdjustStock(product.id, -1)}
                            aria-label={`Decrease stock for ${product.name}`}
                          >
                            −
                          </button>
                          <strong>{qty}</strong>
                          <button
                            type="button"
                            className="secondary adjust-btn"
                            disabled={busy}
                            onClick={() => void handleAdjustStock(product.id, 1)}
                            aria-label={`Increase stock for ${product.name}`}
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="secondary"
                          disabled={!product.barcode}
                          onClick={() => void handlePrintLabel(product.id)}
                        >
                          Print Label
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {showAddProduct ? (
        <section className="panel">
          <div className="panel-heading">
            <h2>Add product</h2>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setShowAddProduct(false)
                resetProductForm()
              }}
            >
              Close
            </button>
          </div>

          {createdProduct ? (
            <div className="created-product" role="status">
              <p>
                Created <strong>{createdProduct.name}</strong>
              </p>
              <p>
                Barcode:{' '}
                <code className="barcode-highlight">
                  {createdProduct.barcode ?? '—'}
                </code>
              </p>
              <p className="muted">
                Stock: {createdProduct.inventory?.quantity ?? 0} · MRP ₹
                {createdProduct.mrp}
              </p>
              <div className="header-actions">
                <button
                  type="button"
                  className="primary"
                  disabled={!createdProduct.barcode}
                  onClick={() => void handlePrintLabel(createdProduct.id)}
                >
                  Print Label
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    resetProductForm()
                  }}
                >
                  Add another
                </button>
              </div>
            </div>
          ) : (
            <form className="product-form" onSubmit={handleCreateProduct}>
              <label>
                Name
                <input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  required
                />
              </label>

              <label>
                Category
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  required
                  disabled={categories.length === 0}
                >
                  {categories.length === 0 ? (
                    <option value="">No categories yet</option>
                  ) : (
                    categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <label>
                MRP
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={mrp}
                  onChange={(e) => setMrp(e.target.value)}
                  required
                />
              </label>

              <label>
                Cost price
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  required
                />
              </label>

              <label>
                Barcode
                <input
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="Optional"
                />
                <span className="field-hint">Leave blank to auto-generate</span>
              </label>

              <label>
                Initial stock
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={initialQty}
                  onChange={(e) => setInitialQty(e.target.value)}
                  required
                />
              </label>

              {createError ? (
                <p className="error" role="alert">
                  {createError}
                </p>
              ) : null}

              <button
                type="submit"
                className="primary"
                disabled={creating || categories.length === 0}
              >
                {creating ? 'Creating…' : 'Create product'}
              </button>
            </form>
          )}
        </section>
      ) : null}

      <section className="panel">
        <h2>Manage categories</h2>
        {categories.length === 0 ? (
          <p className="muted">No categories yet — add one below.</p>
        ) : (
          <ul className="category-list">
            {categories.map((cat) => (
              <li key={cat.id}>{cat.name}</li>
            ))}
          </ul>
        )}

        <form className="toolbar" onSubmit={handleAddCategory}>
          <label className="grow">
            New category
            <input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="e.g. School Uniforms"
              required
            />
          </label>
          <button type="submit" className="secondary" disabled={categoryBusy}>
            {categoryBusy ? 'Adding…' : 'Add Category'}
          </button>
        </form>
        {categoryError ? (
          <p className="error" role="alert">
            {categoryError}
          </p>
        ) : null}
        {categorySuccess ? (
          <p className="notice" role="status">
            {categorySuccess}
          </p>
        ) : null}
      </section>
    </main>
  )
}
