/* Auth pages — Login & Register */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import './AuthPage.css'

function AuthForm({ mode }) {
  const navigate = useNavigate()
  const { login, register } = useAuthStore()

  const [form,   setForm]   = useState({ username: '', email: '', password: '' })
  const [error,  setError]  = useState(null)
  const [loading, setLoading] = useState(false)

  const isLogin = mode === 'login'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (isLogin) {
        await login(form.email, form.password)
      } else {
        await register(form.username, form.email, form.password)
      }
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card fade-in">
        {/* Header */}
        <div className="auth-header">
          <span className="auth-logo-icon">●</span>
          <h1 className="text-black font-extrabold text-4xl uppercase tracking-tighter">HUB 2.0</h1>
          <p className="text-secondary font-bold" style={{ marginTop: 4 }}>
            {isLogin ? 'WELCOME BACK' : 'CREATE YOUR ACCOUNT'}
          </p>
        </div>

        {error && (
          <div className="auth-error">
            <span>⚠</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          {!isLogin && (
            <div className="form-field">
              <label htmlFor="username" className="form-label">Username</label>
              <input
                id="username"
                type="text"
                className="input"
                placeholder="your_handle"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
              />
            </div>
          )}
          <div className="form-field">
            <label htmlFor="email" className="form-label">Email</label>
            <input
              id="email"
              type="email"
              className="input"
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="password" className="form-label">Password</label>
            <input
              id="password"
              type="password"
              className="input"
              placeholder={isLogin ? '••••••••' : 'Min. 8 characters'}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={8}
            />
          </div>

          <button
            id={isLogin ? 'btn-login' : 'btn-register'}
            type="submit"
            className="btn btn-primary auth-submit"
            disabled={loading}
          >
            {loading
              ? <><div className="spinner" style={{ width: 18, height: 18 }} /> Processing…</>
              : isLogin ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="auth-switch text-sm">
          {isLogin ? "Don't have an account? " : 'Already have an account? '}
          <Link to={isLogin ? '/register' : '/login'} className="auth-link">
            {isLogin ? 'Sign up' : 'Sign in'}
          </Link>
        </p>
      </div>
    </div>
  )
}

export function LoginPage()    { return <AuthForm mode="login" /> }
export function RegisterPage() { return <AuthForm mode="register" /> }
