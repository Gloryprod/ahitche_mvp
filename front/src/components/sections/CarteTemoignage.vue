<script setup lang="ts">
import type { Temoignage } from '@/config/temoignages'

// Carte d'un avis (avis d'un client ou témoignage publié) : section « Ce que disent nos clients » de l'accueil et
// aperçu de l'onglet « Témoignages » de l'écran « Site public ». `rang` choisit la couleur de l'avatar.
defineProps<{ temoignage: Temoignage; rang: number }>()

// Avatar générique (pas de vrai visage) : initiale sur une couleur de la charte
const COULEURS_AVATAR = ['bg-foret text-or', 'bg-or text-noir', 'bg-savane text-white']
</script>

<template>
  <figure class="h-full flex flex-col bg-white rounded-3xl p-6 border border-creme2 shadow-xs">
    <div class="flex items-center gap-1 text-or mb-4" role="img" :aria-label="`Note : ${temoignage.note} sur 5`">
      <svg v-for="n in 5" :key="n" class="w-5 h-5" :class="n <= temoignage.note ? 'fill-current' : 'fill-creme2'" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>
    </div>
    <blockquote class="flex-1 text-noir leading-relaxed mb-6 break-words">«&nbsp;{{ temoignage.texte }}&nbsp;»</blockquote>
    <figcaption class="flex items-center gap-3 min-w-0">
      <span :class="['flex shrink-0 items-center justify-center w-11 h-11 rounded-full font-display font-bold text-lg', COULEURS_AVATAR[rang % COULEURS_AVATAR.length]]" aria-hidden="true">{{ temoignage.prenom.charAt(0) }}</span>
      <span class="min-w-0">
        <span class="block font-bold text-foret break-words">{{ temoignage.prenom }}</span>
        <span v-if="temoignage.quartier" class="block text-sm text-gris break-words">{{ temoignage.quartier }}</span>
      </span>
    </figcaption>
  </figure>
</template>
