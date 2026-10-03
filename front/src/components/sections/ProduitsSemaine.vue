<script setup lang="ts">
import { ref } from 'vue'

// Cet objet représente le contenu du fichier variables.js réadapté en structure réactive Vue
const variablesSemaine = ref({
  titre: "Disponible cette semaine",
  produits: [
    { nom: "Carottes fraîches", prix: "500 FCFA", emoji: "🥕" },
    { nom: "Poisson fumé", prix: "2 500 FCFA", emoji: "🐟" },
    { nom: "Fruits de saison", prix: "2 500 FCFA", emoji: "🍊" },
    { nom: "Jus santé gingembre", prix: "2 000 FCFA", emoji: "🫚" },
    { nom: "Œufs supplémentaires (×6)", prix: "510 FCFA", emoji: "🥚" },
  ],
  messageWhatsApp: "Bonjour Ahitché ! Je souhaite ajouter des produits variables à ma commande. Quels produits sont disponibles cette semaine ?"
})

const getWhatsAppLink = () => {
  const base = "https://wa.me/22998136635"
  return `${base}?text=${encodeURIComponent(variablesSemaine.value.messageWhatsApp)}`
}
</script>

<template>
  <section id="variables" class="py-[100px] bg-creme2">
    <div class="max-w-[1160px] mx-auto px-6 text-center">
      <div class="inline-block bg-foret/10 text-foret text-[0.78rem] font-bold tracking-widest uppercase px-3.5 py-1 rounded-full mb-4.5">
        Compléments
      </div>
      
      <h2 class="font-display text-3xl sm:text-4xl font-bold mb-10 text-noir">
        {{ variablesSemaine.titre }}
      </h2>

      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 max-w-[960px] mx-auto mb-12">
        <div 
          v-for="(prod, idx) in variablesSemaine.produits" 
          :key="idx"
          class="bg-white border border-foret/6 rounded-2xl p-5 flex flex-col items-center justify-center text-center transition-all duration-250 hover:-translate-y-1 hover:shadow-md"
        >
          <div class="text-4xl mb-3.5 select-none">{{ prod.emoji }}</div>
          <h4 class="text-sm font-bold text-noir mb-1.5 leading-snug">{{ prod.nom }}</h4>
          <div class="text-xs font-extrabold text-savane bg-savane/8 px-2.5 py-1 rounded-full">{{ prod.prix }}</div>
        </div>
      </div>

      <div class="max-w-[550px] mx-auto">
        <a 
          :href="getWhatsAppLink()"
          target="_blank" 
          rel="noopener"
          class="inline-flex items-center justify-center gap-2 bg-savane text-white font-bold text-sm px-6 py-3.5 rounded-full shadow-md transition-all duration-250 hover:bg-foret hover:-translate-y-0.5"
        >
          <span>➕ Ajouter à ma formule</span>
        </a>
      </div>
    </div>
  </section>
</template>