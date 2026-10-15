// Mesure d'audience sans cookie (expliquée dans les Mentions légales) : le serveur ajoute 1 à un total du jour.
// Ni cookie, ni identifiant, ni adresse IP enregistrée : rien ne permet de suivre un visiteur.
import type { RouteLocationNormalized } from 'vue-router'

const API = import.meta.env.PROD ? 'https://api.ahitchebj.com' : ''

export function mesurer(evenement: 'visite' | 'clic_whatsapp', detail = '') {
  try {
    // Texte simple : envoi en arrière-plan sans requête préalable, même si la page se ferme (clic vers WhatsApp)
    const corps = new Blob([JSON.stringify({ evenement, detail: detail.slice(0, 80) })], { type: 'text/plain' })
    const url = `${API}/api/public/mesure`
    if (!navigator.sendBeacon?.(url, corps)) fetch(url, { method: 'POST', body: corps, keepalive: true }).catch(() => {})
  } catch {
    // La mesure ne gêne jamais la navigation
  }
}

// Pages publiques vues (les espaces connectés ne sont pas comptés)
export function mesurerVisite(to: RouteLocationNormalized, from: RouteLocationNormalized) {
  const premiereVue = from.matched.length === 0
  if (to.path.startsWith('/dashboard') || (!premiereVue && to.path === from.path)) return
  mesurer('visite', to.name === 'page-introuvable' ? 'page-introuvable' : to.path)
}

// Clics sur un lien WhatsApp, avec leur origine : data-mesure du lien, sinon la section de la page, le menu ou le pied
export function suivreClicsWhatsApp() {
  document.addEventListener('click', (e) => {
    const lien = (e.target as Element | null)?.closest?.('a[href*="wa.me/"]')
    if (!lien) return
    const origine = lien.getAttribute('data-mesure')
      || lien.closest('section[id]')?.id
      || (lien.closest('header, nav') ? 'menu' : lien.closest('footer') ? 'pied-de-page' : 'autre')
    mesurer('clic_whatsapp', `${location.pathname === '/' ? 'accueil' : location.pathname}:${origine}`)
  }, { capture: true })
}
