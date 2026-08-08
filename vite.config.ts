import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isDevelopment = mode === 'development' || process.env.ENV === 'development'
  const harvesterApiUrl = env.HARVESTER_API_URL ?? 'http://harvester:8000'
  const analyzerApiUrl = env.ANALYZER_API_URL ?? 'http://analyzer:8080'

  return {
    plugins: [react()],
    define: {
      __DEVELOPMENT_MODE__: JSON.stringify(isDevelopment),
    },
    server: {
      proxy: {
        '/namespaces': {
          target: harvesterApiUrl,
          changeOrigin: true,
          secure: false,
        },
        '/collect': {
          target: harvesterApiUrl,
          changeOrigin: true,
          secure: false,
        },
        '/assessment/namespaces': {
          target: analyzerApiUrl,
          changeOrigin: true,
          secure: false,
        },
        '/assessment': {
          target: harvesterApiUrl,
          changeOrigin: true,
          secure: false,
        },
        '/run': {
          target: analyzerApiUrl,
          changeOrigin: true,
          secure: false,
        },
        '/status': {
          target: analyzerApiUrl,
          changeOrigin: true,
          secure: false,
        },
        '/reports': {
          target: analyzerApiUrl,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})
