import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/harvester': {
        target:
          process.env.VITE_HARVESTER_API ??
          'https://harvester-shiftwise-ai.apps-crc.testing',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/harvester/, ''),
      },
      '/api/analyzer': {
        target:
          process.env.VITE_ANALYZER_API ??
          'https://analyzer-shiftwise-ai.apps-crc.testing',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/analyzer/, ''),
      },
    },
  },
})
