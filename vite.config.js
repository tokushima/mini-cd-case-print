import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // GitHub Pages のサブパス配信に対応（相対パスでアセット解決）
  base: './',
  plugins: [react()],
})
