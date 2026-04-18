/**
 * HUB 2.0 — Auth Store (Zustand)
 * Persists user info in memory; JWT lives in HttpOnly cookie.
 */
import { create } from 'zustand'
import api from '../api/client'

export const useAuthStore = create((set, get) => ({
  user: null,
  token: null,
  loading: true,

  // Try to fetch current user on app load (uses existing HttpOnly cookie)
  hydrate: async () => {
    try {
      const { data } = await api.get('/auth/me')
      set({ user: data.user, loading: false })
    } catch {
      set({ user: null, token: null, loading: false })
    }
  },

  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password })
    set({ user: data.user, token: data.token })
    return data
  },

  register: async (username, email, password) => {
    const { data } = await api.post('/auth/register', { username, email, password })
    set({ user: data.user, token: data.token })
    return data
  },

  logout: async () => {
    try { await api.post('/auth/logout') } catch { /* ignore */ }
    set({ user: null, token: null })
  },

  isAuthenticated: () => !!get().user,
}))
