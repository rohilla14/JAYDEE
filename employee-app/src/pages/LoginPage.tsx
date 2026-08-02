import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { getApiErrorMessage, login } from '../api/auth'
import {
  LOGIN_FLASH_KEY,
  consumeLoginFlashMessage,
  getStoredToken,
} from '../api/client'

export function LoginPage() {
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [info] = useState(() => sessionStorage.getItem(LOGIN_FLASH_KEY))

  if (getStoredToken()) {
    return <Navigate to="/stock" replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(phone.trim(), password)
      consumeLoginFlashMessage()
      navigate('/stock', { replace: true })
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main>
      <h1>Shop Stock Check</h1>
      <p className="subtitle">Staff login</p>

      <form className="login-form" onSubmit={handleSubmit}>
        <label>
          Phone
          <input
            type="tel"
            name="phone"
            autoComplete="username"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {info ? (
          <p className="notice" role="status">
            {info}
          </p>
        ) : null}
        {error ? <p className="error" role="alert">{error}</p> : null}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
