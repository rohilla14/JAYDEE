import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getApiErrorMessage } from '../api/auth'
import {
  ApiError,
  SESSION_EXPIRED_MESSAGE,
  clearStoredToken,
  setLoginFlashMessage,
} from '../api/client'
import {
  getDailySales,
  getLowStock,
  getTopProducts,
  type DailySalesReport,
  type LowStockItem,
  type TopProductItem,
} from '../api/reports'

export function DashboardPage() {
  const navigate = useNavigate()
  const [daily, setDaily] = useState<DailySalesReport | null>(null)
  const [lowStock, setLowStock] = useState<LowStockItem[]>([])
  const [topProducts, setTopProducts] = useState<TopProductItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null)

  const redirectSessionExpired = useCallback(
    (message = SESSION_EXPIRED_MESSAGE) => {
      clearStoredToken()
      setLoginFlashMessage(message)
      navigate('/login', { replace: true })
    },
    [navigate],
  )

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [sales, stock, top] = await Promise.all([
        getDailySales(),
        getLowStock(),
        getTopProducts(7),
      ])
      setDaily(sales)
      setLowStock(stock)
      setTopProducts(top)
      setLastRefreshed(new Date().toLocaleString())
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        redirectSessionExpired()
        return
      }
      if (err instanceof ApiError && err.status === 403) {
        redirectSessionExpired('Owner access only — please log in with an owner account')
        return
      }
      setError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [redirectSessionExpired])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  function handleLogout() {
    clearStoredToken()
    navigate('/login', { replace: true })
  }

  const maxQty = Math.max(...topProducts.map((p) => p.total_quantity_sold), 1)
  const hasZeroSales =
    daily !== null &&
    daily.total_bills === 0 &&
    Number.parseFloat(daily.total_revenue) === 0

  return (
    <main className="dashboard">
      <header className="page-header">
        <div>
          <h1>Owner dashboard</h1>
          <p className="subtitle">
            {lastRefreshed ? `Last refreshed ${lastRefreshed}` : 'Shop overview'}
          </p>
        </div>
        <div className="header-actions">
          <Link className="secondary link-btn" to="/products">
            Products
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
            disabled={loading}
            onClick={() => void loadDashboard()}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
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
        <h2>Today&apos;s sales</h2>
        {loading && !daily ? (
          <p className="muted">Loading…</p>
        ) : daily ? (
          <div className="stat-grid">
            <div className="stat-card">
              <span className="stat-label">Revenue</span>
              <strong className="stat-value">₹{daily.total_revenue}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Bills</span>
              <strong className="stat-value">{daily.total_bills}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Items sold</span>
              <strong className="stat-value">{daily.total_items_sold}</strong>
            </div>
            <p className="muted">
              Date: {daily.date}
              {hasZeroSales ? ' · No sales recorded yet today.' : ''}
            </p>
          </div>
        ) : (
          <p className="muted">Sales summary unavailable.</p>
        )}
      </section>

      <section className="panel">
        <h2>Low stock alerts</h2>
        {loading && lastRefreshed === null ? (
          <p className="muted">Loading…</p>
        ) : lowStock.length === 0 ? (
          <p className="muted">No products at or below reorder threshold.</p>
        ) : (
          <ul className="alert-list">
            {lowStock.map((item) => {
              const critical = item.quantity === 0
              return (
                <li
                  key={item.product_id}
                  className={critical ? 'alert-critical' : 'alert-warn'}
                >
                  <div>
                    <strong>{item.name}</strong>
                    <span className="muted">
                      {' '}
                      {item.barcode ? `(${item.barcode})` : ''}
                    </span>
                  </div>
                  <div>
                    Qty <strong>{item.quantity}</strong> / threshold{' '}
                    {item.reorder_threshold}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>Top products (7 days)</h2>
        {loading && lastRefreshed === null ? (
          <p className="muted">Loading…</p>
        ) : topProducts.length === 0 ? (
          <p className="muted">No sales in this window yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Qty sold</th>
                <th>Revenue</th>
                <th aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {topProducts.map((item) => (
                <tr key={item.product_id}>
                  <td>{item.name}</td>
                  <td>{item.total_quantity_sold}</td>
                  <td>₹{item.total_revenue}</td>
                  <td className="bar-cell">
                    <div
                      className="bar"
                      style={{
                        width: `${(item.total_quantity_sold / maxQty) * 100}%`,
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  )
}
