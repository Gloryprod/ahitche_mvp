<script setup lang="ts">
import { etatDemande, formaterFcfa, quantiteEtUnite, type DemandeLibre, type LigneAchatLibre } from '@/config/vip'

// Détail d'un achat libre VIP dans l'historique du client : produits au prix VIP, puis demandes libres
// (chiffrées, prix à confirmer ou retirées par Ahitché)
defineProps<{ lignes?: LigneAchatLibre[]; demandes?: DemandeLibre[] }>()
</script>

<template>
  <div class="space-y-3 text-sm text-left">
    <ul v-if="lignes?.length" class="divide-y divide-creme2" aria-label="Produits au prix VIP">
      <li v-for="(l, i) in lignes" :key="i" class="flex items-start justify-between gap-3 py-2">
        <span class="min-w-0">
          <span class="block font-semibold text-noir">{{ l.nom }}</span>
          <span class="block text-xs text-gris">{{ quantiteEtUnite(l.quantite, l.unite) }} × {{ formaterFcfa(l.prixUnitaire) }}</span>
        </span>
        <span class="font-bold text-noir whitespace-nowrap tabular-nums">{{ formaterFcfa(l.total) }}</span>
      </li>
    </ul>
    <div v-if="demandes?.length">
      <p class="text-[11px] font-bold uppercase tracking-wider text-gris">Demandes libres</p>
      <ul class="divide-y divide-creme2">
        <li v-for="d in demandes" :key="d._id" class="flex items-start justify-between gap-3 py-2">
          <span :class="['min-w-0 break-words', etatDemande(d) === 'retiree' ? 'text-gris line-through' : 'text-noir']">
            {{ d.designation }}<span v-if="d.quantite" class="text-gris"> · {{ d.quantite }}</span>
          </span>
          <span v-if="etatDemande(d) === 'chiffree'" class="font-bold text-noir whitespace-nowrap tabular-nums">{{ formaterFcfa(d.prix ?? 0) }}</span>
          <span v-else-if="etatDemande(d) === 'a-chiffrer'" class="text-xs font-semibold text-noir bg-or/20 px-2 py-0.5 rounded-full whitespace-nowrap">Prix à confirmer</span>
          <span v-else class="text-xs font-semibold text-gris whitespace-nowrap">Retirée de la commande</span>
        </li>
      </ul>
    </div>
  </div>
</template>
