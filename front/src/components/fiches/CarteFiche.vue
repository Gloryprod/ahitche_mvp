<script setup lang="ts">
import { computed } from 'vue'
import { ShoppingBasket } from 'lucide-vue-next'
import { photoOptimisee } from '@/services/images'

// Carte d'une fiche produit : la même dans le bandeau de l'espace client et dans le back-office (aperçu fidèle).
// Le prix est publicitaire, saisi dans la fiche : aucun lien avec les commandes, le stock ni les prix VIP.
// Le créneau par défaut reçoit les informations et les boutons du back-office.
const props = defineProps<{
  nom: string
  format: string
  prix: number
  mention?: string
  photo?: string
}>()

// Photo affichée en 160 × 120 : Cloudinary en envoie une version réduite à cette taille (×2 pour les écrans denses)
const LARGEUR = 160
const HAUTEUR = 120
const source = computed(() => (props.photo ? photoOptimisee(props.photo, LARGEUR, HAUTEUR) : ''))
const prixAffiche = computed(() => `${props.prix.toLocaleString('fr-FR')} F`)
</script>

<template>
  <article class="h-full bg-white border border-creme2 rounded-2xl overflow-hidden flex flex-col text-left">
    <div class="aspect-[4/3] bg-creme2 overflow-hidden flex items-center justify-center">
      <!-- Le nom suit juste après : la photo n'a pas besoin d'être décrite une seconde fois -->
      <img
        v-if="source"
        :src="source"
        alt=""
        :width="LARGEUR * 2"
        :height="HAUTEUR * 2"
        loading="lazy"
        decoding="async"
        class="w-full h-full object-cover"
      />
      <ShoppingBasket v-else class="w-9 h-9 text-foret/50" aria-hidden="true" />
    </div>
    <div class="p-3 flex flex-col gap-1 flex-1">
      <h3 class="text-sm font-bold text-noir leading-snug">{{ nom }}</h3>
      <p class="text-xs text-gris leading-snug">{{ format }}</p>
      <p class="mt-auto pt-1.5 font-display text-lg font-bold text-foret leading-none">{{ prixAffiche }}</p>
      <p v-if="mention" class="text-[11px] font-semibold text-savane leading-snug">{{ mention }}</p>
      <slot />
    </div>
  </article>
</template>
