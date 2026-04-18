/* Navbar Component */
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import './Navbar.css'

export default function Navbar() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <nav className="navbar">
      <div className="navbar-inner container">
        {/* Logo */}
        <Link to="/" className="navbar-logo">
          <span className="logo-icon">▶</span>
          <span className="gradient-text font-extrabold text-xl">HUB 2.0</span>
        </Link>

        {/* Search */}
        <div className="navbar-search">
          <input
            type="search"
            placeholder="Search videos..."
            className="input navbar-search-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter') navigate(`/?q=${encodeURIComponent(e.target.value)}`)
            }}
          />
        </div>

        {/* Nav links */}
        <div className="navbar-links">
          <Link to="/player" className="navbar-link">▶ Player</Link>
        </div>

        {/* Actions */}
        <div className="navbar-actions">
          {user ? (
            <>
              <Link to="/upload" className="btn btn-primary text-sm">
                <span>＋</span> Upload
              </Link>
              <Link to="/my-videos" className="navbar-avatar" title={`My Videos (${user.username || 'User'})`}>
                {(user.displayName || user.username || 'U').charAt(0).toUpperCase()}
              </Link>
              <button className="btn btn-ghost text-sm" onClick={handleLogout}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost text-sm">Sign in</Link>
              <Link to="/register" className="btn btn-primary text-sm">Get started</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
