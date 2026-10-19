<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Search, AlertTriangle, Plus } from 'lucide-vue-next'
import api from '@/stores/api'
import { useQuery, keepPreviousData } from '@tanstack/vue-query'
import type { TypeProduit } from '@/type'
import { FAMILLES_PRODUIT, familleDe, type CodeFamille } from '@/config/produits'
import { formatFcfa, formatQuantite } from '@/services/bonsCommande'

// Inventaire : tous les produits actifs du catalogue, même à 0, triés par famille (P, V, MP, EMB) puis référence.
// Le filtre par famille se fait ici, sur la liste chargée une fois (pas de nouvelle requête à chaque pastille).
interface InventoryItem {
  productId: string
  reference: string | null
  nom: string
  unite: string
  type: TypeProduit
  famille: CodeFamille | null
  stockTotal: number
  nbLotsActifs: number
  lotsACompter: number // Lots dont la quantité n'est pas encore comptée : stock incomplet
  lotsAConfirmer: number
  valeurFcfa: number // Au prix d'achat ; un lot à compter compte pour sa valeur facturée
  seuilAlerte: number | null // Vide : seuil à renseigner, pas d'alerte
  enAlerte: boolean // Stock au seuil ou en dessous
}

// --- ÉTATS ---
const search = ref('')
const debouncedSearch = ref('')
const filtreFamille = ref<'' | CodeFamille>('')

// Debounce fait maison (évite d'installer une dépendance lourde)
let timeoutId: ReturnType<typeof setTimeout>
watch(search, (newValue) => {
  clearTimeout(timeoutId)
  timeoutId = setTimeout(() => {
    debouncedSearch.value = newValue
  }, 400) // Attend 400ms d'inactivité avant de lancer le filtrage
})

// --- CHARGEMENT DES DONNÉES (TanStack Query v5), clé partagée avec le tableau de bord ---
const fetchGlobalInventory = async (): Promise<InventoryItem[]> => {
  const response = await api.get('/api/admin/inventory/global')
  if (!response?.data) throw new Error('Aucune donnée d\'inventaire reçue')
  return response.data
}

const { data: inventaireRaw, isLoading, isError, error } = useQuery({
  queryKey: ['globalInventory'],
  queryFn: fetchGlobalInventory,
  placeholderData: keepPreviousData,
})

// --- FILTRES ET TOTAUX ---
const sansAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const codeFamille = (i: InventoryItem) => i.famille ?? familleDe(i.type)?.code ?? null

const filtres = computed(() => {
  const liste = inventaireRaw.value ?? []
  return [
    { code: '' as const, libelle: '', nombre: liste.length },
    ...FAMILLES_PRODUIT.map(f => ({ code: f.code, libelle: f.libelle, nombre: liste.filter(i => codeFamille(i) === f.code).length })),
  ]
})

const filteredInventory = computed(() => {
  const mots = sansAccents(debouncedSearch.value).split(/\s+/).filter(Boolean)
  return (inventaireRaw.value ?? []).filter(item =>
    (!filtreFamille.value || codeFamille(item) === filtreFamille.value)
    && mots.every(m => sansAccents(`${item.reference ?? ''} ${item.nom}`).includes(m)))
})

// Valeur de la liste affichée (famille et recherche appliquées)
const valeurAffichee = computed(() => filteredInventory.value.reduce((s, i) => s + (i.valeurFcfa || 0), 0))
const totalACompter = computed(() => (inventaireRaw.value ?? []).reduce((n, i) => n + (i.lotsAConfirmer || 0), 0))
const totalAlertes = computed(() => (inventaireRaw.value ?? []).filter(item => item.enAlerte).length)

// Ligne à 0 (aucun lot, même à compter) : grisée
const estVide = (i: InventoryItem) => i.stockTotal === 0 && !i.lotsACompter
const alerte = (i: InventoryItem) => {
  if (i.enAlerte) return { texte: i.stockTotal === 0 ? 'Rupture' : 'Seuil atteint', badge: true }
  if (i.seuilAlerte === null) return { texte: 'Seuil à renseigner', badge: false }
  return { texte: 'Correct', badge: false }
}
const libelleFamille = (i: InventoryItem) => familleDe(i.type)?.libelle ?? ''
</script>

<template>
  <div class="space-y-6 animate-fadeIn text-xs font-medium text-gris">

    <div class="bg-white p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-creme2">
      <h1 class="font-display font-bold text-xl text-noir">État global de l'inventaire</h1>
      <div class="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
        <div class="relative w-full sm:w-60">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gris" aria-hidden="true" />
          <input v-model="search" type="search" placeholder="Référence ou nom…" aria-label="Rechercher un produit" class="w-full pl-9 pr-4 py-2 bg-creme border border-creme2 rounded-xl text-xs font-medium text-noir focus:outline-none focus:border-foret" />
        </div>
        <RouterLink to="/dashboard/admin/saveStock" class="cursor-pointer flex items-center gap-1.5 px-3 py-2 bg-foret text-white text-xs font-bold rounded-xl hover:bg-foret/90 shrink-0">
          <Plus class="w-3.5 h-3.5" aria-hidden="true" />
          Entrée Stock
        </RouterLink>
      </div>
    </div>

    <div v-if="totalAlertes > 0" class="bg-red-50 text-red-800 border border-red-200 p-4 rounded-xl flex items-start gap-2.5 font-semibold">
      <AlertTriangle class="w-4 h-4 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
      <span>Attention : {{ totalAlertes }} produit(s) au seuil d'alerte ou en dessous, à réapprovisionner auprès des fournisseurs.</span>
    </div>

    <RouterLink v-if="totalACompter > 0" to="/dashboard/admin/saveStock" class="block bg-amber-50 text-amber-900 border border-amber-200 p-4 rounded-xl font-semibold">
      {{ totalACompter }} lot(s) à compter ou à vérifier : les quantités affichées sont incomplètes. Voir les entrées de stock →
    </RouterLink>

    <!-- PASTILLES DE FAMILLE ET TOTAL DE LA LISTE AFFICHÉE -->
    <div class="bg-white p-4 rounded-2xl border border-creme2 space-y-3">
      <div class="flex flex-wrap gap-2" role="group" aria-label="Filtrer par famille">
        <button
          v-for="f in filtres"
          :key="f.code || 'tous'"
          type="button"
          :aria-pressed="filtreFamille === f.code"
          :title="f.libelle || 'Toutes les familles'"
          :class="['cursor-pointer px-3 py-1.5 rounded-full text-xs font-bold border', filtreFamille === f.code ? 'bg-foret text-white border-foret' : 'bg-white text-noir border-creme2 hover:bg-creme']"
          @click="filtreFamille = f.code"
        >
          {{ f.code || 'Tous' }}<span v-if="f.libelle" class="sr-only sm:not-sr-only font-medium"> · {{ f.libelle }}</span> ({{ f.nombre }})
        </button>
      </div>
      <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p class="text-noir">
          Valeur de la liste affichée :
          <span class="font-mono font-bold text-base text-foret">{{ formatFcfa(valeurAffichee) }}</span>
          <span class="text-gris whitespace-nowrap"> · {{ filteredInventory.length }} produit(s)</span>
        </p>
        <p class="text-[11px]">Alertes actives : <span class="font-bold" :class="totalAlertes ? 'text-red-700' : 'text-noir'">{{ totalAlertes }}</span></p>
      </div>
      <p class="text-[10px] text-gris">Valeur au prix d'achat ; un lot à compter compte pour sa valeur facturée.</p>
    </div>

    <div class="bg-white rounded-2xl border border-creme2 overflow-hidden">
      <div v-if="isLoading" class="text-sm font-medium text-gris p-8 text-center">
        Calcul de l'inventaire en cours…
      </div>

      <div v-else-if="isError" class="m-4 p-4 bg-red-50 text-red-700 text-sm rounded-xl border border-red-200">
        Erreur : {{ error?.message || "Impossible de générer le bilan de l'inventaire." }}
      </div>

      <p v-else-if="!filteredInventory.length" class="p-8 text-center text-sm text-gris">
        Aucun produit ne correspond à votre recherche.
      </p>

      <template v-else>
        <!-- ORDINATEUR : TABLEAU -->
        <div v-defilable="'Inventaire'" class="hidden md:block p-4 overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-creme2 text-[10px] font-bold uppercase tracking-wider text-gris">
                <th class="py-2.5 px-2">Réf.</th>
                <th class="py-2.5 px-2">Produit</th>
                <th class="py-2.5 px-2">Famille</th>
                <th class="py-2.5 px-2 text-right">Stock</th>
                <th class="py-2.5 px-2 text-center">Lots</th>
                <th class="py-2.5 px-2 text-center">À compter</th>
                <th class="py-2.5 px-2 text-right">Valeur</th>
                <th class="py-2.5 px-2">Alerte</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-creme2">
              <tr v-for="item in filteredInventory" :key="item.productId" :class="estVide(item) ? 'bg-creme text-gris' : 'text-noir'">
                <td class="py-2.5 px-2 font-mono font-bold whitespace-nowrap">{{ item.reference || '—' }}</td>
                <td class="py-2.5 px-2 font-semibold">{{ item.nom }}</td>
                <td class="py-2.5 px-2">
                  <span class="inline-block px-1.5 py-0.5 rounded bg-creme2 text-noir font-bold text-[10px]" :title="libelleFamille(item)">{{ codeFamille(item) ?? '?' }}</span>
                </td>
                <td class="py-2.5 px-2 text-right font-mono font-bold whitespace-nowrap">
                  {{ formatQuantite(item.stockTotal) }} <span class="font-body font-medium text-[10px]">{{ item.unite }}</span>
                </td>
                <td class="py-2.5 px-2 text-center font-mono">{{ item.nbLotsActifs }}</td>
                <td class="py-2.5 px-2 text-center font-mono" :class="item.lotsACompter ? 'text-amber-800 font-bold' : ''">{{ item.lotsACompter || '—' }}</td>
                <td class="py-2.5 px-2 text-right font-mono whitespace-nowrap">{{ formatFcfa(item.valeurFcfa) }}</td>
                <td class="py-2.5 px-2">
                  <span v-if="alerte(item).badge" class="inline-block px-2 py-0.5 rounded-full font-bold text-[10px] bg-red-50 text-red-800 border border-red-200 uppercase tracking-wide whitespace-nowrap">{{ alerte(item).texte }}</span>
                  <span v-else class="text-[11px]" :class="alerte(item).texte === 'Correct' ? 'text-savane font-semibold' : 'text-gris'">{{ alerte(item).texte }}</span>
                  <span v-if="item.seuilAlerte !== null" class="block text-[10px] text-gris whitespace-nowrap">seuil {{ formatQuantite(item.seuilAlerte) }} {{ item.unite }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- TÉLÉPHONE : CARTES -->
        <ul class="md:hidden p-3 space-y-2" aria-label="Inventaire">
          <li v-for="item in filteredInventory" :key="item.productId" :class="[estVide(item) ? 'bg-creme' : 'bg-white', 'p-3 rounded-xl border border-creme2']">
            <div class="flex items-start justify-between gap-2">
              <p class="min-w-0 break-words" :class="estVide(item) ? 'text-gris' : 'text-noir'">
                <span class="font-mono font-bold">{{ item.reference || '—' }}</span>
                <span class="mx-1 inline-block px-1.5 rounded bg-creme2 text-noir font-bold text-[10px]" :title="libelleFamille(item)">{{ codeFamille(item) ?? '?' }}</span>
                <span class="font-semibold">{{ item.nom }}</span>
              </p>
              <span v-if="alerte(item).badge" class="shrink-0 px-2 py-0.5 rounded-full font-bold text-[10px] bg-red-50 text-red-800 border border-red-200 uppercase tracking-wide">{{ alerte(item).texte }}</span>
            </div>
            <dl class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <div class="flex flex-wrap gap-x-1"><dt>Stock :</dt><dd class="font-mono font-bold" :class="estVide(item) ? 'text-gris' : 'text-noir'">{{ formatQuantite(item.stockTotal) }} {{ item.unite }}</dd></div>
              <div class="flex flex-wrap gap-x-1"><dt>Valeur :</dt><dd class="font-mono text-noir">{{ formatFcfa(item.valeurFcfa) }}</dd></div>
              <div class="flex flex-wrap gap-x-1"><dt>Lots :</dt><dd class="text-noir">{{ item.nbLotsActifs }}</dd></div>
              <div class="flex flex-wrap gap-x-1"><dt>À compter :</dt><dd :class="item.lotsACompter ? 'text-amber-800 font-bold' : 'text-noir'">{{ item.lotsACompter || '—' }}</dd></div>
              <div class="col-span-2 flex flex-wrap gap-x-1">
                <dt>Alerte :</dt>
                <dd :class="alerte(item).badge ? 'text-red-800 font-bold' : alerte(item).texte === 'Correct' ? 'text-savane font-semibold' : 'text-gris'">
                  {{ alerte(item).texte }}<template v-if="item.seuilAlerte !== null"> (seuil {{ formatQuantite(item.seuilAlerte) }} {{ item.unite }})</template>
                </dd>
              </div>
            </dl>
          </li>
        </ul>
      </template>
    </div>
  </div>
</template>
