<script setup lang="ts">
import BaseBadge from '../ui/BaseBadge.vue'
import { vApparition } from '@/directives/apparition'

// Version courte : trois problèmes en une ligne chacun, puis la réponse Ahitché et un lien vers les formules
const problemes = [
  { icone: 'temps', titre: 'La course du week-end', description: '3 heures perdues le samedi au marché, sous la chaleur.' },
  { icone: 'gaspillage', titre: 'Le gaspillage', description: 'Trop acheté, mal stocké : des légumes jetés en milieu de semaine.' },
  { icone: 'charge', titre: 'La charge mentale', description: 'Fatigué le soir, sans suivi, l\'équilibre des repas finit par lâcher.' },
] as const
</script>

<template>
  <section id="probleme" class="py-20 bg-white">
    <div class="max-w-[1160px] mx-auto px-6">
      <div class="text-center max-w-2xl mx-auto mb-10">
        <BaseBadge variant="primary" class="mb-4">Pourquoi Ahitché ?</BaseBadge>
        <h2 class="font-display text-3xl sm:text-4xl font-bold text-noir leading-tight">
          Bien manger au Bénin ne devrait pas être un parcours du combattant
        </h2>
      </div>

      <ul class="grid gap-4 md:grid-cols-3 md:gap-6 mb-8">
        <li
          v-for="(p, i) in problemes"
          :key="p.titre"
          v-apparition="i * 100"
          class="flex gap-4 items-start bg-creme/60 border border-foret/5 rounded-2xl p-5"
        >
          <span class="shrink-0 flex items-center justify-center w-11 h-11 rounded-xl bg-or/15 text-or-deep" aria-hidden="true">
            <svg v-if="p.icone === 'temps'" class="w-5.5 h-5.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h12M6 22h12M7 2c0 5 10 5 10 10S7 17 7 22M17 2c0 5-10 5-10 10s10 5 10 10"/></svg>
            <svg v-else-if="p.icone === 'gaspillage'" class="w-5.5 h-5.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/></svg>
            <svg v-else class="w-5.5 h-5.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 3a5.5 5.5 0 0 0-5 7.8A4 4 0 0 0 7 18h1v3h7v-3.5A6.5 6.5 0 0 0 14 4.3 5.5 5.5 0 0 0 9.5 3z"/><path d="M11 9v3l2 1"/></svg>
          </span>
          <div>
            <h3 class="text-base font-bold text-noir">{{ p.titre }}</h3>
            <p class="text-sm text-gris leading-relaxed">{{ p.description }}</p>
          </div>
        </li>
      </ul>

      <!-- La réponse Ahitché, en une phrase -->
      <div class="bg-foret rounded-3xl p-6 md:p-8 text-white flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
        <p class="flex-1 text-base md:text-lg leading-relaxed">
          <strong class="font-bold">La réponse Ahitché :</strong>
          nous sélectionnons les produits locaux et ajustons votre ravitaillement à votre foyer, semaine après semaine.
        </p>
        <a href="#formules" class="inline-flex items-center justify-center gap-2 min-h-11 px-5 rounded-full bg-or text-noir font-bold text-sm hover:bg-or-deep transition-colors shrink-0">
          Voir les formules
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
        </a>
      </div>
    </div>
  </section>
</template>
