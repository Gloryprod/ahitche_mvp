// Rendu de l'accueil au build : le HTML de la page est prêt avant le JavaScript (titre affiché tout de suite sur
// mobile, aperçus WhatsApp et Facebook, moteurs de recherche). Utilisé par scripts/prerendre.mjs, jamais par le site.
// Le navigateur remplace ensuite ce HTML par l'application (main.ts), identique à l'écran.
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createRouter, createMemoryHistory } from 'vue-router'
import Toast from 'vue-toastification'
import { VueQueryPlugin } from '@tanstack/vue-query'
import App from './App.vue'
import { routes } from './router/routes'
import { donneesCommerce, donneesFaq } from './services/referencement'

export async function rendreAccueil(): Promise<string> {
  const app = createSSRApp(App)
  const router = createRouter({ history: createMemoryHistory(), routes })
  app.use(router)
  app.use(Toast)
  app.use(VueQueryPlugin)
  // Directives du navigateur (clavier, défilement) : sans effet sur le HTML de départ
  app.directive('onglets', {})
  app.directive('defilable', {})
  await router.push('/')
  await router.isReady()
  return renderToString(app)
}

// Données structurées de l'accueil, mêmes blocs (et mêmes id) que ceux ajoutés par la page dans le navigateur
export const donneesStructurees = () => [
  { id: 'donnees-commerce', donnees: donneesCommerce() },
  { id: 'donnees-faq', donnees: donneesFaq() },
]
