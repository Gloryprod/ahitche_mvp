<script setup lang="ts">
import type { Actualite } from '@/config/actualites'
import IconeActualite from './IconeActualite.vue'

// Une carte de la section « Actualités » de l'accueil, aussi affichée en aperçu dans l'écran « Site public ».
// Couleur de l'en-tête selon la place de la carte (1re forêt, 2e or, 3e savane). Lien externe : nouvel onglet ;
// en aperçu, tous les liens s'ouvrent dans un nouvel onglet (le formulaire en cours reste ouvert).
const props = defineProps<{ actualite: Actualite; rang: number; apercu?: boolean }>()

const FONDS = ['bg-foret text-or', 'bg-or text-foret', 'bg-savane text-white']
const lienInterne = (vers: string) => (props.apercu && vers.startsWith('#') ? `/${vers}` : vers)
const classeLien = 'mt-4 inline-flex items-center min-h-11 text-sm font-bold text-foret underline underline-offset-4 hover:text-savane'
</script>

<template>
  <article class="h-full flex flex-col bg-white rounded-3xl border border-creme2 overflow-hidden shadow-xs">
    <div :class="['flex items-center justify-center h-28', FONDS[rang % FONDS.length]]" aria-hidden="true">
      <IconeActualite :icone="actualite.icone" class="w-12 h-12" />
    </div>
    <div class="flex-1 flex flex-col p-6">
      <p class="text-xs font-bold text-savane uppercase tracking-wider mb-2">{{ actualite.categorie }}</p>
      <h3 class="text-lg font-bold text-noir leading-snug mb-2">{{ actualite.titre }}</h3>
      <p class="flex-1 text-sm text-gris leading-relaxed">{{ actualite.resume }}</p>
      <template v-if="actualite.lien">
        <a v-if="actualite.lien.externe" :href="actualite.lien.vers" target="_blank" rel="noopener noreferrer" :class="classeLien">{{ actualite.lien.texte }}</a>
        <RouterLink v-else-if="actualite.lien.vers.startsWith('/') && !apercu" :to="actualite.lien.vers" :class="classeLien">{{ actualite.lien.texte }}</RouterLink>
        <a v-else :href="lienInterne(actualite.lien.vers)" :target="apercu ? '_blank' : undefined" :rel="apercu ? 'noopener' : undefined" :class="classeLien">{{ actualite.lien.texte }}</a>
      </template>
    </div>
  </article>
</template>
