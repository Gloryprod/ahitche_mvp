<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { Search, Plus, Edit2, Trash2, Eye, X, Layers } from 'lucide-vue-next'
import api from '@/stores/api'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/vue-query'
import Swal from 'sweetalert2'
import type { Product } from '@/type'

// --- INTERFACES TYPES ---
interface LotStockFifo {
  _id: string
  numeroLot: string
  product: Product | string // Peut être peuplé ou ID
  quantiteInitiale: number
  quantiteRestante: number
  prixAchatUnitaire: number
  dateReception: string
  fournisseur: 'ETS EUROHI & FILS' | 'AHOUANDJO DAVID' | 'Hananim Distribution' | 'Autre'
  createdAt?: string
}

interface PaginatedLotsResponse {
  lots: LotStockFifo[]
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

// Listes auxiliaires
const listeProduits = ref<Product[]>([])

// Gestion des volets d'affichage latéraux
const showFormPanel = ref(false)
const isEditing = ref(false)
const showDetailPanel = ref(false)
const selectedLot = ref<LotStockFifo | null>(null)

// Structure de données conforme au modèle Mongoose d'entrée de stock
const form = ref({
  _id: '',
  numeroLot: '',
  productId: '',
  quantiteRecue: null as number | null,
  prixAchatUnitaire: null as number | null,
  fournisseur: '',
  dateReception: new Date().toISOString().substring(0, 10) // Date du jour par défaut (YYYY-MM-DD)
})

// Debounce pour optimiser les requêtes réseau sur la recherche de lots
let timeoutId: ReturnType<typeof setTimeout>
watch(search, (newValue) => {
  clearTimeout(timeoutId)
  timeoutId = setTimeout(() => {
    debouncedSearch.value = newValue
    page.value = 1
  }, 400)
})

// --- CHARGEMENTS DES DONNÉES (API) ---

// 1. Récupération des produits pour remplir le sélecteur du formulaire
const chargerProduitsReference = async () => {
  try {
    const response = await api.get('/api/admin/products?limit=100')
    if (response?.data) listeProduits.value = response.data.products
    console.log("Liste des produits chargée :", listeProduits)
  } catch (err) {
    console.error("Impossible de récupérer la liste des produits", err)
  }
}

onMounted(() => {
  chargerProduitsReference()
})

// 2. Récupération paginée des lots du stock avec TanStack Query
const fetchLotsStock = async ({ queryKey }: { queryKey: any }): Promise<PaginatedLotsResponse> => {
  const [_, currentPage, currentSearch] = queryKey
  
  const response = await api.get('/api/admin/stock/lots', {
    params: {
      page: currentPage,
      search: currentSearch,
      limit: 10
    }
  })
  
  if (!response?.data) throw new Error('Aucune donnée de stock reçue du serveur')
  return response.data
}

const { data, isLoading, isError, error, isPlaceholderData } = useQuery({
  queryKey: ['lotsStock', page, debouncedSearch], 
  queryFn: fetchLotsStock,
  placeholderData: keepPreviousData,
})

// --- GESTION DES MODES ET PANNEAUX ---
const openCreateMode = () => {
  isEditing.value = false
  showDetailPanel.value = false
  form.value = { 
    _id: '', 
    numeroLot: '', 
    productId: '', 
    quantiteRecue: null, 
    prixAchatUnitaire: null, 
    fournisseur: '',
    dateReception: new Date().toISOString().substring(0, 10)
  }
  showFormPanel.value = true
}

const openEditMode = (lot: LotStockFifo) => {
  isEditing.value = true
  showDetailPanel.value = false
  
  // Adaptation de la structure pour le formulaire d'édition
  form.value = {
    _id: lot._id,
    numeroLot: lot.numeroLot,
    productId: typeof lot.product === 'object' ? lot.product._id : lot.product,
    quantiteRecue: lot.quantiteInitiale, // On édite la quantité initiale d'entrée
    prixAchatUnitaire: lot.prixAchatUnitaire,
    fournisseur: lot.fournisseur,
    dateReception: lot.dateReception ? lot.dateReception.substring(0, 10) : new Date().toISOString().substring(0, 10)
  }
  showFormPanel.value = true
}

const openDetailMode = (lot: LotStockFifo) => {
  selectedLot.value = lot
  showFormPanel.value = false
  showDetailPanel.value = true
}

const closePanels = () => {
  showFormPanel.value = false
  showDetailPanel.value = false
  selectedLot.value = null
}

// --- SOUMISSION DU FORMULAIRE ---
const handleSubmit = async () => {
  isSubmitting.value = true
  try {
    if (isEditing.value) {
      // Modification d'un lot existant
      await api.put(`/api/admin/stock/lots/${form.value._id}`, form.value)
      showNotification("Informations du lot modifiées avec succès !", "success")
    } else {
      // Création d'une nouvelle entrée de stock
      await api.post('/api/admin/stock/lots', form.value)
      showNotification("Nouvelle entrée de stock enregistrée avec succès !", "success")
    }
    queryClient.invalidateQueries({ queryKey: ['lotsStock'] })
    closePanels()
  } catch (err: any) {
    showNotification(err.response?.data?.message || "Une erreur est survenue lors de l'enregistrement", "error")
  } finally {
    isSubmitting.value = false
  }
}

// --- SUPPRESSION D'UN LOT ---
const deleteLot = async (id: string) => {
  const result = await Swal.fire({
    title: 'Voulez-vous supprimer ce lot de stock ?',
    text: 'Cette action effacera définitivement le lot et son historique associé.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#1e3a1f', // Vert Forêt Ahitché
    cancelButtonColor: '#d33',
    confirmButtonText: 'Oui, supprimer',
    cancelButtonText: 'Annuler',
    background: '#ffffff',
    customClass: {
      popup: 'rounded-2xl font-body'
    }
  });

  if (result.isConfirmed) {
    try {
      await api.delete(`/api/admin/stock/lots/${id}`)
      showNotification("Le lot a été supprimé avec succès", "success")
      queryClient.invalidateQueries({ queryKey: ['lotsStock'] })
      if (selectedLot.value?._id === id) closePanels()
    } catch (error) {
      showNotification("Impossible de supprimer ce lot de stock", "error")
    }
  }
}

// --- FORMATTAGE ---
const formatPrix = (valeur: number) => {
  return new Intl.NumberFormat('fr-FR').format(valeur) + ' FCFA'
}

const formatDate = (dateStr: string) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const showNotification = (text: string, type: string) => {
  notification.value = { text, type }
  setTimeout(() => notification.value = { text: '', type: '' }, 4000)
}
</script>

<template>
  <div class="space-y-6 animate-fadeIn text-xs font-medium text-gray-600">

    <!-- BARRE D'ENTÊTE DE STYLE AHITCHÉ -->
    <div class="bg-white p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
      <h1 class="font-display font-bold text-xl text-noir flex items-center gap-2">
        Entrées de Stock
      </h1>
      <div class="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
        <div class="relative w-full sm:w-60">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 stroke-[2.5]" />
          <input v-model="search" type="text" placeholder="Rechercher par lot, fournisseur..." class="w-full pl-9 pr-4 py-2 bg-[#f9f9fb] border border-gray-200 rounded-xl text-xs font-medium text-noir focus:outline-none focus:border-foret focus:bg-white transition-all" />
        </div>
        <button @click="openCreateMode" class="cursor-pointer flex items-center gap-1.5 px-4 py-2 bg-foret text-white text-xs font-bold rounded-xl hover:bg-opacity-95 transition-all shadow-sm shrink-0">
          <Plus class="w-3.5 h-3.5 stroke-3" />
          Nouvelle entrée
        </button>
      </div>
    </div>
    
    <!-- NOTIFICATIONS FLOTTANTES -->
    <div v-if="notification.text" :class="[notification.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200', 'p-4 rounded-xl border text-xs font-semibold shadow-2xs fixed top-4 right-4 z-50 max-w-sm']">
      {{ notification.text }}
    </div>

    <!-- COMPTEUR DE LOTS -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 bg-white p-4 rounded-2xl shadow-2xs">
        <div v-if="!data?.lots || data.lots.length === 0" class="text-center py-2 text-sm text-gris">
            Aucun lot de stock enregistré ou ne correspond à la recherche.
        </div>

        <div class="flex items-center gap-2 text-xs font-semibold text-gray-500">
            <span>Lots physiques actuellement référencés</span>
            <span class="px-2.5 py-1 bg-foret/10 text-foret rounded-full font-bold text-[11px]">
              {{ data?.lots ? data.lots.length : 0 }}
            </span>
        </div>
    </div>

    <!-- GRILLE PRINCIPALE AVEC PANNEAU COULISSANT SUR LA DROITE -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      
      <!-- TABLEAU DES ENTRÉES DE STOCK -->
      <div :class="[showFormPanel || showDetailPanel ? 'lg:col-span-2' : 'lg:col-span-3', 'bg-white rounded-2xl border border-gray-100 shadow-3xs overflow-hidden transition-all']">
        <div v-if="isLoading" class="text-sm font-medium text-gray-500 p-8 text-center">
          Chargement initial des lots de l'entrepôt FIFO...
        </div>
    
        <div v-else-if="isError" class="p-4 bg-red-50 text-red-700 text-sm rounded-xl border border-red-100">
          Erreur : {{ error?.message || "Impossible de charger les lots physiques." }}
        </div>

        <div v-else class="p-4 overflow-x-auto">
            <table class="w-full text-left border-collapse">
            <thead>
                <tr class="bg-gray-50/70 border-b border-gray-100 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  <th class="py-3 px-4">N° de Lot</th>
                  <th class="py-3 px-4">Produit</th>
                  <th class="py-3 px-4">Fournisseur</th>
                  <th class="py-3 px-4 text-center">Reste / Initial</th>
                  <th class="py-3 px-4 text-right">P.A. Unitaire</th>
                  <th class="py-3 px-4 text-center">Actions</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-50 text-noir">
                <tr v-for="lot in data?.lots" :key="lot._id" class="hover:bg-gray-50/50 transition-colors">
                  <!-- Numéro de Lot -->
                  <td class="py-3 px-4 font-mono font-bold text-gray-700">{{ lot.numeroLot }}</td>
                  <!-- Nom du produit -->
                  <td class="py-3 px-4 font-bold">
                    {{ typeof lot.product === 'object' ? lot.product.name : lot.product }}
                  </td>
                  <!-- Fournisseur -->
                  <td class="py-3 px-4 text-gray-400">{{ lot.fournisseur }}</td>
                  <!-- Jauge Quantité restante / Quantité initiale -->
                  <td class="py-3 px-4 text-center">
                    <span :class="[lot.quantiteRestante === 0 ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-noir', 'px-2 py-0.5 rounded font-mono font-bold']">
                      {{ lot.quantiteRestante }}
                    </span> 
                    <span class="text-gray-300 font-mono text-[10px]"> / {{ lot.quantiteInitiale }}</span>
                  </td>
                  <!-- Prix d'achat unitaire -->
                  <td class="py-3 px-4 text-right font-mono text-gray-600">{{ formatPrix(lot.prixAchatUnitaire) }}</td>
                  <!-- Actions contextuelles -->
                  <td class="py-3 px-4">
                    <div class="flex items-center justify-center gap-2">
                      <button @click="openDetailMode(lot)" class="cursor-pointer p-1.5 text-gray-400 hover:text-noir hover:bg-gray-100 rounded-lg transition-colors" title="Détails du Lot">
                          <Eye class="w-3.5 h-3.5" />
                      </button>
                      <button @click="openEditMode(lot)" class="cursor-pointer p-1.5 text-gray-400 hover:text-savane hover:bg-amber-50 rounded-lg transition-colors" title="Modifier le Lot">
                          <Edit2 class="w-3.5 h-3.5" />
                      </button>
                      <button @click="deleteLot(lot._id)" class="cursor-pointer p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Supprimer de l'inventaire">
                          <Trash2 class="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
            </tbody>
            </table>

            <!-- LOGIQUE DE PAGINATION -->
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

      <!-- VOLET COLLÉ LATÉRAL DE DROITE (FORMULAIRE UNIQUE & VISUALISATION) -->
      <div v-if="showFormPanel || showDetailPanel" class="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4 animate-fadeIn sticky top-6">
        
        <div class="flex items-center justify-between border-b pb-2.5">
          <h3 class="font-bold text-noir text-sm">
            <span v-if="showFormPanel">{{ isEditing ? 'Modifier les métadonnées' : 'Entrée de Marchandise (Mise en stock)' }}</span>
            <span v-else>Fiche descriptive du Lot</span>
          </h3>
          <button @click="closePanels" class="p-1 bg-gray-50 hover:bg-gray-100 rounded-lg text-gray-400 transition-all">
            <X class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- FORMULAIRE SAISIE / MODIFICATION -->
        <form v-if="showFormPanel" @submit.prevent="handleSubmit" class="space-y-4">
          <div>
            <label class="block mb-1.5 font-bold text-noir text-[10px] uppercase">Numéro de lot unique</label>
            <input v-model="form.numeroLot" type="text" placeholder="ex: LOT-RIZ-20260708-01" class="w-full px-3 py-2 bg-[#f9f9fb] border border-gray-200 rounded-lg focus:outline-none focus:border-foret text-noir font-mono" required />
          </div>

          <div>
            <label class="block mb-1.5 font-bold text-noir text-[10px] uppercase">Produit reçu</label>
            <select v-model="form.productId" class="w-full px-3 py-2 bg-[#f9f9fb] border border-gray-200 rounded-lg focus:outline-none focus:border-foret text-noir" required >
              <option value="" disabled>-- Sélectionner l'article --</option>
              <option v-for="prod in listeProduits" :key="prod._id" :value="prod._id">
                {{ prod.name }} ({{ prod.priceUnit }} F / {{ prod.unit || 'u' }})
              </option>
            </select>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block mb-1.5 font-bold text-noir text-[10px] uppercase">Quantité Recue</label>
              <input v-model.number="form.quantiteRecue" type="number" min="1" placeholder="ex: 50" class="w-full px-3 py-2 bg-[#f9f9fb] border border-gray-200 rounded-lg focus:outline-none focus:border-foret text-noir font-mono" required />
            </div>
            <div>
              <label class="block mb-1.5 font-bold text-noir text-[10px] uppercase">Prix Achat (U.)</label>
              <input v-model.number="form.prixAchatUnitaire" type="number" min="0" placeholder="en FCFA" class="w-full px-3 py-2 bg-[#f9f9fb] border border-gray-200 rounded-lg focus:outline-none focus:border-foret text-noir font-mono" required />
            </div>
          </div>

          <div>
            <label class="block mb-1.5 font-bold text-noir text-[10px] uppercase">Fournisseur Grossiste</label>
            <select v-model="form.fournisseur" class="w-full px-3 py-2 bg-[#f9f9fb] border border-gray-200 rounded-lg focus:outline-none focus:border-foret text-noir" required>
              <option value="" disabled>-- Choisir le fournisseur --</option>
              <option value="ETS EUROHI & FILS">ETS EUROHI & FILS</option>
              <option value="AHOUANDJO DAVID">AHOUANDJO DAVID</option>
              <option value="Hananim Distribution">Hananim Distribution</option>
              <option value="Autre">Autre</option>
            </select>
          </div>

          <div>
            <label class="block mb-1.5 font-bold text-noir text-[10px] uppercase">Date de Réception</label>
            <input v-model="form.dateReception" type="date" class="w-full px-3 py-2 bg-[#f9f9fb] border border-gray-200 rounded-lg focus:outline-none focus:border-foret text-noir" required />
          </div>

          <button type="submit" :disabled="isSubmitting" class="cursor-pointer w-full py-2.5 bg-foret text-white text-xs font-bold rounded-xl hover:bg-opacity-95 transition-all shadow-sm disabled:opacity-50">
            {{ isSubmitting ? 'Enregistrement en cours...' : (isEditing ? 'Enregistrer les modifications' : 'Valider l\'entrée de stock') }}
          </button>
        </form>

        <!-- VISUALISATION DÉTAILLÉE D'UN LOT -->
        <div v-if="showDetailPanel && selectedLot" class="space-y-4 text-xs">
          <div class="space-y-1">
            <span class="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Identifiant Interne (Mongoose ID)</span>
            <p class="font-mono bg-gray-50 p-2 rounded-lg text-gray-500 select-all">{{ selectedLot._id }}</p>
          </div>
          <div class="space-y-1">
            <span class="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Numéro de Lot</span>
            <p class="text-noir font-mono font-bold text-sm bg-gray-50 px-2 py-1 rounded border">{{ selectedLot.numeroLot }}</p>
          </div>
          <div class="space-y-1">
            <span class="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Produit associé</span>
            <p class="text-noir font-bold text-sm">{{ typeof selectedLot.product === 'object' ? selectedLot.product.name : selectedLot.product }}</p>
          </div>
          
          <div class="grid grid-cols-2 gap-2 bg-gray-50/60 p-3 rounded-lg border border-gray-100 leading-relaxed">
            <div>
              <span class="text-[9px] uppercase font-bold text-gray-400 block">Quantité Initiale</span>
              <p class="text-noir font-mono font-bold text-sm">{{ selectedLot.quantiteInitiale }}</p>
            </div>
            <div>
              <span class="text-[9px] uppercase font-bold text-gray-400 block">Quantité Restante</span>
              <p :class="[selectedLot.quantiteRestante === 0 ? 'text-red-600' : 'text-foret', 'font-mono font-bold text-sm']">
                {{ selectedLot.quantiteRestante }}
              </p>
            </div>
          </div>

          <div class="space-y-1">
            <span class="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Provenance / Grossiste</span>
            <p class="text-gray-700 font-bold">{{ selectedLot.fournisseur }}</p>
          </div>

          <div class="space-y-1">
            <span class="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Date officielle de réception</span>
            <p class="text-gray-600 font-mono">{{ formatDate(selectedLot.dateReception) }}</p>
          </div>

          <div class="pt-2 flex gap-2">
            <button @click="openEditMode(selectedLot)" class="w-full py-2 bg-amber-50 text-savane font-bold rounded-xl hover:bg-amber-100/70 border border-amber-200 transition-colors flex items-center justify-center gap-1">
              <Edit2 class="w-3 h-3" /> Ajuster le lot
            </button>
          </div>
        </div>

      </div>

    </div>
  </div>
</template>