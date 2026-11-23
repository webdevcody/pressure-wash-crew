import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative asset paths so the build works under GitHub Pages'
  // /pressure-wash-crew/ subpath (and anywhere else it's hosted).
  base: './',
  plugins: [react()],
})
