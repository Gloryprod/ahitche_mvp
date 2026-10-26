<script setup lang="ts">
import { Minus, Plus } from 'lucide-vue-next'
import { formaterFrancs, formaterQuantite, type ProduitVip } from '@/config/vip'

// Produits au prix VIP avec leur sélecteur de quantité (− champ +), communs à l'espace client et à la saisie par
// l'équipe. Les quantités viennent du panier (usePanierAchatLibre) ; la valeur demandée lui est transmise, et il la
// ramène au pas du produit (0,5 kg ou L ; 1 sinon) et au maximum.
const props = defineProps<{ produits: ProduitVip[]; quantites: Record<string, number> }>()
const emit = defineEmits<{ fixer: [produit: ProduitVip, valeur: number] }>()

const quantite = (p: ProduitVip) => props.quantites[p.productId] ?? 0
const ajuster = (p: ProduitVip, sens: 1 | -1) => emit('fixer', p, quantite(p) + sens * p.pas)
function saisir(p: ProduitVip, event: Event) {
  const champ = event.target as HTMLInputElement
  const texte = champ.value.trim().replace(',', '.')
  emit('fixer', p, texte === '' ? 0 : Number(texte))
  champ.value = quantite(p) ? formaterQuantite(quantite(p)) : '' // Valeur retenue par le panier
}

const boutonQuantite = 'cursor-pointer w-11 h-11 inline-flex items-center justify-center rounded-xl border border-creme2 text-foret hover:bg-creme disabled:opacity-40 disabled:cursor-default'
</script>

<template>
  <!-- Une colonne sur téléphone, deux sur grand écran -->
  <ul class="grid grid-cols-1 lg:grid-cols-2 lg:gap-x-10">
    <li v-for="p in produits" :key="p.productId" class="flex items-center justify-between gap-3 py-2 border-b border-creme2">
      <div class="min-w-0">
        <p class="text-sm font-semibold text-noir leading-snug">{{ p.nom }}</p>
        <p class="text-xs text-gris">{{ formaterFrancs(p.prixVip) }} / {{ p.unite }}</p>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <button type="button" :class="boutonQuantite" :disabled="!quantite(p)" :aria-label="`${p.nom} : diminuer la quantité`" @click="ajuster(p, -1)">
          <Minus class="w-4 h-4" aria-hidden="true" />
        </button>
        <input
          type="text" inputmode="decimal" autocomplete="off" placeholder="0"
          :value="quantite(p) ? formaterQuantite(quantite(p)) : ''"
          :aria-label="`Quantité de ${p.nom}, en ${p.unite}`"
          :class="['w-12 h-11 rounded-xl border text-center text-sm font-bold', quantite(p) ? 'border-foret text-foret bg-foret/5' : 'border-creme2 text-noir']"
          @change="saisir(p, $event)"
          @keydown.enter.prevent="saisir(p, $event)"
        />
        <button type="button" :class="boutonQuantite" :disabled="quantite(p) >= p.maximum" :aria-label="`${p.nom} : augmenter la quantité`" @click="ajuster(p, 1)">
          <Plus class="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  </ul>
</template>
