// Rendu du haut de l'accueil au build (menu et titre principal) : affiché dès l'arrivée du HTML, avant le
// JavaScript, sur les téléphones lents. Utilisé par scripts/prerendre.mjs, jamais par le site.
// Seul le haut de page est rendu : le navigateur remplace ensuite ce HTML par l'application complète (main.ts),
// et remplacer une petite partie coûte peu sur un téléphone d'entrée de gamme (la page entière coûtait plus qu'elle
// ne rapportait). Les moteurs de recherche lisent le reste de la page avec le JavaScript, et les données
// structurées sont, elles, écrites en entier dans le HTML.
import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createRouter, createMemoryHistory } from 'vue-router'
import Toast from 'vue-toastification'
import { VueQueryPlugin } from '@tanstack/vue-query'
import NavBar from './components/layout/NavBar.vue'
import HeroSection from './components/sections/HeroSection.vue'
import { routes } from './router/routes'
import { donneesCommerce, donneesFaq } from './services/referencement'

// Même structure que App.vue et HomeView.vue autour du titre : rien ne bouge quand l'application prend le relais
const HautDeLAccueil = defineComponent({
  render: () => h('div', { class: 'min-h-screen flex flex-col' }, [
    h(NavBar),
    h('main', { id: 'contenu', class: 'grow' }, [h('div', [h(HeroSection)])]),
  ]),
})

export async function rendreAccueil(): Promise<string> {
  const app = createSSRApp(HautDeLAccueil)
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
