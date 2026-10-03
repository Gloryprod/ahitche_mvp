<script setup lang="ts">
import { ref, watch } from 'vue'
import { useQuery, keepPreviousData } from '@tanstack/vue-query'
import type { Client } from '@/type'
import api from '@/stores/api'

// Interface pour la réponse paginée de ton API backend
interface PaginatedClientsResponse {
  users: Client[]
  hasMore: boolean
  total?: number
}

// 1. États réactifs
const page = ref(1)
const search = ref('')
const debouncedSearch = ref('')

// Debounce fait maison (évite d'installer une dépendance lourde)
let timeoutId: ReturnType<typeof setTimeout>
watch(search, (newValue) => {
  clearTimeout(timeoutId)
  timeoutId = setTimeout(() => {
    debouncedSearch.value = newValue
    page.value = 1 // Réinitialise bien la page à chaque nouvelle recherche stable
  }, 400) // Attend 400ms d'inactivité avant de lancer la recherche
})

// 2. Fonction de fetch corrigée avec transmission des Query Params au backend
const fetchUsers = async ({ queryKey }: { queryKey: any }): Promise<PaginatedClientsResponse> => {
  const [_, currentPage, currentSearch] = queryKey
  
  const response = await api.get('/api/admin/users', {
    params: {
      page: currentPage,
      search: currentSearch,
      limit: 6 // Optionnel : fixe la limite par page
    }
  })
  
  if (!response?.data) throw new Error('Aucune donnée reçue du serveur')
  return response.data
}

// 3. Gestion de la requête (Syntaxe TanStack Query v5 conforme)
const { data, isLoading, isError, error, isPlaceholderData } = useQuery({
  // On écoute 'debouncedSearch' au lieu de 'search' direct pour économiser le réseau
  queryKey: ['users', page, debouncedSearch], 
  queryFn: fetchUsers,
  placeholderData: keepPreviousData,
})
</script>

<template>
  <div class="space-y-4">
    <div class="bg-white p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
      <h1 class="font-display font-bold text-xl text-noir">Base Clients</h1>
    </div>

    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-5 transition-opacity duration-200">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4 mb-4">
  
            <div class="flex items-center gap-2 text-xs font-semibold text-gray-500">
                <span>Nombre total de clients</span>
                <span class="px-2.5 py-1 bg-foret/10 text-foret rounded-full font-bold text-[11px]">
                {{ data?.total || 0 }}
                </span>
            </div>

            <div class="relative w-full sm:w-64">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 stroke-[2.5]" />
                
                <input 
                v-model="search"
                type="text" 
                placeholder="Rechercher un client..." 
                class="w-full pl-9 pr-4 py-2 bg-[#f9f9fb] border border-gray-200 rounded-xl text-xs font-medium text-noir placeholder-gray-400 focus:outline-none focus:border-foret focus:bg-white transition-all shadow-2xs"
                />
            </div>

        </div>
        

        <!-- États de chargement et d'erreur -->
        <div v-if="isLoading" class="text-sm font-medium text-gray-500 py-4">
        Chargement initial des clients...
        </div>
    
        <div v-else-if="isError" class="p-4 bg-red-50 text-red-700 text-sm rounded-xl border border-red-100">
        Erreur : {{ error?.message || "Impossible de charger la liste." }}
        </div>

        <!-- Contenu principal -->
        <div v-else :style="{ opacity: isPlaceholderData ? 0.6 : 1 }" class="transition-opacity duration-200">        
            
            <!-- Message si la recherche ne donne aucun résultat -->
            <div v-if="!data?.users || data.users.length === 0" class="text-center py-8 text-sm text-gris">
                Aucun client ne correspond à votre recherche.
            </div>

            <!-- Boucle sur la clé .users de l'objet paginé -->
            <div 
            v-for="client in data?.users" 
            :key="client._id" 
            class="bg-white rounded-2xl p-5 border border-creme2 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:shadow-2xl mb-4"
            >
            <div class="flex gap-4 items-start sm:items-center">
                <div class="w-12 h-12 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-lg font-bold">
                👨‍💻
                </div>
                <div>
                <h3 class="font-bold text-base text-noir flex items-center gap-2">
                    <span>{{ client.username }}</span>
                    <span class="text-[11px] font-bold px-2 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded-md">Actif</span>
                </h3>
                <p class="text-xs text-gris font-medium mt-0.5">📍 {{ client.quartier || 'Non renseigné' }}</p>
                <p class="text-xs text-gris font-normal">📞 {{ client.telephone || 'Non renseigné' }}</p>
                </div>
            </div>
            <div class="text-left sm:text-right border-t sm:border-t-0 border-gray-50 pt-3 sm:pt-0">
                <span class="text-xs text-gray-400 font-medium block">Formule active</span>
                <span class="text-sm font-bold text-foret">{{ client.formuleHabituelle || 'Aucune' }}</span>
            </div>
            </div>

            <!-- Barre de Pagination de style Ahitché -->
            <div class="flex items-center justify-between pt-4 border-t border-gray-100 text-xs font-semibold text-gray-600">
            <button 
                :disabled="page === 1 || isPlaceholderData" 
                @click="page--"
                class="px-4 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
            >
                ← Précédent
            </button>
            
            <span class="bg-gray-100 px-3 py-1.5 rounded-lg text-noir">Page {{ page }}</span>
            
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
</template> 