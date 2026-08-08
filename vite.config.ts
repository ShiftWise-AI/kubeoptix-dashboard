import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api/harvester': {
          target: env.HARVESTER_API_URL ?? 'http://harvester:8000',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/harvester/, ''),
        },
        '/api/analyzer': {
          target: env.ANALYZER_API_URL ?? 'http://analyzer:8080',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/analyzer/, ''),
        },
      },
    },
  }
})
