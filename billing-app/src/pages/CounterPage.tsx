import { useCallback, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { getApiErrorMessage } from '../api/auth'
import { createBill, type BillRead } from '../api/bills'
import {
  ApiError,
  SESSION_EXPIRED_MESSAGE,
  clearStoredToken,
  setLoginFlashMessage,
} from '../api/client'
import { getCustomerByPhone, createCustomer, type Customer } from '../api/customers'
import { getProductByBarcode } from '../api/products'
import {
  BarcodeScanner,
  isBarcodeDetectorSupported,
} from '../components/BarcodeScanner'

export type CartLine = {
  productId: number
  barcode: string
  name: string
  mrp: string
  unitPrice: string
  quantity: number
  availableStock: number
}

const TIER_DISCOUNTS: Record<Customer['tier'], number> = {
  bronze: 0.03,
  silver: 0.05,
  gold: 0.07,
}

function moneyToCents(value: string): number {
  return Math.round(Number.parseFloat(value) * 100)
}

function formatMoney(cents: number): string {
  return (cents / 100).toFixed(2)
}

function unitPriceForTier(mrp: string, tier: Customer['tier'] | null): string {
  if (!tier) {
    return Number.parseFloat(mrp).toFixed(2)
  }
  const discounted = Number.parseFloat(mrp) * (1 - TIER_DISCOUNTS[tier])
  return discounted.toFixed(2)
}

function repriceCart(cart: CartLine[], tier: Customer['tier'] | null): CartLine[] {
  return cart.map((line) => ({
    ...line,
    unitPrice: unitPriceForTier(line.mrp, tier),
  }))
}

export function CounterPage() {
  const navigate = useNavigate()
  const cameraSupported = isBarcodeDetectorSupported()
  const [scanning, setScanning] = useState(false)
  const [manualBarcode, setManualBarcode] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [lookupBusy, setLookupBusy] = useState(false)
  const [customerPhone, setCustomerPhone] = useState('')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [customerBusy, setCustomerBusy] = useState(false)
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const checkoutBusyRef = useRef(false)
  const [receipt, setReceipt] = useState<BillRead | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runningTotalCents = useMemo(
    () =>
      cart.reduce(
        (sum, line) => sum + moneyToCents(line.unitPrice) * line.quantity,
        0,
      ),
    [cart],
  )

  const redirectSessionExpired = useCallback(() => {
    clearStoredToken()
    setLoginFlashMessage(SESSION_EXPIRED_MESSAGE)
    navigate('/login', { replace: true })
  }, [navigate])

  function handleLogout() {
    clearStoredToken()
    navigate('/login', { replace: true })
  }

  const addProductToCart = useCallback(
    (product: Awaited<ReturnType<typeof getProductByBarcode>>) => {
      if (!product.inventory) {
        setWarning(null)
        setError(`No inventory record for ${product.name}`)
        return
      }

      const available = product.inventory.quantity
      const barcode = product.barcode ?? String(product.id)
      const tier = customer?.tier ?? null

      setCart((prev) => {
        const existing = prev.find((line) => line.productId === product.id)
        const nextQty = (existing?.quantity ?? 0) + 1

        if (nextQty > available) {
          setError(null)
          setWarning(
            `Cannot add ${product.name}: only ${available} in stock` +
              (existing ? ` (already ${existing.quantity} in cart)` : ''),
          )
          return prev
        }

        setWarning(null)
        setError(null)

        if (existing) {
          return prev.map((line) =>
            line.productId === product.id
              ? { ...line, quantity: nextQty, availableStock: available }
              : line,
          )
        }

        return [
          ...prev,
          {
            productId: product.id,
            barcode,
            name: product.name,
            mrp: product.mrp,
            unitPrice: unitPriceForTier(product.mrp, tier),
            quantity: 1,
            availableStock: available,
          },
        ]
      })
    },
    [customer],
  )

  const lookupBarcode = useCallback(
    async (raw: string) => {
      const barcode = raw.trim()
      if (!barcode) {
        setError('Enter a barcode first')
        return
      }

      setLookupBusy(true)
      setError(null)
      setScanning(false)
      try {
        const product = await getProductByBarcode(barcode)
        addProductToCart(product)
        setManualBarcode('')
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setWarning(null)
          setError(`Item not found: ${barcode}`)
        } else if (err instanceof ApiError && err.status === 401) {
          redirectSessionExpired()
        } else {
          setWarning(null)
          setError(getApiErrorMessage(err))
        }
      } finally {
        setLookupBusy(false)
      }
    },
    [addProductToCart, redirectSessionExpired],
  )

  const onDetected = useCallback(
    (barcode: string) => {
      void lookupBarcode(barcode)
    },
    [lookupBarcode],
  )

  const onScanError = useCallback((message: string) => {
    setScanning(false)
    setError(message)
  }, [])

  function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void lookupBarcode(manualBarcode)
  }

  async function handleCustomerLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const phone = customerPhone.trim()
    if (!phone) {
      setError('Enter a customer phone number')
      return
    }

    setCustomerBusy(true)
    setError(null)
    setShowNewCustomerForm(false)
    try {
      const found = await getCustomerByPhone(phone)
      setCustomer(found)
      setCart((prev) => repriceCart(prev, found.tier))
      setWarning(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        redirectSessionExpired()
        return
      }
      if (err instanceof ApiError && err.status === 404) {
        setCustomer(null)
        setShowNewCustomerForm(true)
        setError(null)
        setWarning(`No customer for ${phone} — create one below, or clear and continue as walk-in`)
      } else {
        setError(getApiErrorMessage(err))
      }
    } finally {
      setCustomerBusy(false)
    }
  }

  async function handleCreateCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const phone = customerPhone.trim()
    const name = newCustomerName.trim()
    if (!phone || !name) {
      setError('Name and phone are required')
      return
    }

    setCustomerBusy(true)
    setError(null)
    try {
      const created = await createCustomer({ name, phone })
      setCustomer(created)
      setCart((prev) => repriceCart(prev, created.tier))
      setShowNewCustomerForm(false)
      setNewCustomerName('')
      setWarning(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        redirectSessionExpired()
        return
      }
      setError(getApiErrorMessage(err))
    } finally {
      setCustomerBusy(false)
    }
  }

  function clearCustomer() {
    setCustomer(null)
    setShowNewCustomerForm(false)
    setNewCustomerName('')
    setCart((prev) => repriceCart(prev, null))
  }

  function removeLine(productId: number) {
    setCart((prev) => prev.filter((line) => line.productId !== productId))
    setWarning(null)
  }

  function setLineQuantity(productId: number, quantity: number) {
    setCart((prev) => {
      const line = prev.find((item) => item.productId === productId)
      if (!line) {
        return prev
      }

      if (!Number.isInteger(quantity) || quantity < 1) {
        setError('Quantity must be a whole number of at least 1')
        setWarning(null)
        return prev
      }

      if (quantity > line.availableStock) {
        setWarning(
          `Cannot set ${line.name} to ${quantity}: only ${line.availableStock} in stock`,
        )
        setError(null)
        return prev
      }

      setWarning(null)
      setError(null)
      return prev.map((item) =>
        item.productId === productId ? { ...item, quantity } : item,
      )
    })
  }

  async function handleCompleteSale() {
    if (cart.length === 0 || checkoutBusyRef.current) {
      if (cart.length === 0) {
        setError('Cart is empty')
      }
      return
    }

    checkoutBusyRef.current = true
    setCheckoutBusy(true)
    setError(null)
    setWarning(null)
    try {
      const bill = await createBill({
        customer_id: customer?.id ?? null,
        items: cart.map((line) => ({
          product_id: line.productId,
          quantity: line.quantity,
        })),
      })
      setReceipt(bill)
      setCart([])
      setWarning(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        redirectSessionExpired()
        return
      }
      // Keep cart on failure so cashier can retry / fix stock.
      setError(getApiErrorMessage(err))
    } finally {
      checkoutBusyRef.current = false
      setCheckoutBusy(false)
    }
  }

  function startNewSale() {
    setReceipt(null)
    setCart([])
    setCustomer(null)
    setCustomerPhone('')
    setShowNewCustomerForm(false)
    setNewCustomerName('')
    setWarning(null)
    setError(null)
    setManualBarcode('')
  }

  if (receipt) {
    return (
      <main className="counter-page">
        <header className="page-header">
          <div>
            <h1>Sale complete</h1>
            <p className="subtitle">Receipt #{receipt.id}</p>
          </div>
          <button type="button" className="secondary" onClick={handleLogout}>
            Log out
          </button>
        </header>

        <section className="receipt" data-testid="receipt">
          <ul className="cart-lines">
            {receipt.items.map((item) => (
              <li key={`${item.product_id}-${item.quantity}`} className="cart-line">
                <div className="cart-line-main">
                  <strong data-testid="receipt-item-name">{item.product_name}</strong>
                  <span className="muted">
                    ₹<span data-testid="receipt-unit-price">{item.unit_price}</span> ×{' '}
                    {item.quantity} = ₹{item.line_total}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <p>
            Total:{' '}
            <strong data-testid="receipt-total">₹{receipt.total_amount}</strong>
          </p>
          <p>
            Discount: ₹{receipt.discount_amount}
          </p>
          <p>
            Tier applied:{' '}
            <strong data-testid="receipt-tier">
              {receipt.customer_tier_applied ?? 'walk-in (MRP)'}
            </strong>
          </p>
          <p>
            Points earned:{' '}
            <strong data-testid="receipt-points">{receipt.points_earned}</strong>
          </p>
          <button type="button" className="primary" onClick={startNewSale}>
            New sale
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="counter-page">
      <header className="page-header">
        <div>
          <h1>Counter</h1>
          <p className="subtitle">Scan items into the cart</p>
        </div>
        <button type="button" className="secondary" onClick={handleLogout}>
          Log out
        </button>
      </header>

      {scanning ? (
        <BarcodeScanner
          onDetected={onDetected}
          onCancel={() => setScanning(false)}
          onError={onScanError}
        />
      ) : (
        <section className="scan-panel">
          {cameraSupported ? (
            <button
              type="button"
              className="primary"
              disabled={lookupBusy || checkoutBusy}
              onClick={() => {
                setError(null)
                setScanning(true)
              }}
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
                disabled={lookupBusy || checkoutBusy}
                onChange={(e) => setManualBarcode(e.target.value)}
                placeholder="Enter barcode"
                required
              />
            </label>
            <button
              type="submit"
              className="primary"
              disabled={lookupBusy || checkoutBusy}
            >
              {lookupBusy ? 'Looking up…' : 'Add to cart'}
            </button>
          </form>
        </section>
      )}

      <section className="customer-panel">
        <h2>Customer (optional)</h2>
        {customer ? (
          <div className="customer-card" data-testid="customer-card">
            <p>
              <strong>{customer.name}</strong> ({customer.phone})
            </p>
            <p>
              Tier:{' '}
              <strong data-testid="customer-tier">{customer.tier}</strong>
              {' '}
              <span className="muted">
                (
                {customer.tier === 'bronze'
                  ? '3%'
                  : customer.tier === 'silver'
                    ? '5%'
                    : '7%'}{' '}
                off MRP)
              </span>
            </p>
            <p className="muted">
              Points: {customer.points_balance} · Lifetime ₹
              {customer.lifetime_spend}
            </p>
            <button type="button" className="secondary" onClick={clearCustomer}>
              Clear customer
            </button>
          </div>
        ) : (
          <>
            <form className="manual-form" onSubmit={handleCustomerLookup}>
              <label>
                Phone
                <input
                  type="tel"
                  name="customerPhone"
                  value={customerPhone}
                  disabled={customerBusy || checkoutBusy}
                  onChange={(e) => {
                    setCustomerPhone(e.target.value)
                    setShowNewCustomerForm(false)
                  }}
                  placeholder="e.g. 9888777666"
                  required
                />
              </label>
              <button
                type="submit"
                className="secondary"
                disabled={customerBusy || checkoutBusy}
              >
                {customerBusy ? 'Looking up…' : 'Look up customer'}
              </button>
            </form>

            {showNewCustomerForm ? (
              <form
                className="manual-form new-customer-form"
                onSubmit={handleCreateCustomer}
                data-testid="new-customer-form"
              >
                <p className="notice">New customer</p>
                <label>
                  Name
                  <input
                    type="text"
                    name="newCustomerName"
                    value={newCustomerName}
                    disabled={customerBusy || checkoutBusy}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Phone
                  <input
                    type="tel"
                    name="newCustomerPhone"
                    value={customerPhone}
                    disabled
                  />
                </label>
                <button
                  type="submit"
                  className="primary"
                  disabled={customerBusy || checkoutBusy}
                >
                  {customerBusy ? 'Creating…' : 'Create & attach customer'}
                </button>
              </form>
            ) : null}
          </>
        )}
      </section>

      {warning ? (
        <p className="warning" role="alert" data-testid="cart-warning">
          {warning}
        </p>
      ) : null}
      {error ? (
        <p className="error" role="alert" data-testid="cart-error">
          {error}
        </p>
      ) : null}

      <section className="cart">
        <h2>Cart</h2>
        {cart.length === 0 ? (
          <p className="muted">No items yet — scan or enter a barcode.</p>
        ) : (
          <ul className="cart-lines">
            {cart.map((line) => (
              <li key={line.productId} className="cart-line">
                <div className="cart-line-main">
                  <strong>{line.name}</strong>
                  <span className="muted">
                    ₹{line.unitPrice} × {line.quantity} = ₹
                    {formatMoney(moneyToCents(line.unitPrice) * line.quantity)}
                  </span>
                </div>
                <div className="cart-line-actions">
                  <label>
                    Qty
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={line.quantity}
                      disabled={checkoutBusy}
                      onChange={(e) => {
                        const next = Number.parseInt(e.target.value, 10)
                        if (!Number.isNaN(next)) {
                          setLineQuantity(line.productId, next)
                        }
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary"
                    disabled={checkoutBusy}
                    onClick={() => removeLine(line.productId)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="cart-total">
          Running total: <strong>₹{formatMoney(runningTotalCents)}</strong>
        </p>

        <button
          type="button"
          className="primary"
          data-testid="complete-sale"
          disabled={cart.length === 0 || checkoutBusy}
          onClick={() => void handleCompleteSale()}
        >
          {checkoutBusy ? 'Completing sale…' : 'Complete Sale'}
        </button>
      </section>
    </main>
  )
}
