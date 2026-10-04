<script setup lang="ts">
import { ACTUALITES } from '@/config/actualites'
import { vApparition } from '@/directives/apparition'

// Actualités discrètes, après la FAQ : crédibilité sans détourner du parcours de commande
const FONDS = ['bg-foret text-or', 'bg-or text-foret', 'bg-savane text-white']
</script>

<template>
  <section id="actualites" class="py-20 bg-creme">
    <div class="max-w-6xl mx-auto px-4">
      <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8 text-center sm:text-left">
        <div>
          <span class="text-xs font-bold tracking-wider text-foret uppercase bg-savane/10 px-3 py-1 rounded-full">Actualités</span>
          <h2 class="mt-4 text-3xl md:text-4xl font-display font-bold text-foret leading-tight">
            Ahitché <em class="font-italic text-savane">en ce moment</em>
          </h2>
        </div>
        <RouterLink to="/blog" class="self-center sm:self-auto inline-flex items-center gap-1.5 min-h-11 text-sm font-bold text-foret hover:text-savane transition-colors">
          Toutes les actualités
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
        </RouterLink>
      </div>

      <!-- Mobile : cartes à faire glisser ; ordinateur : trois colonnes -->
      <ul class="flex md:grid md:grid-cols-3 gap-4 md:gap-6 -mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto md:overflow-visible snap-x snap-mandatory scroll-px-4 pb-2 [scrollbar-width:none]">
        <li
          v-for="(a, i) in ACTUALITES"
          :key="a.titre"
          v-apparition="i * 100"
          class="snap-start shrink-0 w-[80%] sm:w-[55%] md:w-auto"
        >
          <article class="h-full flex flex-col bg-white rounded-3xl border border-creme2 overflow-hidden shadow-xs">
            <div :class="['flex items-center justify-center h-28', FONDS[i % FONDS.length]]" aria-hidden="true">
              <svg v-if="a.icone === 'lancement'" class="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M9 17h6l-3-7H8M15 6h3l3 8M12 10h5"/></svg>
              <svg v-else-if="a.icone === 'partenaire'" class="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V10M19 21V10M9 21v-7M15 21v-7M2 10l10-6 10 6z"/></svg>
              <svg v-else class="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18.5 20a6.5 6.5 0 0 0-3-5.5"/></svg>
            </div>
            <div class="flex-1 flex flex-col p-6">
              <p class="text-xs font-bold text-savane uppercase tracking-wider mb-2">{{ a.categorie }}</p>
              <h3 class="text-lg font-bold text-noir leading-snug mb-2">{{ a.titre }}</h3>
              <p class="flex-1 text-sm text-gris leading-relaxed">{{ a.resume }}</p>
              <template v-if="a.lien">
                <a
                  v-if="a.lien.externe"
                  :href="a.lien.vers"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="mt-4 inline-flex items-center min-h-11 text-sm font-bold text-foret underline underline-offset-4 hover:text-savane"
                >{{ a.lien.texte }}</a>
                <a v-else :href="a.lien.vers" class="mt-4 inline-flex items-center min-h-11 text-sm font-bold text-foret underline underline-offset-4 hover:text-savane">{{ a.lien.texte }}</a>
              </template>
            </div>
          </article>
        </li>
      </ul>
    </div>
  </section>
</template>
