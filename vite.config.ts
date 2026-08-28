import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** GitHub Pages base: /repo-name/ (project site) or / (user site *.github.io) */
function pagesBase(mode: string): string {
  if (mode !== 'ghpages') return '/'
  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1]
  if (repo?.endsWith('.github.io')) return '/'
  if (repo) return `/${repo}/`
  return '/Vifence/'
}

export default defineConfig(({ mode }) => ({
  base: pagesBase(mode),
  build: {
    outDir: mode === 'ghpages' ? 'docs' : 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Chỉ tách thư viện leaflet thuần — KHÔNG gom react-leaflet (tránh 2 bản React → màn hình đen).
          if (id.includes('node_modules/leaflet') && !id.includes('react-leaflet')) {
            return 'leaflet'
          }
          if (id.includes('/module05-productivity/personRoi/')) {
            return 'patrol-roi'
          }
          if (
            id.includes('/module05-productivity/pages/WorkerFaceScanPage')
            || id.includes('/module05-productivity/components/PatrolFaceScannerPanel')
            || id.includes('/module05-productivity/hooks/usePatrolAutoFaceScan')
            || id.includes('/module05-productivity/utils/patrolFaceCapture')
            || id.includes('/module02-training/services/faceDetection.service')
          ) {
            return 'face-scan'
          }
        },
      },
    },
  },
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
}))
