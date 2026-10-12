<script setup lang="ts">
import { computed } from 'vue'
import { photoOptimisee } from '@/services/images'

// Carte d'un complément : la même sur l'accueil et dans le back-office (aperçu fidèle de ce que voit le client).
// Le créneau par défaut reçoit les boutons d'action du back-office.
const props = defineProps<{
  nom: string
  prix: number | null // Vide : « Prix à renseigner » (aperçu du back-office ; le site n'affiche que les produits avec un prix)
  unite: string
  description?: string
  photo?: string
}>()

const prixAffiche = computed(() => (props.prix ? `${props.prix.toLocaleString('fr-FR')} FCFA` : 'Prix à renseigner'))
const uniteAffichee = computed(() => (props.unite && props.unite !== 'unité' ? ` / ${props.unite}` : ''))
const source = computed(() => (props.photo ? photoOptimisee(props.photo, 176, 132) : ''))
</script>

<template>
  <article class="h-full bg-white border border-foret/6 rounded-2xl overflow-hidden flex flex-col text-left">
    <div class="aspect-[4/3] bg-creme2 overflow-hidden">
      <img
        v-if="source"
        :src="source"
        :alt="nom"
        width="352"
        height="264"
        loading="lazy"
        decoding="async"
        class="w-full h-full object-cover"
      />
      <!-- Pas encore de photo : initiale du produit, aux couleurs de la charte -->
      <div v-else class="w-full h-full flex items-center justify-center" aria-hidden="true">
        <span class="w-14 h-14 rounded-full bg-foret/10 text-foret font-display text-2xl font-bold flex items-center justify-center">{{ nom.charAt(0).toUpperCase() }}</span>
      </div>
    </div>
    <div class="p-4 flex flex-col gap-2 flex-1">
      <h3 class="text-sm font-bold text-noir leading-snug">{{ nom }}</h3>
      <p v-if="description" class="text-xs text-gris leading-relaxed line-clamp-3">{{ description }}</p>
      <div class="mt-auto pt-1">
        <span class="inline-block text-xs font-extrabold text-foret bg-savane/10 px-2.5 py-1 rounded-full whitespace-nowrap">{{ prixAffiche }}{{ prix ? uniteAffichee : '' }}</span>
      </div>
      <slot />
    </div>
  </article>
</template>
