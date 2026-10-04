<script setup lang="ts">
import FormuleCard from '../ui/FormuleCard.vue'
import { FORMULES as formules, PRODUITS_INCLUS as produitsInclus, EXCLUS_ESSENTIEL as exclusEssentiel } from '@/config/formules'
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
        <FormuleCard v-for="formule in formules" :key="formule.nom" :formule="formule" />
      </div>

      <div class="bg-white rounded-3xl p-8 border border-creme2 text-center max-w-4xl mx-auto shadow-xs">
        <p class="text-foret font-bold mb-2 font-body">Composition adaptée à vos besoins : {{ produitsInclus.length }} produits de base</p>
        <p class="text-gris text-sm mb-6">Les quantités varient selon la formule et la taille de votre foyer.</p>
        <div class="flex flex-wrap justify-center gap-2">
          <span
            v-for="produit in produitsInclus"
            :key="produit"
            class="bg-creme text-foret text-sm font-medium px-4 py-2 rounded-full border border-creme2/60 transition-colors duration-200 hover:bg-creme2"
          >
            {{ produit }}<span v-if="exclusEssentiel.includes(produit)" aria-hidden="true">*</span>
          </span>
        </div>
        <p class="text-gris text-xs mt-5">* Non incluse dans la formule AHI Essentiel.</p>
      </div>
    </div>
  </section>
</template>