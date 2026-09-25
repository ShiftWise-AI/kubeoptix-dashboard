import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isDevelopment = mode === 'development' || process.env.ENV === 'development'
  const harvesterApiUrl = env.HARVESTER_API_URL ?? 'http://harvester:8000'
  const analyzerApiUrl = env.ANALYZER_API_URL ?? 'http://analyzer-api:8000'
  const reporterApiUrl = env.REPORTER_API_URL ?? 'https://reporter-shiftwise-ai.apps-crc.testing'
  const coreAiApiUrl = env.CORE_AI_API_URL ?? 'http://core-ai-api:8000'
  const settingsApiUrl = env.SETTINGS_API_URL ?? 'http://localhost:8000'

  return {
    plugins: [react(), tailwindcss()],
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
        '/assessment': {
          target: harvesterApiUrl,
          changeOrigin: true,
          secure: false,
        },
        '/api/analyzer': {
          target: analyzerApiUrl,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/analyzer/, ''),
        },
        '/api/reporter': {
          target: reporterApiUrl,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/reporter/, ''),
        },
        '/api/core-ai': {
          target: coreAiApiUrl,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/core-ai/, ''),
        },
        '/api/reports': {
          target: coreAiApiUrl,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/reports/, '/api/reports'),
        },
        '/api/settings': {
          target: settingsApiUrl,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/settings/, ''),
        },
      },
    },
  }
})
