// Build du rendu de l'accueil (voir src/entry-prerendu.ts et scripts/prerendre.mjs), lancé après le build du site.
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), vueJsx(), tailwindcss()],
  resolve: {
    alias: [
      // Avant « @ » : le routeur du navigateur est remplacé pendant ce rendu
      { find: /^@\/router$/, replacement: fileURLToPath(new URL('./src/prerendu/routeur-inerte.ts', import.meta.url)) },
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
    ],
  },
  ssr: { noExternal: ['vue-toastification'] },
  build: {
    ssr: 'src/entry-prerendu.ts',
    outDir: 'dist-prerendu',
    emptyOutDir: true,
    copyPublicDir: false,
  },
})
