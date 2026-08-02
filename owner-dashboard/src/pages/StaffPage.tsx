import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { decodeTokenPayload, getApiErrorMessage } from '../api/auth'
import {
  ApiError,
  SESSION_EXPIRED_MESSAGE,
  clearStoredToken,
  getStoredToken,
  setLoginFlashMessage,
} from '../api/client'
import {
  deactivateUser,
  listUsers,
  registerStaff,
  type StaffRole,
  type StaffUser,
} from '../api/users'

const ROLE_OPTIONS: { value: StaffRole; label: string }[] = [
  { value: 'billing_staff', label: 'Billing staff' },
  { value: 'stock_staff', label: 'Stock staff' },
  { value: 'owner', label: 'Owner' },
]

function roleLabel(role: StaffRole): string {
  return ROLE_OPTIONS.find((opt) => opt.value === role)?.label ?? role
}

function currentUserId(): number | null {
  const token = getStoredToken()
  if (!token) {
    return null
  }
  const sub = decodeTokenPayload(token)?.sub
  if (!sub) {
    return null
  }
  const id = Number.parseInt(sub, 10)
  return Number.isFinite(id) ? id : null
}

export function StaffPage() {
  const navigate = useNavigate()
  const meId = currentUserId()
  const [users, setUsers] = useState<StaffUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<StaffRole>('billing_staff')
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)

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

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setUsers(await listUsers())
    } catch (err) {
      if (handleAuthError(err)) {
        return
      }
      setError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [handleAuthError])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  function handleLogout() {
    clearStoredToken()
    navigate('/login', { replace: true })
  }

  async function handleAddStaff(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    setFormSuccess(null)

    if (!name.trim() || !phone.trim() || password.length < 6) {
      setFormError('Name, phone, and password (min 6 chars) are required')
      return
    }

    setCreating(true)
    try {
      const created = await registerStaff({
        name: name.trim(),
        phone: phone.trim(),
        password,
        role,
      })
      setUsers((prev) => [...prev, created].sort((a, b) => a.id - b.id))
      setName('')
      setPhone('')
      setPassword('')
      setRole('billing_staff')
      setFormSuccess(`Added ${created.name} (${roleLabel(created.role)})`)
    } catch (err) {
      if (handleAuthError(err)) {
        return
      }
      setFormError(getApiErrorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  async function handleDeactivate(user: StaffUser) {
    if (user.id === meId) {
      setError('You cannot deactivate your own account')
      return
    }
    if (!user.is_active) {
      return
    }
    if (!window.confirm(`Deactivate ${user.name}? They will be signed out immediately.`)) {
      return
    }

    setBusyId(user.id)
    setError(null)
    try {
      const updated = await deactivateUser(user.id)
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
    } catch (err) {
      if (handleAuthError(err)) {
        return
      }
      setError(getApiErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className="dashboard staff-page">
      <header className="page-header">
        <div>
          <h1>Staff</h1>
          <p className="subtitle">Accounts and access</p>
        </div>
        <div className="header-actions">
          <Link className="secondary link-btn" to="/dashboard">
            Dashboard
          </Link>
          <Link className="secondary link-btn" to="/products">
            Products
          </Link>
          <Link className="secondary link-btn" to="/architecture">
            Architecture
          </Link>
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
        <h2>Team</h2>
        {loading ? (
          <p className="muted">Loading staff…</p>
        ) : users.length === 0 ? (
          <p className="muted">No users found.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table products-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isMe = user.id === meId
                  return (
                    <tr key={user.id} className={user.is_active ? undefined : 'row-inactive'}>
                      <td>
                        {user.name}
                        {isMe ? <span className="muted"> (you)</span> : null}
                      </td>
                      <td>{user.phone}</td>
                      <td>{roleLabel(user.role)}</td>
                      <td>{user.is_active ? 'Active' : 'Deactivated'}</td>
                      <td>
                        {user.is_active ? (
                          <button
                            type="button"
                            className="secondary"
                            disabled={isMe || busyId === user.id}
                            onClick={() => void handleDeactivate(user)}
                          >
                            {busyId === user.id ? 'Deactivating…' : 'Deactivate'}
                          </button>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Add staff</h2>
        <form className="product-form" onSubmit={handleAddStaff}>
          <label>
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label>
            Phone
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </label>
          <label>
            Role
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as StaffRole)}
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          {formError ? (
            <p className="error" role="alert">
              {formError}
            </p>
          ) : null}
          {formSuccess ? (
            <p className="notice" role="status">
              {formSuccess}
            </p>
          ) : null}

          <button type="submit" className="primary" disabled={creating}>
            {creating ? 'Creating…' : 'Add Staff'}
          </button>
        </form>
      </section>
    </main>
  )
}
