import { fileURLToPath, URL } from 'node:url'
import { copyFileSync } from 'node:fs'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueJsx(),
    vueDevTools(),
    tailwindcss(),
    // Vercel sert dist/404.html, avec le statut 404, pour toute adresse inconnue (voir vercel.json) : c'est la même
    // application, qui affiche la page « introuvable »
    {
      name: 'page-404',
      apply: 'build',
      closeBundle() {
        copyFileSync(fileURLToPath(new URL('./dist/index.html', import.meta.url)), fileURLToPath(new URL('./dist/404.html', import.meta.url)))
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
