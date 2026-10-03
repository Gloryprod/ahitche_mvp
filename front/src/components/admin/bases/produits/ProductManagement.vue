<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { Search, Plus, Edit2, Trash2, Eye, X } from 'lucide-vue-next'
import api from '@/stores/api'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/vue-query'
import Swal from 'sweetalert2'
import type { Product } from '@/type'
import type { CompositionRule } from '@/type'
import type { Category } from '@/type'

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
const selectedProduct = ref<Product | null>(null)

// Listes pour les sélections du formulaire
const categoriesList = ref<Category[]>([])
const rulesList = ref<CompositionRule[]>([])

// Structure du formulaire
const form = ref({
  _id: '',
  name: '',
  category: '',
  compositionRule: '',
  baseQuantity: 1,
  unit: 'kg',
  priceUnit: 0
})

// Chargement initial des utilitaires pour les listes déroulantes
onMounted(async () => {
  try {
    const [catRes, ruleRes] = await Promise.all([
      api.get('/api/admin/categories?limit=100'),
      api.get('/api/admin/composition-rules?limit=100')
    ])
    categoriesList.value = catRes.data.categories || []
    rulesList.value = ruleRes.data.rules || []
  } catch (err) {
    showNotification("Erreur lors du chargement des options de formulaire", "error")
  }
})

// Debounce pour la recherche
let timeoutId: ReturnType<typeof setTimeout>
watch(search, (newValue) => {
  clearTimeout(timeoutId)
  timeoutId = setTimeout(() => {
    debouncedSearch.value = newValue
    page.value = 1
  }, 400)
})

// --- TANSTACK QUERY ---
const fetchProducts = async ({ queryKey }: { queryKey: any }) => {
  const [_, currentPage, currentSearch] = queryKey
  const response = await api.get('/api/admin/products', {
    params: { page: currentPage, search: currentSearch, limit: 10 }
  })
  return response.data
}

const { data, isLoading, isError, error, isPlaceholderData } = useQuery({
  queryKey: ['products', page, debouncedSearch],
  queryFn: fetchProducts,
  placeholderData: keepPreviousData,
})

// --- ACTIONS ---
const openCreateMode = () => {
  isEditing.value = false
  showDetailPanel.value = false
  form.value = { _id: '', name: '', category: '', compositionRule: '', baseQuantity: 1, unit: 'kg', priceUnit: 0 }
  showFormPanel.value = true
}

const openEditMode = (product: Product) => {
  isEditing.value = true
  showDetailPanel.value = false
  form.value = {
    _id: product._id,
    name: product.name,
    category: product.category?._id || '',
    compositionRule: product.compositionRule?._id || '',
    baseQuantity: product.baseQuantity,
    unit: product.unit,
    priceUnit: product.priceUnit
  }
  showFormPanel.value = true
}

const openDetailMode = (product: Product) => {
  selectedProduct.value = product
  showFormPanel.value = false
  showDetailPanel.value = true
}

const closePanels = () => {
  showFormPanel.value = false
  showDetailPanel.value = false
  selectedProduct.value = null
}

const handleSubmit = async () => {
  isSubmitting.value = true
  try {
    if (isEditing.value) {
      await api.put(`/api/admin/products/${form.value._id}`, form.value)
      showNotification("Produit modifié avec succès !", "success")
    } else {
      await api.post('/api/admin/products', form.value)
      showNotification("Nouveau produit créé !", "success")
    }
    queryClient.invalidateQueries({ queryKey: ['products'] })
    closePanels()
  } catch (err: any) {
    showNotification(err.response?.data?.message || "Une erreur est survenue", "error")
  } finally {
    isSubmitting.value = false
  }
}

const deleteProduct = async (id: string) => {
  const result = await Swal.fire({
    title: 'Supprimer ce produit ?',
    text: "Il ne sera plus disponible pour les futures compositions de packs.",
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
      await api.delete(`/api/admin/products/${id}`)
      showNotification("Produit supprimé", "success")
      queryClient.invalidateQueries({ queryKey: ['products'] })
      if (selectedProduct.value?._id === id) closePanels()
    } catch (err) {
      showNotification("Impossible de supprimer le produit", "error")
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
    
    <div class="bg-white p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
      <h1 class="font-display font-bold text-xl text-noir">Référentiel des Produits</h1>
      <div class="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
        <div class="relative w-full sm:w-60">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 stroke-[2.5]" />
          <input v-model="search" type="text" placeholder="Rechercher un produit..." class="w-full pl-9 pr-4 py-2 bg-[#f9f9fb] border border-gray-200 rounded-xl text-xs font-medium text-noir focus:outline-none focus:border-foret focus:bg-white transition-all" />
        </div>
        <button @click="openCreateMode" class="cursor-pointer flex items-center gap-1.5 px-4 py-2 bg-foret text-white text-xs font-bold rounded-xl hover:bg-opacity-95 transition-all shadow-sm shrink-0">
          <Plus class="w-3.5 h-3.5 stroke-3" /> Ajouter
        </button>
      </div>
    </div>

    <div v-if="notification.text" :class="[notification.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200', 'p-4 rounded-xl border text-xs font-semibold shadow-2xs fixed top-4 right-4 z-50 max-w-sm']">
      {{ notification.text }}
    </div>

    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 bg-white p-4 rounded-2xl shadow-2xs">
      <div class="flex items-center gap-2 text-xs font-semibold text-gray-500">
        <span>Produits enregistrés au catalogue</span>
        <span class="px-2.5 py-1 bg-foret/10 text-foret rounded-full font-bold text-[11px]">{{ data?.total || 0 }}</span>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      
      <div :class="[showFormPanel || showDetailPanel ? 'lg:col-span-2' : 'lg:col-span-3', 'bg-white rounded-2xl border border-gray-100 shadow-3xs overflow-hidden transition-all']">
        <div v-if="isLoading" class="text-sm font-medium text-gray-500 p-6 text-center">Chargement du catalogue...</div>
        <div v-else-if="isError" class="p-4 bg-red-50 text-red-700 text-sm rounded-xl m-4 border">Erreur: {{ error?.message }}</div>

        <div v-else class="p-4 overflow-x-auto">
          <table class="w-full text-left border-collapse min-w-162.5">
            <thead>
              <tr class="bg-gray-50/70 border-b border-gray-100 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                <th class="py-3 px-4">Produit</th>
                <th class="py-3 px-4">Catégorie</th>
                <th class="py-3 px-4">Règle liée</th>
                <th class="py-3 px-4 text-right">Essentiel (Base)</th>
                <th class="py-3 px-4 text-right">P.U (FCFA)</th>
                <th class="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50 text-noir">
              <tr v-for="prod in data?.products" :key="prod._id" class="hover:bg-gray-50/50 transition-colors">
                <td class="py-3 px-4 font-bold">{{ prod.name }}</td>
                <td class="py-3 px-4"><span class="px-2 py-0.5 bg-gray-100 rounded-md text-[11px] font-medium">{{ prod.category?.name || 'Non classé' }}</span></td>
                <td class="py-3 px-4 text-gray-500 italic">{{ prod.compositionRule?.name || 'Aucune' }}</td>
                <td class="py-3 px-4 text-right font-semibold">{{ prod.baseQuantity }} {{ prod.unit }}</td>
                <td class="py-3 px-4 text-right font-mono text-gray-700">{{ prod.priceUnit.toLocaleString() }} F</td>
                <td class="py-3 px-4">
                  <div class="flex items-center justify-center gap-2">
                    <button @click="openDetailMode(prod)" class="cursor-pointer p-1.5 text-gray-400 hover:text-noir hover:bg-gray-100 rounded-lg transition-colors"><Eye class="w-3.5 h-3.5" /></button>
                    <button @click="openEditMode(prod)" class="cursor-pointerp-1.5 text-gray-400 hover:text-savane hover:bg-amber-50 rounded-lg transition-colors"><Edit2 class="w-3.5 h-3.5" /></button>
                    <button @click="deleteProduct(prod._id)" class="cursor-pointer p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 class="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <div class="flex items-center justify-between pt-4 border-t border-gray-100 mt-4">
            <button :disabled="page === 1 || isPlaceholderData" @click="page--" class="px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-50 disabled:opacity-50 transition-all">← Précédent</button>
            <span class="bg-gray-100 px-3 py-1.5 rounded-lg text-noir font-bold">Page {{ page }}</span>
            <button :disabled="!data?.hasMore || isPlaceholderData" @click="page++" class="px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-50 disabled:opacity-50 transition-all">Suivant →</button>
          </div>
        </div>
      </div>

      <div v-if="showFormPanel || showDetailPanel" class="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4 animate-fadeIn sticky top-6">
        
        <div class="flex items-center justify-between border-b pb-2.5">
          <h3 class="font-bold text-noir text-sm">
            <span v-if="showFormPanel">{{ isEditing ? 'Modifier le produit' : 'Ajouter au catalogue' }}</span>
            <span v-else>Fiche Technique Produit</span>
          </h3>
          <button @click="closePanels" class="p-1 bg-gray-50 hover:bg-gray-100 rounded-lg text-gray-400"><X class="w-3.5 h-3.5" /></button>
        </div>

        <form v-if="showFormPanel" @submit.prevent="handleSubmit" class="space-y-4">
          <div>
            <label class="block mb-1 font-bold text-noir text-[10px] uppercase">Nom du produit</label>
            <input v-model="form.name" type="text" placeholder="ex: Riz local, Huile végétale..." class="w-full px-3 py-2 bg-[#f9f9fb] border border-gray-200 rounded-lg focus:outline-none focus:border-foret" required />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block mb-1 font-bold text-noir text-[10px] uppercase">Catégorie</label>
              <select v-model="form.category" class="w-full px-3 py-2 bg-[#f9f9fb] border border-gray-200 rounded-lg focus:outline-none focus:border-foret" required>
                <option value="" disabled>Sélectionner...</option>
                <option v-for="cat in categoriesList" :key="cat._id" :value="cat._id">{{ cat.name }}</option>
              </select>
            </div>
            <div>
              <label class="block mb-1 font-bold text-noir text-[10px] uppercase">Règle composition</label>
              <select v-model="form.compositionRule" class="w-full px-3 py-2 bg-[#f9f9fb] border border-gray-200 rounded-lg focus:outline-none focus:border-foret" required>
                <option value="" disabled>Sélectionner...</option>
                <option v-for="rule in rulesList" :key="rule._id" :value="rule._id">{{ rule.name }}</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-2">
            <div class="col-span-2">
              <label class="block mb-1 font-bold text-noir text-[10px] uppercase">Quantité Essentiel</label>
              <input v-model.number="form.baseQuantity" type="number" step="0.1" class="w-full px-3 py-2 bg-[#f9f9fb] border border-gray-200 rounded-lg focus:outline-none focus:border-foret" required />
            </div>
            <div>
              <label class="block mb-1 font-bold text-noir text-[10px] uppercase">Unité</label>
              <input v-model="form.unit" type="text" placeholder="kg, litre, boîte..." class="w-full px-3 py-2 bg-[#f9f9fb] border border-gray-200 rounded-lg focus:outline-none focus:border-foret" required />
            </div>
          </div>

          <div>
            <label class="block mb-1 font-bold text-noir text-[10px] uppercase">Prix Unitaire (FCFA)</label>
            <input v-model.number="form.priceUnit" type="number" class="w-full px-3 py-2 bg-[#f9f9fb] border border-gray-200 rounded-lg focus:outline-none focus:border-foret" required />
          </div>

          <button type="submit" :disabled="isSubmitting" class="cursor-ponter w-full py-2.5 bg-foret text-white text-xs font-bold rounded-xl shadow-sm disabled:opacity-50">
            {{ isSubmitting ? 'Enregistrement...' : (isEditing ? 'Enregistrer les modifications' : 'Ajouter le produit') }}
          </button>
        </form>

        <div v-if="showDetailPanel && selectedProduct" class="space-y-4 text-xs">
          <div class="p-3 bg-gray-50 rounded-xl space-y-2 border">
            <span class="text-[9px] uppercase font-bold text-gray-400 block tracking-wider">Caractéristiques de base</span>
            <div class="flex justify-between"><strong>Nom :</strong> <span class="text-noir font-bold">{{ selectedProduct.name }}</span></div>
            <div class="flex justify-between"><strong>Catégorie :</strong> <span>{{ selectedProduct.category?.name }}</span></div>
            <div class="flex justify-between"><strong>Prix de base :</strong> <span class="font-mono">{{ selectedProduct.priceUnit }} FCFA / {{ selectedProduct.unit }}</span></div>
          </div>

          <div class="space-y-2">
            <span class="text-[10px] uppercase font-bold text-gray-400 tracking-wider block">Simulation des compositions (V2)</span>
            <div class="divide-y border rounded-xl overflow-hidden bg-white">
              
              <div class="p-2.5 flex justify-between items-center bg-gray-50/50">
                <div><span class="font-bold text-noir block">Dotation Essentiel</span><span class="text-[10px] text-gray-400">Quantité Pivot</span></div>
                <div class="text-right"><span class="font-bold text-noir text-sm">{{ selectedProduct.baseQuantity }} {{ selectedProduct.unit }}</span><span class="block text-[10px] text-gray-500 font-mono">{{ (selectedProduct.baseQuantity * selectedProduct.priceUnit).toLocaleString() }} F</span></div>
              </div>

              <div class="p-2.5 flex justify-between items-center">
                <div><span class="font-bold text-foret block">Dotation Équilibré</span><span class="text-[10px] text-gray-400">Coeff appliqué : ×{{ selectedProduct.compositionRule?.multiplierEquilibre || 2 }}</span></div>
                <div class="text-right"><span class="font-bold text-foret text-sm">{{ selectedProduct.baseQuantity * (selectedProduct.compositionRule?.multiplierEquilibre || 2) }} {{ selectedProduct.unit }}</span><span class="block text-[10px] text-gray-500 font-mono">{{ (selectedProduct.baseQuantity * (selectedProduct.compositionRule?.multiplierEquilibre || 2) * selectedProduct.priceUnit).toLocaleString() }} F</span></div>
              </div>

              <div class="p-2.5 flex justify-between items-center">
                <div><span class="font-bold text-savane block">Dotation Confort</span><span class="text-[10px] text-gray-400">Coeff appliqué : ×{{ selectedProduct.compositionRule?.multiplierConfort || 5 }}</span></div>
                <div class="text-right"><span class="font-bold text-savane text-sm">{{ selectedProduct.baseQuantity * (selectedProduct.compositionRule?.multiplierConfort || 5) }} {{ selectedProduct.unit }}</span><span class="block text-[10px] text-gray-500 font-mono">{{ (selectedProduct.baseQuantity * (selectedProduct.compositionRule?.multiplierConfort || 5) * selectedProduct.priceUnit).toLocaleString() }} F</span></div>
              </div>

            </div>
          </div>

          <button @click="openEditMode(selectedProduct!)" class="cursor-pointer w-full py-2 bg-amber-50 text-savane font-bold rounded-xl border border-amber-200 transition-colors flex items-center justify-center gap-1">
            <Edit2 class="w-3 h-3" /> Modifier la fiche
          </button>
        </div>

      </div>

    </div>
  </div>
</template>