<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Search, Eye, X, Layers, AlertTriangle, CheckCircle2, Plus } from 'lucide-vue-next'
import api from '@/stores/api'
import { useQuery, keepPreviousData } from '@tanstack/vue-query'

// --- INTERFACES TYPES ---
interface InventoryItem {
  productId: string
  nom: string
  unite: string
  stockTotal: number
  nbLotsActifs: number
  seuilAlerte: number
  enAlerte: boolean
}

// --- ÉTATS ---
const search = ref('')
const debouncedSearch = ref('')
const notification = ref({ text: '', type: '' })

// Gestion de l'affichage du volet de détails latéral
const showDetailPanel = ref(false)
const selectedItem = ref<InventoryItem | null>(null)

// Debounce fait maison (évite d'installer une dépendance lourde)
let timeoutId: ReturnType<typeof setTimeout>
watch(search, (newValue) => {
  clearTimeout(timeoutId)
  timeoutId = setTimeout(() => {
    debouncedSearch.value = newValue
  }, 400) // Attend 400ms d'inactivité avant de lancer le filtrage
})

// --- CHARGEMENT DES DONNÉES (TanStack Query v5) ---
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

// --- CLIENT-SIDE FILTERING & STATS (Basé sur le raw data de TanStack) ---
const filteredInventory = computed(() => {
  if (!inventaireRaw.value) return []
  return inventaireRaw.value.filter(item => 
    item.nom.toLowerCase().includes(debouncedSearch.value.toLowerCase())
  )
})

const totalAlertes = computed(() => {
  if (!inventaireRaw.value) return 0
  return inventaireRaw.value.filter(item => item.enAlerte).length
})

// --- ACTIONS ---
const openDetailMode = (item: InventoryItem) => {
  selectedItem.value = item
  showDetailPanel.value = true
}

const closePanels = () => {
  showDetailPanel.value = false
  selectedItem.value = null
}
</script>

<template>
  <div class="space-y-6 animate-fadeIn text-xs font-medium text-gray-600">

    <div class="bg-white p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
      <h1 class="font-display font-bold text-xl text-noir flex items-center gap-2">
        <Layers class="w-5 h-5 text-foret stroke-[2.5]" />
        État Global de l'Inventaire
      </h1>
      <div class="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
        <div class="relative w-full sm:w-60">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 stroke-[2.5]" />
          <input v-model="search" type="text" placeholder="Rechercher un produit..." class="w-full pl-9 pr-4 py-2 bg-[#f9f9fb] border border-gray-200 rounded-xl text-xs font-medium text-noir focus:outline-none focus:border-foret focus:bg-white transition-all" />
        </div>
        <RouterLink to="/dashboard/admin/saveStock" class="cursor-pointer flex items-center gap-1.5 px-2 py-2 bg-foret text-white text-xs font-bold rounded-xl hover:bg-opacity-95 transition-all shadow-sm shrink-0">
          <Plus class="w-3.5 h-3.5 stroke-3" />
          Entrée Stock
        </RouterLink>
      </div>
    </div>

    <div v-if="totalAlertes > 0" class="bg-red-50 text-red-700 border border-red-100 p-4 rounded-xl flex items-center gap-2.5 shadow-2xs font-semibold">
      <AlertTriangle class="w-4 h-4 text-red-600 shrink-0" />
      <span>Attention : {{ totalAlertes }} produit(s) requiert(ent) un réapprovisionnement immédiat auprès de vos grossistes.</span>
    </div>

    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 bg-white p-4 rounded-2xl shadow-2xs">
        <div v-if="!filteredInventory || filteredInventory.length === 0" class="text-center py-2 text-sm text-gris">
            Aucun produit ne correspond à votre recherche actuelle.
        </div>

        <div class="flex items-center gap-4 text-xs font-semibold text-gray-500">
            <div class="flex items-center gap-2">
              <span>Articles en Stock :</span>
              <span class="px-2.5 py-1 bg-foret/10 text-foret rounded-full font-bold text-[11px]">
                {{ inventaireRaw?.length || 0 }}
              </span>
            </div>
            <div class="w-px h-4 bg-gray-200"></div>
            <div class="flex items-center gap-2">
              <span class="text-red-500">Alertes Actives :</span>
              <span class="px-2.5 py-1 bg-red-50 text-red-600 rounded-full font-bold text-[11px] border border-red-100">
                {{ totalAlertes }}
              </span>
            </div>
        </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      
      <div :class="[showDetailPanel ? 'lg:col-span-2' : 'lg:col-span-3', 'bg-white rounded-2xl border border-gray-100 shadow-3xs overflow-hidden transition-all']">
        <div v-if="isLoading" class="text-sm font-medium text-gray-500 p-8 text-center">
          Calcul des volumes cumulés en entrepôt...
        </div>
    
        <div v-else-if="isError" class="p-4 bg-red-50 text-red-700 text-sm rounded-xl border border-red-100">
          Erreur : {{ error?.message || "Impossible de générer le bilan de l'inventaire." }}
        </div>

        <div v-else class="p-4 overflow-x-auto">
            <table class="w-full text-left border-collapse">
            <thead>
                <tr class="bg-gray-50/70 border-b border-gray-100 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                <th class="py-3 px-4">Produit référencé</th>
                <th class="py-3 px-4 text-right">Volume Global restant</th>
                <th class="py-3 px-4 text-right hidden md:table-cell">Seuil Sécurité</th>
                <th class="py-3 px-4 text-center hidden sm:table-cell">Lots actifs</th>
                <th class="py-3 px-4 text-center">Statut</th>
                <th class="py-3 px-4 text-center">Détails</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-50 text-noir">
                <tr v-for="item in filteredInventory" :key="item.productId" :class="[item.enAlerte ? 'bg-red-50/20 hover:bg-red-50/40' : 'hover:bg-gray-50/50', 'transition-colors']">
                
                <td class="py-3 px-4 font-bold text-gray-900">{{ item.nom }}</td>
                
                <td class="py-3 px-4 text-right font-mono font-bold" :class="item.enAlerte ? 'text-red-600' : 'text-gray-700'">
                  {{ item.stockTotal }} <span class="text-[10px] text-gray-400 font-sans font-medium">{{ item.unite }}</span>
                </td>
                
                <td class="py-3 px-4 text-right font-mono text-gray-400 hidden md:table-cell">
                  {{ item.seuilAlerte }} <span class="text-[10px] font-sans">{{ item.unite }}</span>
                </td>

                <td class="py-3 px-4 text-center hidden sm:table-cell">
                  <span class="px-2 py-0.5 bg-gray-100 text-gray-600 rounded font-mono text-[11px] border border-gray-200">
                    {{ item.nbLotsActifs }}
                  </span>
                </td>

                <td class="py-3 px-4 text-center">
                  <span v-if="item.enAlerte" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[10px] bg-red-100 text-red-700 border border-red-200 uppercase tracking-wide">
                    Rupture proche
                  </span>
                  <span v-else class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[10px] bg-green-50 text-green-700 border border-green-100 uppercase tracking-wide">
                    Disponible
                  </span>
                </td>

                <td class="py-3 px-4 text-center">
                    <button @click="openDetailMode(item)" class="cursor-pointer p-1.5 text-gray-400 hover:text-noir hover:bg-gray-100 rounded-lg transition-colors" title="Consulter la fiche">
                        <Eye class="w-3.5 h-3.5" />
                    </button>
                </td>
                </tr>
            </tbody>
            </table>
        </div>   
      </div>

      <div v-if="showDetailPanel && selectedItem" class="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4 animate-fadeIn sticky top-6">
        
        <div class="flex items-center justify-between border-b pb-2.5">
          <h3 class="font-bold text-noir text-sm">Analyse d'inventaire</h3>
          <button @click="closePanels" class="p-1 bg-gray-50 hover:bg-gray-100 rounded-lg text-gray-400 transition-all">
            <X class="w-3.5 h-3.5" />
          </button>
        </div>

        <div class="space-y-4 text-xs">
          <div class="space-y-1">
            <span class="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Référence Produit ID</span>
            <p class="font-mono bg-gray-50 p-2 rounded-lg text-gray-500 select-all">{{ selectedItem.productId }}</p>
          </div>
          
          <div class="space-y-1">
            <span class="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Libellé</span>
            <p class="text-noir font-bold text-sm">{{ selectedItem.nom }}</p>
          </div>

          <div class="p-3.5 rounded-xl border flex items-start gap-2.5" :class="selectedItem.enAlerte ? 'bg-red-50/50 border-red-100 text-red-800' : 'bg-green-50/30 border-green-100 text-green-800'">
            <AlertTriangle v-if="selectedItem.enAlerte" class="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
            <CheckCircle2 v-else class="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p class="font-bold text-[11px] uppercase tracking-wide">
                {{ selectedItem.enAlerte ? 'Réapprovisionnement Urgent' : 'Niveau de Stock Correct' }}
              </p>
              <p class="text-[11px] opacity-90 mt-0.5">
                {{ selectedItem.enAlerte ? 'Le volume physique global est descendu en-dessous ou est égal au seuil de sécurité imposé pour la composition des packs d\'Ahitché.' : 'Le stock disponible permet de couvrir la préparation des formules et packs d\'abonnements en cours.' }}
              </p>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 pt-1">
            <div class="bg-[#f9f9fb] p-3 rounded-xl border border-gray-100">
              <span class="text-[9px] uppercase font-bold text-gray-400 block">Total en rayon</span>
              <p class="text-noir font-mono font-bold text-base mt-0.5">
                {{ selectedItem.stockTotal }} <span class="text-xs font-sans font-medium text-gray-400">{{ selectedItem.unite }}</span>
              </p>
            </div>
            <div class="bg-[#f9f9fb] p-3 rounded-xl border border-gray-100">
              <span class="text-[9px] uppercase font-bold text-gray-400 block">Seuil critique</span>
              <p class="text-gray-700 font-mono font-bold text-base mt-0.5">
                {{ selectedItem.seuilAlerte }} <span class="text-xs font-sans font-medium text-gray-400">{{ selectedItem.unite }}</span>
              </p>
            </div>
          </div>

          <div class="space-y-1 bg-gray-50/50 p-3 rounded-xl border border-gray-100">
            <span class="text-[10px] uppercase font-bold text-gray-400 tracking-wider block">Dispersion physique</span>
            <p class="text-gray-700 font-medium leading-relaxed">
              Ce volume global est actuellement réparti et segmenté sur <span class="font-bold text-noir">{{ selectedItem.nbLotsActifs }} lot(s) physique(s)</span> distinct(s) non vidés et traçables au sein de votre base FIFO.
            </p>
          </div>
        </div>

      </div>

    </div>
  </div>
</template>