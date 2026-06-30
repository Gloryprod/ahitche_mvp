<script setup lang="ts">
import { ref, watch } from 'vue'
import { Search, Plus, Edit2, Trash2, Eye, X } from 'lucide-vue-next'
import api from '@/stores/api'
import type { Category } from '@/type'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/vue-query'
import Swal from 'sweetalert2'

// --- ÉTATS ---
const page = ref(1)
const search = ref('')
const debouncedSearch = ref('')
const isSubmitting = ref(false)
const notification = ref({ text: '', type: '' })
const queryClient = useQueryClient()

// Gestion de l'affichage du Formulaire unique (Ajout / Modification)
const showFormPanel = ref(false)
const isEditing = ref(false)

// Gestion de l'affichage des Détails
const showDetailPanel = ref(false)
const selectedCategory = ref<Category | null>(null)

// Structure de données du formulaire
const form = ref({
  _id: '',
  name: '',
  description: '',
  active: true
})

interface PaginatedCategoryResponse {
  categories: Category[]
  hasMore: boolean
  total?: number
}

// Debounce fait maison (évite d'installer une dépendance lourde)
let timeoutId: ReturnType<typeof setTimeout>
watch(search, (newValue) => {
  clearTimeout(timeoutId)
  timeoutId = setTimeout(() => {
    debouncedSearch.value = newValue
    page.value = 1 // Réinitialise bien la page à chaque nouvelle recherche stable
  }, 400) // Attend 400ms d'inactivité avant de lancer la recherche
})

// --- CHARGEMENT ---
const fetchCategories = async ({ queryKey }: { queryKey: any }): Promise<PaginatedCategoryResponse> => {
  const [_, currentPage, currentSearch] = queryKey
  
  const response = await api.get('/api/admin/categories', {
    params: {
      page: currentPage,
      search: currentSearch,
      limit: 10 // Optionnel : fixe la limite par page
    }
  })
  
  if (!response?.data) throw new Error('Aucune donnée reçue du serveur')
  return response.data
}

// 3. Gestion de la requête (Syntaxe TanStack Query v5 conforme)
const { data, isLoading, isError, error, isPlaceholderData } = useQuery({
  // On écoute 'debouncedSearch' au lieu de 'search' direct pour économiser le réseau
  queryKey: ['categories', page, debouncedSearch], 
  queryFn: fetchCategories,
  placeholderData: keepPreviousData,
})

// --- ACTIONS ---
const openCreateMode = () => {
  isEditing.value = false
  showDetailPanel.value = false
  form.value = { _id: '', name: '', description: '', active: true }
  showFormPanel.value = true
}

const openEditMode = (category: Category) => {
  isEditing.value = true
  showDetailPanel.value = false
  form.value = { ...category }
  showFormPanel.value = true
}

const openDetailMode = (category: Category) => {
  selectedCategory.value = category
  showFormPanel.value = false
  showDetailPanel.value = true
}

const closePanels = () => {
  showFormPanel.value = false
  showDetailPanel.value = false
  selectedCategory.value = null
}

const handleSubmit = async () => {
  isSubmitting.value = true
  try {
    if (isEditing.value) {
      // Modification
      await api.put(`/api/admin/categories/${form.value._id}`, form.value)
      showNotification("Catégorie modifiée avec succès !", "success")
    } else {
      // Création
      await api.post('/api/admin/categories', form.value)
      showNotification("Nouvelle catégorie créée !", "success")
    }
    queryClient.invalidateQueries({ queryKey: ['categories'] })
    closePanels()
  } catch (error: any) {
    showNotification(error.response?.data?.message || "Une erreur est survenue", "error")
  } finally {
    isSubmitting.value = false
  }
}

const deleteCategory = async (id: string) => {
  const result = await Swal.fire({
    title: 'Es-tu sûr de vouloir supprimer cette catégorie ?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#1e3a1f',
    cancelButtonColor: '#d33',
    confirmButtonText: 'Oui, supprimer',
    cancelButtonText: 'Annuler',
    background: '#ffffff',
    customClass: {
      popup: 'rounded-2xl font-body'
    }
  });

  if (result.isConfirmed) {
    isLoading.value = true;
    try {
      await api.delete(`/api/admin/categories/${id}`)
      showNotification("Catégorie supprimée", "success")
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      if (selectedCategory.value?._id === id) closePanels()
    } catch (error) {
      showNotification("Impossible de supprimer cette catégorie", "error")
    } finally {
      isLoading.value = false;
    }
  }
}

// --- UTILS ---
const showNotification = (text: string, type: string) => {
  notification.value = { text, type }
  setTimeout(() => notification.value = { text: '', type: '' }, 4000)
}

</script>

<template>
  <div class="space-y-6 animate-fadeIn text-xs font-medium text-gray-600">

    <div class="bg-white p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
      <h1 class="font-display font-bold text-xl text-noir">Catégories de Produit</h1>
      <div class="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
        <div class="relative w-full sm:w-60">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 stroke-[2.5]" />
          <input v-model="search" type="text" placeholder="Rechercher une catégorie..." class="w-full pl-9 pr-4 py-2 bg-[#f9f9fb] border border-gray-200 rounded-xl text-xs font-medium text-noir focus:outline-none focus:border-foret focus:bg-white transition-all" />
        </div>
        <button @click="openCreateMode" class="cursor-pointer flex items-center gap-1.5 px-4 py-2 bg-foret text-white text-xs font-bold rounded-xl hover:bg-opacity-95 transition-all shadow-sm shrink-0">
          <Plus class="w-3.5 h-3.5 stroke-3" />
          Ajouter
        </button>
      </div>
    </div>
    
    <div v-if="notification.text" :class="[notification.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200', 'p-4 rounded-xl border text-xs font-semibold shadow-2xs fixed top-4 right-4 z-50 max-w-sm']">
      {{ notification.text }}
    </div>

    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 bg-white p-4 rounded-2xl shadow-2xs">
        <!-- Message si la recherche ne donne aucun résultat -->
        <div v-if="!data?.categories || data.categories.length === 0" class="text-center py-8 text-sm text-gris">
            Aucune catégorie ne correspond à votre recherche.
        </div>

        <div class="flex items-center gap-2 text-xs font-semibold text-gray-500">
            <span>Catégories de produits</span>
            <span class="px-2.5 py-1 bg-foret/10 text-foret rounded-full font-bold text-[11px]">
            {{ data?.categories.length }}
            </span>
        </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      
      <div :class="[showFormPanel || showDetailPanel ? 'lg:col-span-2' : 'lg:col-span-3', 'bg-white rounded-2xl border border-gray-100 shadow-3xs overflow-hidden transition-all']">
        <div v-if="isLoading" class="text-sm font-medium text-gray-500 py-4">
        Chargement initial des catégories...
        </div>
    
        <div v-else-if="isError" class="p-4 bg-red-50 text-red-700 text-sm rounded-xl border border-red-100">
        Erreur : {{ error?.message || "Impossible de charger la liste." }}
        </div>

        <div v-else class="p-4">
        
            <table class="w-full text-left border-collapse">
            <thead>
                <tr class="bg-gray-50/70 border-b border-gray-100 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                <th class="py-3 px-4">Nom de la catégorie</th>
                <th class="py-3 px-4 hidden md:table-cell">Description</th>
                <th class="py-3 px-4 text-center">Actions</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-50 text-noir">
                <tr v-for="cat in data?.categories" :key="cat._id" class="hover:bg-gray-50/50 transition-colors">
                <td class="py-3 px-4 font-bold">{{ cat.name }}</td>
                <td class="py-3 px-4 text-gray-400 truncate max-w-50] hidden md:table-cell">
                    {{ cat.description || 'Aucune description' }}
                </td>
                <td class="py-3 px-4">
                    <div class="flex items-center justify-center gap-2">
                    <button @click="openDetailMode(cat)" class="cursor-pointer p-1.5 text-gray-400 hover:text-noir hover:bg-gray-100 rounded-lg transition-colors" title="Détails">
                        <Eye class="w-3.5 h-3.5" />
                    </button>
                    <button @click="openEditMode(cat)" class="cursor-pointer p-1.5 text-gray-400 hover:text-savane hover:bg-amber-50 rounded-lg transition-colors" title="Modifier">
                        <Edit2 class="w-3.5 h-3.5" />
                    </button>
                    <button @click="deleteCategory(cat._id)" class="cursor-pointer p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Supprimer">
                        <Trash2 class="w-3.5 h-3.5" />
                    </button>
                    </div>
                </td>
                </tr>
            </tbody>
            </table>
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

      <div v-if="showFormPanel || showDetailPanel" class="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4 animate-fadeIn sticky top-6">
        
        <div class="flex items-center justify-between border-b pb-2.5">
          <h3 class="font-bold text-noir text-sm">
            <span v-if="showFormPanel">{{ isEditing ? 'Modifier la catégorie' : 'Créer une catégorie' }}</span>
            <span v-else>Détails de la catégorie</span>
          </h3>
          <button @click="closePanels" class="p-1 bg-gray-50 hover:bg-gray-100 rounded-lg text-gray-400 transition-all">
            <X class="w-3.5 h-3.5" />
          </button>
        </div>

        <form v-if="showFormPanel" @submit.prevent="handleSubmit" class="space-y-4">
          <div>
            <label class="block mb-1.5 font-bold text-noir text-[10px] uppercase">Nom de la catégorie</label>
            <input v-model="form.name" type="text" placeholder="ex: Céréales, Légumineuses..." class="w-full px-3 py-2 bg-[#f9f9fb] border border-gray-200 rounded-lg focus:outline-none focus:border-foret" required />
          </div>
          <div>
            <label class="block mb-1.5 font-bold text-noir text-[10px] uppercase">Description (Optionnelle)</label>
            <textarea v-model="form.description" rows="3" placeholder="Description courte des produits de ce groupe..." class="w-full px-3 py-2 bg-[#f9f9fb] border border-gray-200 rounded-lg focus:outline-none focus:border-foret resize-none"></textarea>
          </div>
          <button type="submit" :disabled="isSubmitting" class="cursor-pointer w-full py-2.5 bg-foret text-white text-xs font-bold rounded-xl hover:bg-opacity-95 transition-all shadow-sm disabled:opacity-50">
            {{ isSubmitting ? 'Enregistrement...' : (isEditing ? 'Enregistrer les modifications' : 'Créer la catégorie') }}
          </button>
        </form>

        <div v-if="showDetailPanel && selectedCategory" class="space-y-4 text-xs">
          <div class="space-y-1">
            <span class="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Identifiant ID</span>
            <p class="font-mono bg-gray-50 p-2 rounded-lg text-gray-500 select-all">{{ selectedCategory._id }}</p>
          </div>
          <div class="space-y-1">
            <span class="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Nom</span>
            <p class="text-noir font-bold text-sm">{{ selectedCategory.name }}</p>
          </div>
          <div class="space-y-1">
            <span class="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Description</span>
            <p class="text-gray-500 bg-gray-50/60 p-3 rounded-lg border border-gray-100 leading-relaxed">
              {{ selectedCategory.description || 'Aucune description fournie.' }}
            </p>
          </div>
          <div class="pt-2 flex gap-2">
            <button @click="openEditMode(selectedCategory)" class="w-full py-2 bg-amber-50 text-savane font-bold rounded-xl hover:bg-amber-100/70 border border-amber-200 transition-colors flex items-center justify-center gap-1">
              <Edit2 class="w-3 h-3" /> Modifier
            </button>
          </div>
        </div>

      </div>

    </div>
  </div>
</template>