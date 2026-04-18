/**
 * HUB 2.0 — Axios API Client
 * Centralised HTTP client. JWT lives in HttpOnly cookie (auto-sent).
 */
import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 30_000,
})

// Handle 401 globally — redirect to /login without circular imports
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && window.location.pathname !== '/login') {
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
