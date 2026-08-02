import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { getApiErrorMessage } from '../api/auth'
import {
  ApiError,
  SESSION_EXPIRED_MESSAGE,
  clearStoredToken,
  setLoginFlashMessage,
} from '../api/client'
import {
  adjustProductStock,
  getProductByBarcode,
  type ProductWithInventory,
} from '../api/products'
import {
  BarcodeScanner,
  isBarcodeDetectorSupported,
} from '../components/BarcodeScanner'

type ViewState =
  | { kind: 'idle' }
  | { kind: 'scanning' }
  | { kind: 'loading'; barcode: string }
  | { kind: 'found'; product: ProductWithInventory; barcode: string }
  | { kind: 'not_found'; barcode: string }
  | { kind: 'error'; message: string }

export function StockPage() {
  const navigate = useNavigate()
  const cameraSupported = isBarcodeDetectorSupported()
  const [manualBarcode, setManualBarcode] = useState('')
  const [view, setView] = useState<ViewState>({ kind: 'idle' })
  const [customDelta, setCustomDelta] = useState('1')
  const [adjusting, setAdjusting] = useState(false)
  const adjustingRef = useRef(false)
  const [adjustError, setAdjustError] = useState<string | null>(null)
  const [adjustSuccess, setAdjustSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!adjustSuccess) {
      return
    }
    const timer = window.setTimeout(() => setAdjustSuccess(null), 2500)
    return () => window.clearTimeout(timer)
  }, [adjustSuccess])

  const redirectSessionExpired = useCallback(() => {
    clearStoredToken()
    setLoginFlashMessage(SESSION_EXPIRED_MESSAGE)
    navigate('/login', { replace: true })
  }, [navigate])

  const lookupBarcode = useCallback(
    async (raw: string) => {
      const barcode = raw.trim()
      if (!barcode) {
        setView({ kind: 'error', message: 'Enter a barcode first' })
        return
      }

      setAdjustError(null)
      setAdjustSuccess(null)
      setView({ kind: 'loading', barcode })
      try {
        const product = await getProductByBarcode(barcode)
        setView({ kind: 'found', product, barcode })
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          redirectSessionExpired()
          return
        }
        if (err instanceof ApiError && err.status === 404) {
          setView({ kind: 'not_found', barcode })
          return
        }
        setView({ kind: 'error', message: getApiErrorMessage(err) })
      }
    },
    [redirectSessionExpired],
  )

  function handleLogout() {
    clearStoredToken()
    navigate('/login', { replace: true })
  }

  function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void lookupBarcode(manualBarcode)
  }

  function resetToScan() {
    setManualBarcode('')
    setCustomDelta('1')
    setAdjustError(null)
    setAdjustSuccess(null)
    setView({ kind: 'idle' })
  }

  async function applyDelta(delta: number) {
    if (view.kind !== 'found' || adjustingRef.current) {
      return
    }
    if (!Number.isInteger(delta) || delta === 0) {
      setAdjustError('Enter a non-zero whole number to adjust')
      setAdjustSuccess(null)
      return
    }

    adjustingRef.current = true
    setAdjusting(true)
    setAdjustError(null)
    setAdjustSuccess(null)

    try {
      const updated = await adjustProductStock(view.product.id, delta)
      setView({ kind: 'found', product: updated, barcode: view.barcode })
      const sign = delta > 0 ? '+' : ''
      setAdjustSuccess(
        `Stock updated (${sign}${delta}). Now ${updated.inventory?.quantity ?? '—'}`,
      )
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        redirectSessionExpired()
        return
      }
      setAdjustError(getApiErrorMessage(err))
    } finally {
      adjustingRef.current = false
      setAdjusting(false)
    }
  }

  function handleCustomAdjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const delta = Number.parseInt(customDelta, 10)
    if (Number.isNaN(delta)) {
      setAdjustError('Enter a valid whole number (positive or negative)')
      setAdjustSuccess(null)
      return
    }
    void applyDelta(delta)
  }

  const onDetected = useCallback(
    (barcode: string) => {
      void lookupBarcode(barcode)
    },
    [lookupBarcode],
  )

  const onScanError = useCallback((message: string) => {
    setView({ kind: 'error', message })
  }, [])

  return (
    <main className="stock-page">
      <header className="stock-header">
        <div>
          <h1>Stock check</h1>
          <p className="subtitle">Scan or type a barcode</p>
        </div>
        <button type="button" className="secondary" onClick={handleLogout}>
          Log out
        </button>
      </header>

      {view.kind === 'idle' || view.kind === 'error' ? (
        <section className="stock-entry">
          {cameraSupported ? (
            <button
              type="button"
              className="primary"
              onClick={() => setView({ kind: 'scanning' })}
            >
              Scan Barcode
            </button>
          ) : (
            <p className="notice" role="status">
              Camera scanning not supported on this device — enter barcode
              manually
            </p>
          )}

          <form className="manual-form" onSubmit={handleManualSubmit}>
            <label>
              Barcode
              <input
                type="text"
                name="barcode"
                inputMode="numeric"
                autoComplete="off"
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value)}
                placeholder="Enter barcode"
                required
              />
            </label>
            <button type="submit" className="primary">
              Look up
            </button>
          </form>

          {view.kind === 'error' ? (
            <p className="error" role="alert">
              {view.message}
            </p>
          ) : null}
        </section>
      ) : null}

      {view.kind === 'scanning' ? (
        <BarcodeScanner
          onDetected={onDetected}
          onCancel={() => setView({ kind: 'idle' })}
          onError={onScanError}
        />
      ) : null}

      {view.kind === 'loading' ? (
        <p className="subtitle">Looking up {view.barcode}…</p>
      ) : null}

      {view.kind === 'found' ? (
        <section className="product-result">
          <h2>{view.product.name}</h2>
          <p className="muted">Barcode: {view.barcode}</p>
          {view.product.inventory ? (
            <>
              <dl className="stock-stats">
                <div>
                  <dt>Current stock</dt>
                  <dd>{view.product.inventory.quantity}</dd>
                </div>
                <div>
                  <dt>Reorder threshold</dt>
                  <dd>{view.product.inventory.reorder_threshold}</dd>
                </div>
              </dl>
              {view.product.inventory.quantity <=
              view.product.inventory.reorder_threshold ? (
                <p className="low-stock-badge" role="status">
                  Low stock
                </p>
              ) : null}

              <div className="stock-adjust">
                <p className="adjust-label">Adjust stock</p>
                <div className="adjust-row">
                  <button
                    type="button"
                    className="secondary adjust-btn"
                    disabled={adjusting}
                    onClick={() => void applyDelta(-1)}
                    aria-label="Decrease stock by 1"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    className="secondary adjust-btn"
                    disabled={adjusting}
                    onClick={() => void applyDelta(1)}
                    aria-label="Increase stock by 1"
                  >
                    +
                  </button>
                </div>

                <form className="custom-delta-form" onSubmit={handleCustomAdjust}>
                  <label>
                    Custom amount (+/−)
                    <input
                      type="number"
                      name="delta"
                      step={1}
                      value={customDelta}
                      disabled={adjusting}
                      onChange={(e) => setCustomDelta(e.target.value)}
                    />
                  </label>
                  <button type="submit" className="primary" disabled={adjusting}>
                    {adjusting ? 'Updating…' : 'Apply'}
                  </button>
                </form>

                {adjusting ? (
                  <p className="subtitle" role="status">
                    Saving stock change…
                  </p>
                ) : null}
                {adjustSuccess ? (
                  <p className="success" role="status">
                    {adjustSuccess}
                  </p>
                ) : null}
                {adjustError ? (
                  <p className="error" role="alert">
                    {adjustError}
                  </p>
                ) : null}
              </div>
            </>
          ) : (
            <p className="error">No inventory record for this product</p>
          )}
          <button
            type="button"
            className="primary"
            onClick={resetToScan}
            disabled={adjusting}
          >
            Scan again
          </button>
        </section>
      ) : null}

      {view.kind === 'not_found' ? (
        <section className="product-result">
          <h2>Item not found</h2>
          <p className="muted">
            Scanned code: <strong>{view.barcode}</strong>
          </p>
          <button type="button" className="primary" onClick={resetToScan}>
            Scan again
          </button>
        </section>
      ) : null}
    </main>
  )
}
