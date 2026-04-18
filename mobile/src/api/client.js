/**
 * HUB 2.0 Mobile — Axios API Client
 * Points to the local Express API (or production host via env).
 * Credentials are sent via Authorization header (mobile can't use HttpOnly cookies).
 */
import axios from 'axios'
import { useAuthStore } from '../store/authStore'

// For local dev — change to your machine's LAN IP if testing on a real device
// e.g. 'http://192.168.1.100:4000/api' for physical device over WiFi
const BASE_URL = __DEV__
  ? 'http://localhost:4000/api'
  : 'https://your-production-domain.com/api'

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout()
    }
    return Promise.reject(err)
  }
)

export default api
