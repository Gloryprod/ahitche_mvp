<script setup lang="ts">
import { ref, reactive } from 'vue'
import { Trash2 } from 'lucide-vue-next'
import { MAX_DEMANDES, DESIGNATION, QUANTITE_DEMANDE_MAX, MAX_PRIX_DEMANDE, formaterFrancs } from '@/config/vip'
import type { DemandeSaisie } from '@/composables/usePanierAchatLibre'

// Demandes libres d'un achat libre (produits hors catalogue), communes à l'espace client et à la saisie par l'équipe :
// liste, ajout (désignation, quantité en texte) et retrait. Prix seulement quand l'admin saisit la commande
// (avecPrix) : vide, la demande reste « à chiffrer ». Le panier (usePanierAchatLibre) contrôle et garde les demandes.
const props = defineProps<{
  demandes: DemandeSaisie[]
  ajouter: (saisie: { designation: string; quantite: string; prix: number | null }) => string // Message d'erreur ou ''
  retirer: (id: number) => void
  avecPrix?: boolean
  afficherEtat?: boolean // « À chiffrer » à côté des demandes sans prix (écrans de l'équipe)
}>()

const nouvelle = reactive({ designation: '', quantite: '', prix: '' as number | '' })
const erreur = ref('')
const champDesignation = ref<HTMLInputElement | null>(null)

function ajouterDemande() {
  let prix: number | null = null
  if (props.avecPrix && nouvelle.prix !== '') {
    prix = Number(nouvelle.prix)
    if (!(Number.isFinite(prix) && prix >= 0 && prix <= MAX_PRIX_DEMANDE)) {
      erreur.value = 'Prix en FCFA, 0 ou plus (ou vide pour le chiffrer plus tard).'
      return
    }
  }
  erreur.value = props.ajouter({ designation: nouvelle.designation, quantite: nouvelle.quantite, prix })
  if (!erreur.value) {
    nouvelle.designation = ''
    nouvelle.quantite = ''
    nouvelle.prix = ''
  }
  champDesignation.value?.focus()
}

const champ = 'mt-1 w-full min-h-11 px-4 py-2.5 border border-creme2 rounded-xl text-sm font-normal normal-case tracking-normal text-noir bg-white'
</script>

<template>
  <div class="space-y-3">
    <ul v-if="demandes.length" class="space-y-2" aria-label="Demandes libres">
      <li v-for="d in demandes" :key="d.id" class="flex items-center justify-between gap-2 pl-3 rounded-xl bg-creme">
        <span class="min-w-0 py-2 text-sm text-noir break-words">{{ d.designation }}<span v-if="d.quantite" class="text-gris"> · {{ d.quantite }}</span></span>
        <span class="flex items-center gap-1 shrink-0">
          <span v-if="d.prix !== null" class="text-sm font-bold text-noir whitespace-nowrap">{{ formaterFrancs(d.prix) }}</span>
          <span v-else-if="afficherEtat" class="text-[11px] font-bold text-noir bg-white border border-or-deep px-2 py-0.5 rounded-full whitespace-nowrap">À chiffrer</span>
          <button type="button" class="cursor-pointer w-11 h-11 inline-flex items-center justify-center rounded-xl text-red-700 hover:bg-red-50" :aria-label="`Retirer la demande : ${d.designation}`" @click="retirer(d.id)">
            <Trash2 class="w-4 h-4" aria-hidden="true" />
          </button>
        </span>
      </li>
    </ul>
    <div v-if="demandes.length < MAX_DEMANDES" :class="['grid grid-cols-1 gap-2 sm:items-end', avecPrix ? 'sm:grid-cols-[1fr_8rem_8rem_auto]' : 'sm:grid-cols-[1fr_9rem_auto]']">
      <label class="block text-xs font-bold uppercase tracking-wider text-gris">Produit souhaité
        <input ref="champDesignation" v-model="nouvelle.designation" :maxlength="DESIGNATION.max" placeholder="Ex. Poisson fumé" :class="champ" @keydown.enter.prevent="ajouterDemande" />
      </label>
      <label class="block text-xs font-bold uppercase tracking-wider text-gris">Quantité
        <input v-model="nouvelle.quantite" :maxlength="QUANTITE_DEMANDE_MAX" placeholder="Ex. 2 tas" :class="champ" @keydown.enter.prevent="ajouterDemande" />
      </label>
      <label v-if="avecPrix" class="block text-xs font-bold uppercase tracking-wider text-gris">Prix (FCFA)
        <input v-model="nouvelle.prix" type="number" min="0" step="1" inputmode="numeric" placeholder="À chiffrer" :class="champ" @keydown.enter.prevent="ajouterDemande" />
      </label>
      <button type="button" class="cursor-pointer min-h-11 px-4 rounded-xl border border-foret/30 text-foret text-sm font-bold hover:bg-foret/5" @click="ajouterDemande">Ajouter</button>
    </div>
    <p v-if="erreur" role="alert" class="text-xs font-semibold text-red-700">{{ erreur }}</p>
  </div>
</template>
