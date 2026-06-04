<script setup lang="ts">
import BaseBadge from '../ui/BaseBadge.vue'

const problemes = [
  {
    emoji: "⏳",
    titre: "La course du weekend",
    description: "Perdre 3 heures le samedi au marché sous la chaleur ou dans les supermarchés bondés de Cotonou."
  },
  {
    emoji: "💸",
    titre: "Le gaspillage invisible",
    description: "Acheter trop ou mal stocker, pour finir par jeter des légumes flétris en milieu de semaine."
  },
  {
    emoji: "🍳",
    titre: "La charge mentale des repas",
    description: "Rentrer fatigué du travail à 19h et devoir encore réfléchir à la composition d'un repas équilibré."
  }
]
</script>

<template>
  <section id="probleme" class="py-[100px] bg-white relative">
    <div class="max-w-[1160px] mx-auto px-6">
      
      <!-- En-tête de section -->
      <div class="text-center max-w-[600px] mx-auto mb-16">
        <BaseBadge variant="primary" class="mb-4">Pourquoi Ahitché ?</BaseBadge>
        <h2 class="font-display text-3xl sm:text-4xl font-bold text-noir leading-tight">
          Manger sainement au Bénin ne devrait pas être un parcours du combattant
        </h2>
      </div>

      <!-- Grille des 3 Problèmes -->
      <div class="grid md:grid-cols-3 gap-7 mb-20">
        <div 
          v-for="(p, idx) in problemes" 
          :key="idx"
          class="bg-creme/60 border border-foret/5 rounded-2xl p-8 transition-all duration-250 hover:shadow-md hover:border-foret/15"
        >
          <div class="text-3xl mb-4.5 select-none">{{ p.emoji }}</div>
          <h3 class="text-lg font-bold text-noir mb-2.5">{{ p.titre }}</h3>
          <p class="text-sm text-gris leading-relaxed">{{ p.description }}</p>
        </div>
      </div>

      <!-- Le Bloc Solution (L'alignement Ahitché) -->
      <div class="bg-foret rounded-3xl p-8 md:p-12 text-white relative overflow-hidden shadow-xl">
        <!-- Orbe décoratif en arrière-plan -->
        <div class="absolute rounded-full filter blur-[60px] w-[300px] h-[300px] bg-savane -bottom-[100px] -right-[50px] opacity-40 pointer-events-none"></div>
        
        <div class="relative z-1 max-w-[750px]">
          <span class="text-or text-xs font-extrabold uppercase tracking-widest block mb-3">La Réponse Ahitché</span>
          <h3 class="font-display text-2xl sm:text-3xl font-bold mb-5 leading-tight">
            Nous transformons votre logistique alimentaire en un abonnement fluide.
          </h3>
          <p class="text-sm sm:text-base text-white/80 leading-relaxed mb-6">
            Ahitché sélectionne le meilleur des marchés locaux, calibre les portions selon vos besoins réels et livre le tout chez vous sous forme de paniers prêts à cuisiner ou à consommer. Pas de surplus, pas de manque, juste l'essentiel pour votre semaine.
          </p>
          <div class="inline-flex items-center gap-2 text-or text-sm font-bold">
            <span>Découvrez nos offres ci-dessous</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>
          </div>
        </div>
      </div>

    </div>
  </section>
</template>