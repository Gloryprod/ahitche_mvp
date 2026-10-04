import type { Directive } from 'vue'

// v-apparition : l'élément apparaît en douceur (fondu + léger glissement) quand il entre à l'écran, une seule fois.
// Sert à guider la lecture d'une section à l'autre. Rien n'est masqué si l'utilisateur a demandé à réduire
// les animations, ni sans IntersectionObserver. Option : délai en ms (v-apparition="120") pour enchaîner des éléments.
let observateur: IntersectionObserver | null = null

function observer() {
  observateur ??= new IntersectionObserver(entrees => {
    for (const entree of entrees) {
      if (!entree.isIntersecting) continue
      entree.target.classList.add('apparition-visible')
      observateur!.unobserve(entree.target)
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 })
  return observateur
}

export const vApparition: Directive<HTMLElement, number | undefined> = {
  mounted(el, { value }) {
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (value) el.style.transitionDelay = `${value}ms`
    el.classList.add('apparition')
    observer().observe(el)
  },
  unmounted(el) {
    observateur?.unobserve(el)
  },
}
