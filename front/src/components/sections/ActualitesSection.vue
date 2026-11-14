<script setup lang="ts">
import { ACTUALITES } from '@/config/actualites'
import { vApparition } from '@/directives/apparition'
import CarteActualite from './CarteActualite.vue'

// Actualités discrètes, après la FAQ : crédibilité sans détourner du parcours de commande. Cartes publiées depuis
// l'admin, sinon celles du code ; aucune carte publiée : la section n'est pas affichée (aucune ancre du menu n'y mène).
</script>

<template>
  <section v-if="ACTUALITES.length" id="actualites" class="py-20 bg-creme">
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
          :key="a.id"
          v-apparition="i * 100"
          class="snap-start shrink-0 w-[80%] sm:w-[55%] md:w-auto"
        >
          <CarteActualite :actualite="a" :rang="i" />
        </li>
      </ul>
    </div>
  </section>
</template>
