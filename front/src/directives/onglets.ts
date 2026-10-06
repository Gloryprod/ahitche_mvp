import type { Directive } from 'vue'

// Barre d'onglets accessible (modèle WAI-ARIA) : une seule tabulation pour entrer dans la barre,
// puis flèches gauche/droite, Début et Fin pour passer d'un onglet à l'autre (l'onglet choisi s'active).
// Usage : sur l'élément role="tablist" dont les enfants sont des boutons role="tab" avec aria-selected.
type BarreOnglets = HTMLElement & { _clavierOnglets?: (e: KeyboardEvent) => void }

const onglets = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('[role="tab"]')]

// Seul l'onglet sélectionné est dans l'ordre de tabulation
function rangerTabulation(el: HTMLElement) {
  const liste = onglets(el)
  const actif = liste.find(o => o.getAttribute('aria-selected') === 'true') ?? liste[0]
  for (const o of liste) o.setAttribute('tabindex', o === actif ? '0' : '-1')
}

export const vOnglets: Directive<BarreOnglets> = {
  mounted(el) {
    rangerTabulation(el)
    el._clavierOnglets = (e: KeyboardEvent) => {
      const liste = onglets(el)
      const i = liste.indexOf(document.activeElement as HTMLElement)
      if (i < 0) return
      const cible = { ArrowRight: (i + 1) % liste.length, ArrowLeft: (i - 1 + liste.length) % liste.length, Home: 0, End: liste.length - 1 }[e.key]
      if (cible === undefined) return
      e.preventDefault()
      liste[cible]?.focus()
      liste[cible]?.click()
    }
    el.addEventListener('keydown', el._clavierOnglets)
  },
  updated(el) {
    rangerTabulation(el)
  },
  beforeUnmount(el) {
    if (el._clavierOnglets) el.removeEventListener('keydown', el._clavierOnglets)
  },
}
