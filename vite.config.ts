import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy all /api/* calls to the Express backend
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      // Proxy Socket.io (HTTP upgrade → WebSocket)
      '/socket.io': {
        target: 'http://localhost:3002',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    include: ['chess.js']
  }
})
