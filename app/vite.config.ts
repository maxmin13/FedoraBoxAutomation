import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  // Tell Vite where the HTML entry point lives
  root: 'src',

  build: {
    // Output the built files to electron-gui/dist
    outDir: '../dist',
    emptyOutDir: true,
  },

  server: {
    // Vite dev server port — main.js points Electron here during development
    port: 5173,
  },
})
