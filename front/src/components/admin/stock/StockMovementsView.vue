<script setup lang="ts">
import { ref, watch} from 'vue'
import { ArrowUpRight, ArrowDownLeft, AlertCircle, RefreshCw, Layers } from 'lucide-vue-next'
import api from '@/stores/api'
import { useQuery, keepPreviousData } from '@tanstack/vue-query'
import type { Product } from '@/type'

// --- INTERFACES TYPES ---
interface LotId {
  _id: string
  numeroLot: string
}

interface MouvementStock {
  _id: string
  product: Product
  lotId: LotId
  type: 'entree' | 'sortie' | 'correction_negative'
  quantite: number
  motif: string
  createdAt: string
}

interface PaginatedMouvementsResponse {
  mouvements: MouvementStock[]
  hasMore: boolean
}

// --- ÉTATS ---
const page = ref(1)
const typeFiltre = ref('') // '', 'entree', 'sortie', 'correction_negative'

// --- CHARGEMENT DES DONNÉES (TanStack Query v5) ---
const fetchMouvements = async ({ queryKey }: { queryKey: any }): Promise<PaginatedMouvementsResponse> => {
  const [_, currentPage, currentType] = queryKey
  
  const response = await api.get('/api/admin/mouvements', {
    params: {
      page: currentPage,
      type: currentType,
      limit: 10
    }
  })
  
  if (!response?.data) throw new Error('Aucune donnée de mouvement reçue')
  return response.data
}

const { data, isLoading, isError, error, isPlaceholderData } = useQuery({
  queryKey: ['mouvementsStock', page, typeFiltre],
  queryFn: fetchMouvements,
  placeholderData: keepPreviousData,
})

// Réinitialiser la page à 1 si le filtre change
watch(typeFiltre, () => {
  page.value = 1
})

// --- FORMATTAGE ---
const formatDateHeure = (dateStr: string) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<template>
  <div class="space-y-6 animate-fadeIn text-xs font-medium text-gray-600">

    <!-- BARRE D'ENTÊTE & FILTRES -->
    <div class="bg-white p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
      <h1 class="font-display font-bold text-xl text-noir flex items-center gap-2">
        Historique des Mouvements
      </h1>
      
      <!-- Sélecteur de filtre de type de flux -->
      <div class="flex items-center gap-3 w-full sm:w-auto justify-end">
        <label class="text-gray-400 font-bold uppercase text-[10px] tracking-wider hidden sm:inline">Filtrer par :</label>
        <select v-model="typeFiltre" class="px-3 py-2 bg-[#f9f9fb] border border-gray-200 rounded-xl text-xs font-medium text-noir focus:outline-none focus:border-foret focus:bg-white transition-all w-full sm:w-48">
          <option value="">Tous les flux</option>
          <option value="entree">📥 Entrées de stock</option>
          <option value="sortie">📤 Sorties de stock (FIFO)</option>
          <option value="correction_negative">⚠️ Corrections / Suppressions</option>
        </select>
      </div>
    </div>

    <!-- TABLEAU CENTRAL DES MOUVEMENTS -->
    <div class="bg-white rounded-2xl border border-gray-100 shadow-3xs overflow-hidden transition-all">
      <div v-if="isLoading" class="text-sm font-medium text-gray-500 p-8 text-center flex items-center justify-center gap-2">
        <RefreshCw class="w-4 h-4 text-foret animate-spin" /> Récupération du journal des flux...
      </div>
  
      <div v-else-if="isError" class="p-4 bg-red-50 text-red-700 text-sm rounded-xl border border-red-100">
        Erreur : {{ error?.message || "Impossible de charger le flux des mouvements." }}
      </div>

      <div v-else class="p-4">
        <div v-if="!data?.mouvements || data.mouvements.length === 0" class="text-center py-8 text-sm text-gray-400">
          Aucun mouvement de stock enregistré pour ce filtre.
        </div>

        <div v-else class="space-y-4 overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-gray-50/70 border-b border-gray-100 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                <th class="py-3 px-4 text-center w-12">Flux</th>
                <th class="py-3 px-4">Date & Heure</th>
                <th class="py-3 px-4">Produit</th>
                <th class="py-3 px-4">N° de Lot</th>
                <th class="py-3 px-4 text-right">Quantité</th>
                <th class="py-3 px-4 max-w-xs pl-8">Motif / Justification</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50 text-noir">
              <tr v-for="mvt in data.mouvements" :key="mvt._id" class="hover:bg-gray-50/50 transition-colors">
                
                <!-- Icône d'indicateur visuel de flux -->
                <td class="py-3 px-4 text-center">
                  <span v-if="mvt.type === 'entree'" class="inline-flex p-1.5 bg-green-50 text-green-700 rounded-lg border border-green-100" title="Entrée de stock">
                    <ArrowDownLeft class="w-3.5 h-3.5 stroke-[2.5]" />
                  </span>
                  <span v-else-if="mvt.type === 'sortie'" class="inline-flex p-1.5 bg-blue-50 text-blue-700 rounded-lg border border-blue-100" title="Sortie FIFO">
                    <ArrowUpRight class="w-3.5 h-3.5 stroke-[2.5]" />
                  </span>
                  <span v-else class="inline-flex p-1.5 bg-amber-50 text-savane rounded-lg border border-amber-100" title="Ajustement / Correction">
                    <AlertCircle class="w-3.5 h-3.5 stroke-[2.5]" />
                  </span>
                </td>

                <!-- Date & Heure précise -->
                <td class="py-3 px-4 text-gray-400 font-mono text-[11px]">
                  {{ formatDateHeure(mvt.createdAt) }}
                </td>

                <!-- Nom de l'article -->
                <td class="py-3 px-4 font-bold text-gray-900">
                  {{ mvt.product ? mvt.product.name : 'Produit inconnu' }}
                </td>

                <!-- Numéro du lot ciblé par le FIFO -->
                <td class="py-3 px-4 font-mono text-gray-500">
                  <span v-if="mvt.lotId" class="bg-gray-50 border px-1.5 py-0.5 rounded text-[11px] font-bold">
                    {{ mvt.lotId.numeroLot }}
                  </span>
                  <span v-else class="text-gray-300 italic">aucun</span>
                </td>

                <!-- Volume quantitatif avec couleur conditionnelle -->
                <td class="py-3 px-4 text-right font-mono font-bold text-sm">
                  <span :class="[
                    mvt.type === 'entree' ? 'text-green-600' : '',
                    mvt.type === 'sortie' ? 'text-gray-700' : '',
                    mvt.type === 'correction_negative' ? 'text-amber-600' : ''
                  ]">
                    {{ mvt.type === 'entree' ? '+' : '-' }}{{ mvt.quantite }}
                  </span>
                  <span class="text-[10px] text-gray-400 font-sans font-medium ml-1">
                    {{ mvt.product ? mvt.product.unit : '' }}
                  </span>
                </td>

                <!-- Description / Traçabilité de l'action -->
                <td class="py-3 px-4 max-w-xs text-gray-500 font-normal pl-8 truncate" :title="mvt.motif">
                  {{ mvt.motif }}
                </td>

              </tr>
            </tbody>
          </table>

          <!-- COMPOSANT PAGINATION FLUIDE -->
          <div class="flex items-center justify-between pt-4 border-t border-gray-100 text-xs font-semibold text-gray-600">
            <button 
              :disabled="page === 1 || isPlaceholderData" 
              @click="page--"
              class="px-4 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              ← Précédent
            </button>
            
            <span class="bg-gray-100 px-3 py-1.5 rounded-lg text-noir font-mono">Page {{ page }}</span>
            
            <button 
              :disabled="!data?.hasMore || isPlaceholderData" 
              @click="page++"
              class="px-4 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              Suivant →
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>