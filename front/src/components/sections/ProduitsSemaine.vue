<script setup lang="ts">
import { lienWhatsApp, MESSAGES_WHATSAPP } from '@/config/contact'

// Compléments disponibles cette semaine, à ajouter à une formule (prix en FCFA)
const produits = [
  { nom: 'Carottes fraîches', prix: '500 FCFA', emoji: '🥕' },
  { nom: 'Poisson fumé', prix: '2 500 FCFA', emoji: '🐟' },
  { nom: 'Fruits de saison', prix: '2 500 FCFA', emoji: '🍊' },
  { nom: 'Jus santé gingembre', prix: '2 000 FCFA', emoji: '🫚' },
  { nom: 'Œufs supplémentaires (×6)', prix: '510 FCFA', emoji: '🥚' },
]
</script>

<template>
  <section id="variables" class="py-20 bg-creme2">
    <div class="max-w-[1160px] mx-auto px-6 text-center">
      <div class="inline-block bg-foret/10 text-foret text-xs font-bold tracking-widest uppercase px-3.5 py-1 rounded-full mb-4">
        Compléments
      </div>

      <h2 class="font-display text-3xl sm:text-4xl font-bold mb-3 text-noir">Disponible cette semaine</h2>
      <p class="text-gris mb-8">À ajouter à votre formule, livré avec elle.</p>

      <!-- Mobile : rangée à faire glisser ; ordinateur : grille -->
      <ul class="flex lg:grid lg:grid-cols-5 gap-3 lg:gap-4 -mx-6 px-6 lg:max-w-[960px] lg:mx-auto lg:px-0 mb-10 overflow-x-auto lg:overflow-visible snap-x snap-mandatory scroll-px-6 pb-2 [scrollbar-width:none]">
        <li
          v-for="prod in produits"
          :key="prod.nom"
          class="snap-start shrink-0 w-36 lg:w-auto bg-white border border-foret/6 rounded-2xl p-5 flex flex-col items-center justify-center text-center transition-all duration-250 hover:-translate-y-1 hover:shadow-md"
        >
          <div class="text-4xl mb-3 select-none" aria-hidden="true">{{ prod.emoji }}</div>
          <h3 class="text-sm font-bold text-noir mb-1.5 leading-snug">{{ prod.nom }}</h3>
          <div class="text-xs font-extrabold text-foret bg-savane/10 px-2.5 py-1 rounded-full whitespace-nowrap">{{ prod.prix }}</div>
        </li>
      </ul>

      <a
        :href="lienWhatsApp(MESSAGES_WHATSAPP.complements)"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center justify-center gap-2 min-h-11 bg-savane text-white font-bold text-sm px-6 rounded-full shadow-md transition-all duration-250 hover:bg-foret hover:-translate-y-0.5 active:scale-97"
      >
        <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.2.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.2z"/></svg>
        Ajouter à ma formule
      </a>
    </div>
  </section>
</template>
