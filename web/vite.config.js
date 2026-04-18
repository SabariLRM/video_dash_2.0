import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      // Proxy API calls to Express (avoids CORS in dev)
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      // Proxy HLS delivery to Nginx
      '/hls': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
