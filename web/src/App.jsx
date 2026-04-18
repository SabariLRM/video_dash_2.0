import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import Navbar from './components/Navbar'
import HomePage from './pages/HomePage'
import { LoginPage, RegisterPage } from './pages/AuthPage'
import WatchPage from './pages/WatchPage'
import UploadPage from './pages/UploadPage'
import PlayerPage from './pages/PlayerPage'
import MyVideosPage from './pages/MyVideosPage'

// Protected route wrapper
function Protected({ children }) {
  const { user, loading } = useAuthStore()
  if (loading) return <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  if (!user)   return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const hydrate = useAuthStore((s) => s.hydrate)

  // Restore session from existing HttpOnly cookie on page load
  useEffect(() => { hydrate() }, [hydrate])

  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/"           element={<HomePage />} />
        <Route path="/player"     element={<PlayerPage />} />
        <Route path="/login"      element={<LoginPage />} />
        <Route path="/register"   element={<RegisterPage />} />
        <Route path="/watch/:videoId" element={<WatchPage />} />
        <Route path="/upload" element={
          <Protected><UploadPage /></Protected>
        } />
        <Route path="/my-videos" element={
          <Protected><MyVideosPage /></Protected>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
