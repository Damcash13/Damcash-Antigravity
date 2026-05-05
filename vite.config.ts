import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('agora-rtc-sdk-ng') || id.includes('@agora-js')) return 'agora';
          if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) return 'react-vendor';
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('socket.io-client') || id.includes('engine.io-client')) return 'socket';
          if (id.includes('i18next') || id.includes('react-i18next')) return 'i18n';
          if (id.includes('chess.js')) return 'chess-engine';
        },
      },
    },
  },
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
