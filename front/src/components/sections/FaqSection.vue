<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { FAQ } from '@/config/faq'
import { ajouterDonneesStructurees, donneesFaq } from '@/services/referencement'

// Données structurées FAQPage (référencement local) : ajoutées au <head> le temps de l'affichage de l'accueil
let retirer: (() => void) | undefined
onMounted(() => {
  retirer = ajouterDonneesStructurees('donnees-faq', donneesFaq())
})
onUnmounted(() => retirer?.())
</script>

<template>
  <section id="faq" class="py-20 bg-white">
    <div class="max-w-3xl mx-auto px-4">
      <div class="text-center mb-10">
        <span class="text-xs font-bold tracking-wider text-foret uppercase bg-savane/10 px-3 py-1 rounded-full">
          Questions fréquentes
        </span>
        <h2 class="mt-4 text-4xl md:text-5xl font-display font-bold text-foret leading-tight">
          Vous vous <em class="font-italic text-savane">demandez…</em>
        </h2>
      </div>

      <!-- Accordéon natif (<details>) : utilisable au clavier et sans JavaScript -->
      <div class="divide-y divide-creme2 border-y border-creme2">
        <details v-for="q in FAQ" :key="q.question" class="faq-item group">
          <summary class="flex items-center justify-between gap-4 min-h-14 py-4 cursor-pointer list-none text-left font-bold text-noir hover:text-foret focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-or rounded-lg">
            {{ q.question }}
            <span class="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-creme text-foret transition-transform duration-300 group-open:rotate-45" aria-hidden="true">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            </span>
          </summary>
          <div class="pb-5 pr-12 text-gris leading-relaxed">
            <p>{{ q.reponse }}</p>
            <RouterLink v-if="q.lien" :to="q.lien.vers" class="inline-block mt-2 font-semibold text-foret underline underline-offset-4 hover:text-savane">
              {{ q.lien.texte }}
            </RouterLink>
          </div>
        </details>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Marqueur natif masqué (Safari) : le « + » sert d'indicateur */
.faq-item summary::-webkit-details-marker {
  display: none;
}

/* Ouverture en douceur sur les navigateurs récents ; ailleurs, ouverture immédiate */
@media (prefers-reduced-motion: no-preference) {
  .faq-item {
    interpolate-size: allow-keywords;
  }
  .faq-item::details-content {
    height: 0;
    overflow: clip;
    transition: height 0.3s ease, content-visibility 0.3s allow-discrete;
  }
  .faq-item[open]::details-content {
    height: auto;
  }
}
</style>
