import type { Directive } from 'vue'

// Zone qui défile horizontalement (tableau, carrousel) : atteignable au clavier quand son contenu dépasse,
// pour la faire défiler avec les flèches ; nommée pour les lecteurs d'écran. Usage : v-defilable="'Lignes budgétaires'"
// Performance : un seul ResizeObserver pour toute la page ; les mesures se font après la mise en page,
// toutes les lectures d'abord puis les écritures, et seulement quand l'état change (pas de recalcul en cascade).

const zones = new Map<Element, HTMLElement>() // Élément observé (zone ou son contenu) -> zone défilante

function appliquer(liste: HTMLElement[]) {
  const etats = liste.map(el => [el, el.scrollWidth > el.clientWidth + 1] as const) // Lectures
  for (const [el, defile] of etats) { // Écritures, seulement si l'état change
    if (defile && el.getAttribute('tabindex') !== '0') el.setAttribute('tabindex', '0')
    else if (!defile && el.hasAttribute('tabindex')) el.removeAttribute('tabindex')
  }
}

let observateur: ResizeObserver | null = null
const observer = () => (observateur ??= new ResizeObserver(entrees => {
  appliquer([...new Set(entrees.map(e => zones.get(e.target)).filter((z): z is HTMLElement => !!z))])
}))

let enAttente = new Set<HTMLElement>()
function prevoirMesure(el: HTMLElement) {
  if (!enAttente.size) requestAnimationFrame(() => { const liste = [...enAttente]; enAttente = new Set(); appliquer(liste) })
  enAttente.add(el)
}

export const vDefilable: Directive<HTMLElement, string | undefined> = {
  mounted(el, { value }) {
    el.dataset.defilable = ''
    if (value) el.setAttribute('aria-label', value)
    // Un <div> devient une région nommée ; une liste garde sa nature de liste
    if (el.tagName === 'DIV' && !el.getAttribute('role')) el.setAttribute('role', 'region')
    zones.set(el, el)
    observer().observe(el) // Premier rappel après la première mise en page : mesure initiale
    if (el.firstElementChild) { zones.set(el.firstElementChild, el); observer().observe(el.firstElementChild) }
  },
  updated(el, { value }) {
    if (value && el.getAttribute('aria-label') !== value) el.setAttribute('aria-label', value)
    prevoirMesure(el)
  },
  beforeUnmount(el) {
    for (const [cible, zone] of zones) if (zone === el) { observateur?.unobserve(cible); zones.delete(cible) }
  },
}
