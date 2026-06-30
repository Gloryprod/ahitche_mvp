<script setup lang="ts">
import { ref, watch } from 'vue'
import { Search, Plus, Edit2, Trash2, Eye, X } from 'lucide-vue-next'
import api from '@/stores/api'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/vue-query'
import Swal from 'sweetalert2'
import type { CompositionRule } from '@/type'

interface PaginatedRuleResponse {
  rules: CompositionRule[]
  hasMore: boolean
  total?: number
}

// --- ÉTATS ---
const page = ref(1)
const search = ref('')
const debouncedSearch = ref('')
const isSubmitting = ref(false)
const notification = ref({ text: '', type: '' })
const queryClient = useQueryClient()

const showFormPanel = ref(false)
const isEditing = ref(false)
const showDetailPanel = ref(false)
const selectedRule = ref<CompositionRule | null>(null)

// Structure de données du formulaire
const form = ref({
  _id: '',
  name: '',
  multiplierEquilibre: 2,
  multiplierConfort: 5,
  description: ''
})

// Debounce pour optimiser la recherche
let timeoutId: ReturnType<typeof setTimeout>
watch(search, (newValue) => {
  clearTimeout(timeoutId)
  timeoutId = setTimeout(() => {
    debouncedSearch.value = newValue
    page.value = 1
  }, 400)
})

// --- CHARGEMENT ---
const fetchRules = async ({ queryKey }: { queryKey: any }): Promise<PaginatedRuleResponse> => {
  const [_, currentPage, currentSearch] = queryKey
  const response = await api.get('/api/admin/composition-rules', {
    params: {
      page: currentPage,
      search: currentSearch,
      limit: 10
    }
  })
  if (!response?.data) throw new Error('Aucune donnée reçue du serveur')
  return response.data
}

const { data, isLoading, isError, error, isPlaceholderData } = useQuery({
  queryKey: ['composition-rules', page, debouncedSearch],
  queryFn: fetchRules,
  placeholderData: keepPreviousData,
})

// --- ACTIONS ---
const openCreateMode = () => {
  isEditing.value = false
  showDetailPanel.value = false
  form.value = { _id: '', name: '', multiplierEquilibre: 2, multiplierConfort: 5, description: '' }
  showFormPanel.value = true
}

const openEditMode = (rule: CompositionRule) => {
  isEditing.value = true
  showDetailPanel.value = false
  form.value = {
    _id: rule._id,
    name: rule.name,
    multiplierEquilibre: rule.multiplierEquilibre,
    multiplierConfort: rule.multiplierConfort,
    description: rule.description ?? '' // Sécurise le undefined en chaîne vide
    }
  showFormPanel.value = true
}

const openDetailMode = (rule: CompositionRule) => {
  selectedRule.value = rule
  showFormPanel.value = false
  showDetailPanel.value = true
}

const closePanels = () => {
  showFormPanel.value = false
  showDetailPanel.value = false
  selectedRule.value = null
}

const handleSubmit = async () => {
  isSubmitting.value = true
  try {
    if (isEditing.value) {
      await api.put(`/api/admin/composition-rules/${form.value._id}`, form.value)
      showNotification("Règle modifiée avec succès !", "success")
    } else {
      await api.post('/api/admin/composition-rules', form.value)
      showNotification("Nouvelle règle créée !", "success")
    }
    queryClient.invalidateQueries({ queryKey: ['composition-rules'] })
    closePanels()
  } catch (err: any) {
    showNotification(err.response?.data?.message || "Une erreur est survenue", "error")
  } finally {
    isSubmitting.value = false
  }
}

const deleteRule = async (id: string) => {
  const result = await Swal.fire({
    title: 'Es-tu sûr de vouloir supprimer cette règle ?',
    text: "Vérifie qu'aucun produit n'utilise cette règle actuellement.",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#1e3a1f',
    cancelButtonColor: '#d33',
    confirmButtonText: 'Oui, supprimer',
    cancelButtonText: 'Annuler',
    customClass: { popup: 'rounded-2xl font-body' }
  });

  if (result.isConfirmed) {
    try {
      await api.delete(`/api/admin/composition-rules/${id}`)
      showNotification("Règle supprimée avec succès", "success")
      queryClient.invalidateQueries({ queryKey: ['composition-rules'] })
      if (selectedRule.value?._id === id) closePanels()
    } catch (err) {
      showNotification("Impossible de supprimer cette règle", "error")
    }
  }
}

const showNotification = (text: string, type: string) => {
  notification.value = { text, type }
  setTimeout(() => notification.value = { text: '', type: '' }, 4000)
}
</script>

<template>
  <div class="space-y-6 animate-fadeIn text-xs font-medium text-gray-600">
    
    <!-- EN-TÊTE ACTIONNABLE -->
    <div class="bg-white p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
      <h1 class="font-display font-bold text-xl text-noir">Règles de Composition</h1>
      <div class="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
        <div class="relative w-full sm:w-60">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 stroke-[2.5]" />
          <input v-model="search" type="text" placeholder="Rechercher une famille ou règle..." class="w-full pl-9 pr-4 py-2 bg-[#f9f9fb] border border-gray-200 rounded-xl text-xs font-medium text-noir focus:outline-none focus:border-foret focus:bg-white transition-all" />
        </div>
        <button @click="openCreateMode" class="cursor-pointer flex items-center gap-1.5 px-4 py-2 bg-foret text-white text-xs font-bold rounded-xl hover:bg-opacity-95 transition-all shadow-sm shrink-0">
          <Plus class="w-3.5 h-3.5 stroke-3" />
          Ajouter
        </button>
      </div>
    </div>
    
    <!-- NOTIFICATIONS -->
    <div v-if="notification.text" :class="[notification.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200', 'p-4 rounded-xl border text-xs font-semibold shadow-2xs fixed top-4 right-4 z-50 max-w-sm']">
      {{ notification.text }}
    </div>

    <!-- METRIQUES -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 bg-white p-4 rounded-2xl shadow-2xs">
      <div v-if="!data?.rules || data.rules.length === 0" class="text-center py-2 text-sm text-gray-400">
        Aucune règle de composition trouvée.
      </div>
      <div class="flex items-center gap-2 text-xs font-semibold text-gray-500">
        <span>Familles de règles actives</span>
        <span class="px-2.5 py-1 bg-foret/10 text-foret rounded-full font-bold text-[11px]">
          {{ data?.total || 0 }}
        </span>
      </div>
    </div>

    <!-- GRILLE DE PRESENTATION ASYMETRIQUE -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      
      <!-- TABLEAU DES REGLES -->
      <div :class="[showFormPanel || showDetailPanel ? 'lg:col-span-2' : 'lg:col-span-3', 'bg-white rounded-2xl border border-gray-100 shadow-3xs overflow-hidden transition-all']">
        <div v-if="isLoading" class="text-sm font-medium text-gray-500 p-6 text-center">
          Chargement des règles de composition...
        </div>
        <div v-else-if="isError" class="p-4 bg-red-50 text-red-700 text-sm rounded-xl border border-red-100 m-4">
          Erreur : {{ error?.message || "Impossible de charger les règles." }}
        </div>

        <div v-else class="p-4 overflow-x-auto">
          <table class="w-full text-left border-collapse min-w-125">
            <thead>
              <tr class="bg-gray-50/70 border-b border-gray-100 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                <th class="py-3 px-4">Nom de la règle</th>
                <th class="py-3 px-4 text-center">Multiplicateur Équilibré</th>
                <th class="py-3 px-4 text-center">Multiplicateur Confort</th>
                <th class="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50 text-noir">
              <tr v-for="rule in data?.rules" :key="rule._id" class="hover:bg-gray-50/50 transition-colors">
                <td class="py-3 px-4 font-bold">
                  <div>{{ rule.name }}</div>
                  <span class="text-[10px] text-gray-400 font-normal block max-w-xs truncate">{{ rule.description || 'Pas de description' }}</span>
                </td>
                <td class="py-3 px-4 text-center font-mono text-gray-700">× {{ rule.multiplierEquilibre }}</td>
                <td class="py-3 px-4 text-center font-mono text-gray-700">× {{ rule.multiplierConfort }}</td>
                <td class="py-3 px-4">
                  <div class="flex items-center justify-center gap-2">
                    <button @click="openDetailMode(rule)" class="cursor-pointer p-1.5 text-gray-400 hover:text-noir hover:bg-gray-100 rounded-lg transition-colors shadow-2xs">
                      <Eye class="w-3.5 h-3.5" />
                    </button>
                    <button @click="openEditMode(rule)" class="cursor-pointer p-1.5 text-gray-400 hover:text-savane hover:bg-amber-50 rounded-lg transition-colors shadow-2xs">
                      <Edit2 class="w-3.5 h-3.5" />
                    </button>
                    <button @click="deleteRule(rule._id)" class="cursor-pointer p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shadow-2xs">
                      <Trash2 class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <!-- PAGINATION -->
          <div class="flex items-center justify-between pt-4 border-t border-gray-100 text-xs font-semibold text-gray-600 mt-4">
            <button :disabled="page === 1 || isPlaceholderData" @click="page--" class="px-4 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm">
              ← Précédent
            </button>
            <span class="bg-gray-100 px-3 py-1.5 rounded-lg text-noir">Page {{ page }}</span>
            <button :disabled="!data?.hasMore || isPlaceholderData" @click="page++" class="px-4 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm">
              Suivant →
            </button>
          </div>
        </div>
      </div>

      <!-- TIROIR DYNAMIQUE (EDITION / CRÉATION / DETAILS) -->
      <div v-if="showFormPanel || showDetailPanel" class="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4 animate-fadeIn sticky top-6">
        <div class="flex items-center justify-between border-b pb-2.5">
          <h3 class="font-bold text-noir text-sm">
            <span v-if="showFormPanel">{{ isEditing ? 'Modifier la règle' : 'Créer une règle' }}</span>
            <span v-else>Détails de la règle</span>
          </h3>
          <button @click="closePanels" class="p-1 bg-gray-50 hover:bg-gray-100 rounded-lg text-gray-400 transition-all">
            <X class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- FORMULAIRE DE MANAGEMENT -->
        <form v-if="showFormPanel" @submit.prevent="handleSubmit" class="space-y-4">
          <div>
            <label class="block mb-1.5 font-bold text-noir text-[10px] uppercase">Nom de la famille de règle</label>
            <input v-model="form.name" type="text" placeholder="ex: Standard, Condiments..." class="w-full px-3 py-2 bg-[#f9f9fb] border border-gray-200 rounded-lg focus:outline-none focus:border-foret" required />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block mb-1.5 font-bold text-noir text-[10px] uppercase">Multiplicateur Équilibré</label>
              <input v-model.number="form.multiplierEquilibre" type="number" step="0.1" class="w-full px-3 py-2 bg-[#f9f9fb] border border-gray-200 rounded-lg focus:outline-none focus:border-foret" required />
            </div>
            <div>
              <label class="block mb-1.5 font-bold text-noir text-[10px] uppercase">Multiplicateur Confort</label>
              <input v-model.number="form.multiplierConfort" type="number" step="0.1" class="w-full px-3 py-2 bg-[#f9f9fb] border border-gray-200 rounded-lg focus:outline-none focus:border-foret" required />
            </div>
          </div>
          <div>
            <label class="block mb-1.5 font-bold text-noir text-[10px] uppercase">Description / Notes d'usage</label>
            <textarea v-model="form.description" rows="3" placeholder="Quels produits ou contraintes s'appliquent à cette règle ?" class="w-full px-3 py-2 bg-[#f9f9fb] border border-gray-200 rounded-lg focus:outline-none focus:border-foret resize-none"></textarea>
          </div>
          <button type="submit" :disabled="isSubmitting" class="cursor-pointer w-full py-2.5 bg-foret text-white text-xs font-bold rounded-xl hover:bg-opacity-95 transition-all shadow-sm disabled:opacity-50">
            {{ isSubmitting ? 'Enregistrement...' : (isEditing ? 'Enregistrer les modifications' : 'Créer la règle') }}
          </button>
        </form>

        <!-- VIEW DETAILS -->
        <div v-if="showDetailPanel && selectedRule" class="space-y-4 text-xs">
          <div class="space-y-1">
            <span class="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Identifiant Interne</span>
            <p class="font-mono bg-gray-50 p-2 rounded-lg text-gray-500 select-all">{{ selectedRule._id }}</p>
          </div>
          <div class="space-y-1">
            <span class="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Nom de la famille</span>
            <p class="text-noir font-bold text-sm">{{ selectedRule.name }}</p>
          </div>
          <div class="grid grid-cols-2 gap-2 bg-gray-50/50 p-3 rounded-xl border border-gray-100">
            <div>
              <span class="text-[9px] uppercase font-bold text-gray-400 block">Coeff Équilibré</span>
              <span class="text-sm font-bold text-noir">× {{ selectedRule.multiplierEquilibre }}</span>
            </div>
            <div>
              <span class="text-[9px] uppercase font-bold text-gray-400 block">Coeff Confort</span>
              <span class="text-sm font-bold text-noir">× {{ selectedRule.multiplierConfort }}</span>
            </div>
          </div>
          <div class="space-y-1">
            <span class="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Notes structurelles</span>
            <p class="text-gray-500 bg-gray-50/60 p-3 rounded-lg border border-gray-100 leading-relaxed">
              {{ selectedRule.description || 'Aucun détail technique particulier spécifié.' }}
            </p>
          </div>
          <div class="pt-2">
            <button @click="openEditMode(selectedRule!)" class="w-full py-2 bg-amber-50 text-savane font-bold rounded-xl hover:bg-amber-100/70 border border-amber-200 transition-colors flex items-center justify-center gap-1">
              <Edit2 class="w-3 h-3" /> Modifier les valeurs
            </button>
          </div>
        </div>

      </div>

    </div>
  </div>
</template>