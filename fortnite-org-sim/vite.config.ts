import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // strictPort keeps the address stable at 5180 so the desktop shortcut
  // always points at the right place instead of silently sliding to 5181.
  server: { port: 5180, strictPort: true },
})
