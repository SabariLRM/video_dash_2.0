/**
 * HUB 2.0 Mobile — Auth Store (Zustand with persistence)
 * Token stored in memory — for production use expo-secure-store.
 */
import { create } from 'zustand'
import api from '../api/client'

export const useAuthStore = create((set, get) => ({
  user:    null,
  token:   null,
  loading: true,

  setToken: (token) => set({ token }),

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

  logout: () => set({ user: null, token: null }),

  hydrate: async () => {
    try {
      const token = get().token
      if (!token) { set({ loading: false }); return }
      const { data } = await api.get('/auth/me')
      set({ user: data.user, loading: false })
    } catch {
      set({ user: null, token: null, loading: false })
    }
  },

  isAuthenticated: () => !!get().token,
}))
