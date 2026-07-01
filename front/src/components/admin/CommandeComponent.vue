<script setup lang="ts">
import { ref, watch} from 'vue'
import api from '@/stores/api'
import { useQuery, keepPreviousData } from '@tanstack/vue-query'
import CommandeForm from '@/components/admin/CommandeForm.vue'
import type { Client, Commande } from '@/type'

interface PaginatedCommandesResponse {
  orders: Commande[]
  hasMore: boolean
  total?: number
}

interface PaginatedClientsResponse {
  users: Client[]
  hasMore: boolean
  total?: number
}

// États réactifs
const statutActif = ref('Toutes')
const page = ref(1)
const search = ref('')
const debouncedSearch = ref('')
const isModalOpen = ref(false)
const notification = ref({ text: '', type: '' })


// Debounce pour l'input de recherche
let timeoutId: ReturnType<typeof setTimeout>
watch(search, (newValue) => {
  clearTimeout(timeoutId)
  timeoutId = setTimeout(() => {
    debouncedSearch.value = newValue
    page.value = 1 
  }, 400)
})

// On remet la page à 1 si le filtre de statut change
watch(statutActif, () => {
  page.value = 1
})

// 2. Renommage de la fonction pour éviter le conflit avec le fetch natif
const fetchCommandes = async ({ queryKey }: { queryKey: any }): Promise<PaginatedCommandesResponse> => {
  const [_, currentPage, currentSearch, currentStatut] = queryKey
  
  const response = await api.get('/api/admin/commandes', {
    params: {
      page: currentPage,
      search: currentSearch,
      limit: 10, 
      statut: currentStatut
    }
  })
  
  if (!response?.data) throw new Error('Aucune donnée reçue du serveur')
  return response.data
}

// 2. Fonction de fetch corrigée avec transmission des Query Params au backend
const fetchUsers = async ({ queryKey }: { queryKey: any }): Promise<PaginatedClientsResponse> => {
  const [_, currentPage, currentSearch] = queryKey
  
  const response = await api.get('/api/admin/users', {
    params: {
      page: currentPage,
      search: currentSearch,
      limit: 10 // Optionnel : fixe la limite par page
    }
  })
  
  if (!response?.data) throw new Error('Aucune donnée reçue du serveur')
  return response.data
}

// 3. Gestion de la requête (Correction du queryKey réactif)
const { data, isLoading, isError, error, isPlaceholderData } = useQuery({
  // ✅ PAS DE .value ICI, on passe la ref globale pour que Tanstack l'observe !
  queryKey: ['orders', page, debouncedSearch, statutActif], 
  queryFn: fetchCommandes,
  placeholderData: keepPreviousData,
})

const { data: dataUsers } = useQuery({
  // On écoute 'debouncedSearch' au lieu de 'search' direct pour économiser le réseau
  queryKey: ['users', page, debouncedSearch], 
  queryFn: fetchUsers,
})

const getStatutClass = (statut: Commande['statut']) => {
  switch (statut) {
    case 'En attente': return 'bg-amber-100 text-amber-800 border border-amber-200'
    case 'Livré': return 'bg-green-100 text-green-700 border border-green-200'
    default: return 'bg-gray-100 text-gray-700'
  }
}
const paiementStyles: Record<string, string> = {
  'Mobile Money': 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
  'Espèces': 'bg-amber-50 text-amber-700 border-amber-200/60',
  'Acompte': 'bg-sky-50 text-sky-700 border-sky-200/60'
}

const showNotification = (text: string, type: string) => {
  notification.value = { text, type }
  setTimeout(() => notification.value = { text: '', type: '' }, 4000)
}

const handleOrderSuccess = () => {
  showNotification("Commande enregistrée avec succès", "success")
}

</script>

<template>
  <div class="space-y-6">
    <div class="bg-white p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
      <h1 class="font-display font-bold text-xl text-noir">Commandes & Clients</h1>

      <button @click="isModalOpen = true" class="cursor-pointer px-4 py-2 bg-foret text-white text-xs font-bold rounded-lg hover:bg-opacity-95 transition-all shadow-sm flex items-center gap-1">
        + Nouvelle commande
      </button>
    </div>

    <div v-if="notification.text" :class="[notification.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200', 'p-4 rounded-xl border text-xs font-semibold shadow-2xs fixed top-4 right-4 z-50 max-w-sm']">
      {{ notification.text }}
    </div>

    <div v-if="isLoading" class="text-sm font-medium text-gray-500 py-12 text-center bg-white rounded-2xl border border-gray-100 shadow-sm">
      <span class="inline-block animate-pulse">Chargement initial des commandes...</span>
    </div>
    
    <div v-else-if="isError" class="p-4 bg-red-50 text-red-700 text-sm rounded-xl border border-red-100">
      Erreur : {{ error?.message || "Impossible de charger la liste." }}
    </div>

    <div v-else :style="{ opacity: isPlaceholderData ? 0.6 : 1 }" class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-5 transition-opacity duration-200">
      
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-50 pb-2">
        <div class="flex flex-wrap gap-6 text-xs font-semibold text-gray-400">
          <button 
            @click="statutActif = 'Toutes'" 
            :class="['pb-2 border-b-2 transition-all', statutActif === 'Toutes' ? 'border-foret text-foret font-bold' : 'border-transparent hover:text-noir']"
          >
            Toutes
          </button>
          <button 
            @click="statutActif = 'En attente'" 
            :class="['pb-2 border-b-2 transition-all', statutActif === 'En attente' ? 'border-foret text-foret font-bold' : 'border-transparent hover:text-noir']"
          >
            En attente
          </button>
          <button 
            @click="statutActif = 'Livré'" 
            :class="['pb-2 border-b-2 transition-all', statutActif === 'Livrée' ? 'border-foret text-foret font-bold' : 'border-transparent hover:text-noir']"
          >
            Livrées 
          </button>
          <button 
            @click="statutActif = 'Annulé'" 
            :class="['pb-2 border-b-2 transition-all', statutActif === 'Livrée' ? 'border-foret text-foret font-bold' : 'border-transparent hover:text-noir']"
          >
            Annulées
          </button>
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

      <div v-if="!data?.orders || data.orders.length === 0" class="text-center py-12 text-sm text-gris bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
        Aucune commande ne correspond à ces critères.
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="border-b border-gray-100 text-[10px] text-gray-400 font-bold uppercase tracking-wider">
              <th class="py-3 px-2 font-normal">#</th>
              <th class="py-3 px-2 font-normal">Client</th>
              <th class="py-3 px-2 font-normal">Whatsapp</th>
              <th class="py-3 px-2 font-normal">Formule</th>
              <th class="py-3 px-2 font-normal">Total</th>
              <th class="py-3 px-2 font-normal">Mode Paiement</th>
              <th class="py-3 px-2 font-normal">Date</th>
              <th class="py-3 px-2 font-normal">Statut</th>
              <th class="py-3 px-2 font-normal text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50 text-gray-600 font-medium">

            <tr v-for="cmd in data?.orders" :key="cmd.id" class="hover:bg-gray-50/60 transition-colors">
            <td class="py-3.5 px-2 text-gray-400">{{ `#CMD-${cmd.id.substring(cmd.id.length - 4).toUpperCase()}` }}</td>
            <td class="py-3.5 px-2 text-noir font-bold">{{ cmd.clientName }}</td>
            <td class="py-3.5 px-2 text-gray-400 tracking-wide">{{ cmd.whatsapp }}</td>
            <td class="py-3.5 px-2">
            <span class="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[10px] font-bold border border-gray-200/60 uppercase">
                {{ cmd.formule }}
            </span>
            </td>
            <td class="py-3.5 px-2 text-noir font-semibold">
              {{ cmd.total.toLocaleString('fr-FR') }} F
            </td>
            <td class="py-3.5 px-2">
              <span :class="['inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold border', paiementStyles[cmd.modePaiement] || 'bg-gray-50 text-gray-600 border-gray-200']">
                {{ cmd.modePaiement }}
              </span>
            </td>
            <td class="py-3.5 px-2 text-gray-400">{{ cmd.date }}</td>
            <td class="py-3.5 px-2">
            <span :class="[getStatutClass(cmd.statut), 'px-2 py-0.5 rounded text-[10px] font-bold shadow-xs']">
                {{ cmd.statut }}
            </span>
            </td>
            <td class="py-3.5 px-2 text-right">
            <button class="px-3 py-1 border border-gray-200 rounded text-[11px] font-bold text-noir bg-white hover:bg-gray-50 transition-all shadow-2xs">
                Voir
            </button>
            </td>
            </tr>
            
          </tbody>
        </table>

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
    <CommandeForm 
        :open="isModalOpen" 
        :clients="dataUsers?.users || []" 
        @close="isModalOpen = false" 
        @success="handleOrderSuccess" 
      />
  </div>
</template>