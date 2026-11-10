import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // relative paths so the build runs from any folder or host (e.g. a shared link)
  base: './',
  plugins: [react(), tailwindcss()],
  server: { host: true, port: 5173 },
  build: {
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('rapier')) return 'physics'
          if (id.includes('three') || id.includes('@react-three')) return 'three'
        },
      },
    },
  },
})
