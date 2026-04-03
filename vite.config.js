import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    proxy: {
      '/socket.io': { target: 'http://localhost:3200', ws: true },
      '/api': { target: 'http://localhost:3200' },
    },
  },
})
