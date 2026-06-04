<script setup lang="ts">
import { ref } from 'vue'
import BaseButton from '../ui/BaseButton.vue'

const produitsInclus = ref([
  "Riz local", "Haricots", "Coquillettes", "Spaghetti",
  "Couscous", "Gari", "Tapioca", "Huile végétale",
  "Tomates", "Oignons", "Sucre", "Lait concentré",
  "Œufs", "Épices Ahitché", "Assaisonnement", "Huile de palme"
])
</script>

<template>
  <section id="formules" class="py-20 bg-creme2/40">
    <div class="max-w-6xl mx-auto px-4">
      <div class="text-center mb-16">
        <span class="text-xs font-bold tracking-wider text-savane uppercase bg-savane/10 px-3 py-1 rounded-full">
          Nos formules
        </span>
        <h2 class="mt-4 text-4xl md:text-5xl font-display font-bold text-foret leading-tight">
          Choisissez votre niveau<br />
          <em class="font-italic text-savane">de confort</em>
        </h2>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch mb-16">
        
        <div class="flex flex-col justify-between bg-white rounded-3xl p-8 border border-creme2 shadow-sm transition-all duration-300 hover:shadow-md">
          <div>
            <div class="flex items-center gap-4 mb-4">
              <span class="text-3xl" aria-hidden="true">🌿</span>
              <div>
                <h3 class="text-xl font-bold text-foret font-body tracking-tight">AHI ESSENTIEL</h3>
                <p class="text-sm text-gris">1 personne · par semaine</p>
              </div>
            </div>
            <p class="text-sm italic text-gris mb-6">« Les bases de votre semaine déjà organisées. »</p>
            
            <div class="grid grid-cols-2 gap-4 border-y border-creme2 py-4 mb-6">
              <div>
                <span class="block text-2xl font-bold text-foret font-body">20–30</span>
                <span class="text-xs text-gris">repas possibles</span>
              </div>
              <div>
                <span class="block text-2xl font-bold text-foret font-body">2–4h</span>
                <span class="text-xs text-gris">économisées</span>
              </div>
            </div>
          </div>

          <div>
            <div class="mb-6">
              <span class="block text-sm text-gris-lt line-through">24 000 FCFA</span>
              <span class="text-3xl font-bold text-foret font-body">10 800 <small class="text-sm font-semibold">FCFA</small></span>
            </div>
            <BaseButton 
              href="https://wa.me/22998136635?text=Bonjour%20Ahitch%C3%A9%20!%20Je%20souhaite%20commander%20la%20formule%20AHI%20ESSENTIEL%20(10%20800%20FCFA).%20Pouvez-vous%20me%20confirmer%20les%20d%C3%A9tails%20%3F"
              variant="secondary"
              external
              class="w-full"
            >
              Commander — WhatsApp
            </BaseButton>
          </div>
        </div>

        <div class="relative flex flex-col justify-between bg-white rounded-3xl p-8 border-2 border-or shadow-xl transition-all duration-300 hover:shadow-2xl md:-translate-y-4">
          <div class="absolute -top-4 left-1/2 -translate-x-1/2 bg-or text-foret text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider shadow-sm">
            ⭐ Le plus choisi
          </div>
          <div>
            <div class="flex items-center gap-4 mb-4 mt-2">
              <span class="text-3xl" aria-hidden="true">🌾</span>
              <div>
                <h3 class="text-xl font-bold text-foret font-body tracking-tight">AHI ÉQUILIBRÉ</h3>
                <p class="text-sm text-gris">2–3 personnes · par semaine</p>
              </div>
            </div>
            <p class="text-sm italic text-gris mb-6">« Mieux manger sans compliquer votre quotidien. »</p>
            
            <div class="grid grid-cols-2 gap-4 border-y border-creme2 py-4 mb-6">
              <div>
                <span class="block text-2xl font-bold text-foret font-body">35–50</span>
                <span class="text-xs text-gris">repas possibles</span>
              </div>
              <div>
                <span class="block text-2xl font-bold text-foret font-body">4–6h</span>
                <span class="text-xs text-gris">économisées</span>
              </div>
            </div>
          </div>

          <div>
            <div class="mb-6">
              <span class="block text-sm text-gris-lt line-through">50 000 FCFA</span>
              <span class="text-3xl font-bold text-foret font-body">22 500 <small class="text-sm font-semibold">FCFA</small></span>
            </div>
            <BaseButton 
              href="https://wa.me/22998136635?text=Bonjour%20Ahitch%C3%A9%20!%20Je%20souhaite%20commander%20la%20formule%20AHI%20%C3%89QUILIBR%C3%89%20(22%20500%20FCFA).%20Pouvez-vous%20me%20confirmer%20les%20d%C3%A9tails%20%3F"
              variant="primary"
              external
              class="w-full"
            >
              Commander — WhatsApp
            </BaseButton>
          </div>
        </div>

        <div class="flex flex-col justify-between bg-white rounded-3xl p-8 border border-creme2 shadow-sm transition-all duration-300 hover:shadow-md">
          <div>
            <div class="flex items-center gap-4 mb-4">
              <span class="text-3xl" aria-hidden="true">👑</span>
              <div>
                <h3 class="text-xl font-bold text-foret font-body tracking-tight">AHI CONFORT</h3>
                <p class="text-sm text-gris">Famille 4–6 · par semaine</p>
              </div>
            </div>
            <p class="text-sm italic text-gris mb-6">« Votre cuisine organisée sans stress. »</p>
            
            <div class="grid grid-cols-2 gap-4 border-y border-creme2 py-4 mb-6">
              <div>
                <span class="block text-2xl font-bold text-foret font-body">60–90</span>
                <span class="text-xs text-gris">repas possibles</span>
              </div>
              <div>
                <span class="block text-2xl font-bold text-foret font-body">6–10h</span>
                <span class="text-xs text-gris">économisées</span>
              </div>
            </div>
          </div>

          <div>
            <div class="mb-6">
              <span class="block text-sm text-gris-lt line-through">110 000 FCFA</span>
              <span class="text-3xl font-bold text-foret font-body">50 300 <small class="text-sm font-semibold">FCFA</small></span>
            </div>
            <BaseButton 
              href="https://wa.me/22998136635?text=Bonjour%20Ahitch%C3%A9%20!%20Je%20souhaite%20commander%20la%20formule%20AHI%20CONFORT%20(50%20300%20FCFA).%20Pouvez-vous%20me%20confirmer%20les%20d%C3%A9tails%20%3F"
              variant="secondary"
              external
              class="w-full"
            >
              Commander — WhatsApp
            </BaseButton>
          </div>
        </div>

      </div>

      <div class="bg-white rounded-3xl p-8 border border-creme2 text-center max-w-4xl mx-auto shadow-xs">
        <p class="text-foret font-bold mb-6 font-body">Les 16 produits garantis dans chaque formule</p>
        <div class="flex flex-wrap justify-center gap-2">
          <span 
            v-for="produit in produitsInclus" 
            :key="produit"
            class="bg-creme text-foret text-sm font-medium px-4 py-2 rounded-full border border-creme2/60 transition-colors duration-200 hover:bg-creme2"
          >
            {{ produit }}
          </span>
        </div>
      </div>
    </div>
  </section>
</template>