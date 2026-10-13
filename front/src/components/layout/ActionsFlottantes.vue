<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { lienWhatsApp, MESSAGES_WHATSAPP } from '@/config/contact'

// Actions toujours à portée sur l'accueil, une fois le hero dépassé :
//  - mobile : barre « Commander sur WhatsApp » en bas de l'écran, masquée sur les formules (elles ont
//    leurs propres boutons) et sur le pied de page ;
//  - toutes tailles : bouton « Retour en haut de page ».
const heroDepasse = ref(false)
const zonesMasquantes = ref(new Set<string>())
const barreVisible = computed(() => heroDepasse.value && zonesMasquantes.value.size === 0)

let observateur: IntersectionObserver | null = null

onMounted(() => {
  const hero = document.getElementById('accueil')
  const zones = [document.getElementById('formules'), document.querySelector('footer')].filter((e): e is HTMLElement => !!e)
  if (!hero || !('IntersectionObserver' in window)) return
  observateur = new IntersectionObserver(entrees => {
    for (const entree of entrees) {
      if (entree.target === hero) {
        heroDepasse.value = !entree.isIntersecting
        continue
      }
      const visibles = new Set(zonesMasquantes.value)
      const cle = entree.target.id || entree.target.tagName
      if (entree.isIntersecting) visibles.add(cle)
      else visibles.delete(cle)
      zonesMasquantes.value = visibles
    }
  })
  observateur.observe(hero)
  zones.forEach(z => observateur!.observe(z))
})

onUnmounted(() => observateur?.disconnect())

// Retour en haut : défilement doux (sauf animations réduites) puis focus sur le titre principal
function retourEnHaut() {
  const reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: reduit ? 'auto' : 'smooth' })
  const titre = document.querySelector<HTMLElement>('#accueil h1')
  if (titre) {
    titre.setAttribute('tabindex', '-1')
    titre.focus({ preventScroll: true })
  }
}
</script>

<template>
  <div class="fixed inset-x-0 bottom-0 z-90 pointer-events-none px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
    <div class="max-w-[1160px] mx-auto flex items-end justify-end gap-3">
      <!-- Mobile : commande WhatsApp toujours à portée -->
      <a
        :href="lienWhatsApp(MESSAGES_WHATSAPP.commande)"
        data-mesure="bouton-flottant"
        target="_blank"
        rel="noopener noreferrer"
        :tabindex="barreVisible ? 0 : -1"
        :aria-hidden="!barreVisible"
        :class="[
          'md:hidden flex-1 inline-flex items-center justify-center gap-2 min-h-12 rounded-full bg-or text-noir font-bold text-base shadow-[0_8px_24px_rgba(17,17,17,0.25)] motion-safe:transition-all motion-safe:duration-300 active:scale-97',
          barreVisible ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4'
        ]"
      >
        <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.2.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.2z"/></svg>
        Commander sur WhatsApp
      </a>

      <!-- Retour en haut de page -->
      <button
        type="button"
        aria-label="Retour en haut de page"
        title="Retour en haut de page"
        :tabindex="heroDepasse ? 0 : -1"
        :aria-hidden="!heroDepasse"
        @click="retourEnHaut"
        :class="[
          'shrink-0 flex items-center justify-center w-12 h-12 rounded-full bg-foret text-white shadow-[0_8px_24px_rgba(17,17,17,0.25)] hover:bg-savane active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-or motion-safe:transition-all motion-safe:duration-300 cursor-pointer',
          heroDepasse ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4'
        ]"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
      </button>
    </div>
  </div>
</template>
