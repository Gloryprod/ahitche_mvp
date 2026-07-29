<script setup lang="ts">
import { ref, watch } from 'vue'
import { Plus, X, Check, Clock, Trash2, Search, Eye, Edit3, Download } from 'lucide-vue-next'
import api from '@/stores/api'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/vue-query'
import type { Product } from '@/type'
import { générerBonCommandePDF } from '@/services/pdfService'
import Swal from 'sweetalert2'

interface OrderItem {
  productId: string
  quantiteCommandee: number
  prixUnitairePrevu: number
}

interface PurchaseOrder {
  _id: string
  numeroBon: string
  fournisseur: string
  statut: 'En attente' | 'Reçu'
  items: {
    productId: Product | string
    quantiteCommandee: number
    prixUnitairePrevu: number
  }[]
  createdAt?: string
  dateEmission?: string
}

// --- ÉTATS & PAGINATION ---
const page = ref(1)
const search = ref('')
const debouncedSearch = ref('')
const queryClient = useQueryClient()
const notification = ref({ text: '', type: '' })

// Modes du volet/modal : 'create' | 'edit' | 'details' | null
const activePanel = ref<'create' | 'edit' | 'details' | null>(null)
const selectedBon = ref<PurchaseOrder | null>(null)

// Formulaire
const fournisseurSelectionne = ref('ETS EUROHI & FILS')
const itemsCommande = ref<OrderItem[]>([
  { productId: '', quantiteCommandee: 1, prixUnitairePrevu: 0 }
])

const listeFournisseurs = ['ETS EUROHI & FILS', 'AHOUANDJO DAVID', 'Hananim Distribution', 'Autre']

// Debounce pour la recherche
let timeoutId: ReturnType<typeof setTimeout>
watch(search, (newValue) => {
  clearTimeout(timeoutId)
  timeoutId = setTimeout(() => {
    debouncedSearch.value = newValue
    page.value = 1
  }, 400)
})

// --- QUERIES ---
const fetchPurchaseOrders = async ({ queryKey }: { queryKey: any }) => {
  const [_, currentPage, currentSearch] = queryKey
  const res = await api.get('/api/admin/bons-commande', {
    params: { page: currentPage, search: currentSearch, limit: 10 }
  })
  return res.data
}

const { data, isLoading, isError, isPlaceholderData } = useQuery({
  queryKey: ['purchaseOrders', page, debouncedSearch],
  queryFn: fetchPurchaseOrders,
  placeholderData: keepPreviousData,
})

const { data: produitsCatalogue } = useQuery<Product[]>({
  queryKey: ['productsMin'],
  queryFn: async () => {
    const res = await api.get('/api/admin/products')
    return res.data.products
  }
})

// --- MUTATIONS ---
// 1. Création
const createMutation = useMutation({
  mutationFn: async (payload: any) => {
    return await api.post('/api/admin/bons-commande', payload)
  },
  onSuccess: (response) => {
    queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] })
    const bonCree = response?.data?.bon
    if (bonCree) {
      générerBonCommandePDF(bonCree, produitsCatalogue.value || [])
    }
    closePanel()
      showNotification("Nouveau bon de commande créé !", "success")
  }
})

// 2. Modification
const updateMutation = useMutation({
  mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
    return await api.put(`/api/admin/bons-commande/${id}`, payload)
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] })
    closePanel()
    showNotification("Bon de commande modifié avec succès !", "success")
  }
})

// 3. Suppression
const deleteMutation = useMutation({
  mutationFn: async (id: string) => {
    return await api.delete(`/api/admin/bons-commande/${id}`)
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] })
    showNotification("Bon de commande supprimé avec succès", "success")
  }
})

// --- GESTION DU FORMULAIRE ET DES PANNEAUX ---
const openCreatePanel = () => {
  selectedBon.value = null
  fournisseurSelectionne.value = 'ETS EUROHI & FILS'
  itemsCommande.value = [{ productId: '', quantiteCommandee: 1, prixUnitairePrevu: 0 }]
  activePanel.value = 'create'
}

const openDetailsPanel = (bon: PurchaseOrder) => {
  selectedBon.value = bon
  activePanel.value = 'details'
}

const openEditPanel = (bon: PurchaseOrder) => {
  selectedBon.value = bon
  fournisseurSelectionne.value = bon.fournisseur
  itemsCommande.value = bon.items.map(i => ({
    productId: typeof i.productId === 'object' ? i.productId._id : i.productId,
    quantiteCommandee: i.quantiteCommandee,
    prixUnitairePrevu: i.prixUnitairePrevu
  }))
  activePanel.value = 'edit'
}

const closePanel = () => {
  activePanel.value = null
  selectedBon.value = null
}

const ajouterLigneProduit = () => {
  itemsCommande.value.push({ productId: '', quantiteCommandee: 1, prixUnitairePrevu: 0 })
}

const retirerLigneProduit = (index: number) => {
  if (itemsCommande.value.length > 1) {
    itemsCommande.value.splice(index, 1)
  }
}

const soumettreFormulaire = () => {
  const itemsValides = itemsCommande.value.filter(item => item.productId !== '')
  if (itemsValides.length === 0) return

  const payload = {
    fournisseur: fournisseurSelectionne.value,
    items: itemsValides
  }

  if (activePanel.value === 'create') {
    createMutation.mutate(payload)
  } else if (activePanel.value === 'edit' && selectedBon.value) {
    updateMutation.mutate({ id: selectedBon.value._id, payload })
  }
}

const confirmerSuppression = async (bon: PurchaseOrder) => {  
  const result = await Swal.fire({
    title: `Êtes-vous sûr de vouloir supprimer le bon N° ${bon.numeroBon} ?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#1e3a1f',
    cancelButtonColor: '#d33',
    confirmButtonText: 'Oui, supprimer',
    cancelButtonText: 'Annuler',
    customClass: { popup: 'rounded-2xl font-body' }
  });

  if (result.isConfirmed) {
    deleteMutation.mutate(bon._id)
  }
}

const telechargerPDF = (bon: PurchaseOrder) => {
  générerBonCommandePDF(bon, produitsCatalogue.value || [])
}

// Utilitaires
const calculerTotalBon = (items: any[]) => {
  return items ? items.reduce((sum, item) => sum + (item.quantiteCommandee * item.prixUnitairePrevu), 0) : 0
}

const formatPrixCFA = (valeur: number) => {
  return new Intl.NumberFormat('fr-BJ', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }).format(valeur)
}

const getNomProduit = (item: any) => {
  if (typeof item.productId === 'object' && item.productId?.name) {
    return item.productId.name
  }
  const prod = produitsCatalogue.value?.find(p => p._id === item.productId)
  return prod ? prod.name : 'Produit inconnu'
}

const showNotification = (text: string, type: string) => {
  notification.value = { text, type }
  setTimeout(() => notification.value = { text: '', type: '' }, 4000)
}
</script>

<template>
  <div class="space-y-6 animate-fadeIn text-xs font-medium text-gray-600">

    <!-- BARRE D'ENTÊTE -->
    <div class="bg-white p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
      <h1 class="font-display font-bold text-xl text-noir flex items-center gap-2">
        Bons de Commande
      </h1>
      <div class="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
        <div class="relative w-full sm:w-60">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 stroke-[2.5]" />
          <input 
            v-model="search" 
            type="text" 
            placeholder="Rechercher un bon..." 
            class="w-full pl-9 pr-4 py-2 bg-[#f9f9fb] border border-gray-200 rounded-xl text-xs font-medium text-noir focus:outline-none focus:border-foret focus:bg-white transition-all" 
          />
        </div>
        <button @click="openCreatePanel" class="cursor-pointer flex items-center gap-1.5 px-4 py-2 bg-foret text-white text-xs font-bold rounded-xl hover:bg-opacity-95 transition-all shadow-sm shrink-0">
          <Plus class="w-3.5 h-3.5 stroke-3" /> Générer un bon
        </button>
      </div>
    </div>

    <div v-if="notification.text" :class="[notification.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200', 'p-4 rounded-xl border text-xs font-semibold shadow-2xs fixed top-4 right-4 z-50 max-w-sm']">
      {{ notification.text }}
    </div>

    <!-- COMPTEUR TOTAL -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 bg-white p-4 rounded-2xl shadow-2xs">
      <div class="flex items-center gap-2 text-xs font-semibold text-gray-500">
        <span>Bons émis dans le registre</span>
        <span class="px-2.5 py-1 bg-foret/10 text-foret rounded-full font-bold text-[11px]">{{ data?.total || 0 }}</span>
      </div>
    </div>

    <!-- GRILLE PRINCIPALE -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      
      <!-- HISTORIQUE DES BONS ÉMIS -->
      <div :class="[activePanel ? 'lg:col-span-2' : 'lg:col-span-3', 'bg-white rounded-2xl border border-gray-100 shadow-3xs overflow-hidden transition-all']">
        <div v-if="isLoading" class="text-sm font-medium text-gray-500 p-6 text-center">
          Chargement du registre...
        </div>
        <div v-else-if="isError" class="p-4 bg-red-50 text-red-700 text-sm rounded-xl m-4 border">
          Erreur lors de la récupération des bons de commande.
        </div>
        <div v-else class="p-4 overflow-x-auto">
          <div v-if="!data?.bonsCommande || data.bonsCommande.length === 0" class="text-center py-8 text-sm text-gray-400">
            Aucun bon de commande trouvé.
          </div>

          <table v-else class="w-full text-left border-collapse min-w-162.5">
            <thead>
              <tr class="bg-gray-50/70 border-b border-gray-100 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                <th class="py-3 px-4">Code Référence</th>
                <th class="py-3 px-4">Fournisseur</th>
                <th class="py-3 px-4 text-center">Articles</th>
                <th class="py-3 px-4 text-right">Montant Prévu</th>
                <th class="py-3 px-4 text-center">Statut</th>
                <th class="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50 text-noir">
              <tr v-for="bon in data.bonsCommande" :key="bon._id" class="hover:bg-gray-50/50 transition-colors">
                <td class="py-3 px-4 font-mono font-bold text-gray-900">{{ bon.numeroBon }}</td>
                <td class="py-3 px-4 font-bold text-gray-700">{{ bon.fournisseur }}</td>
                <td class="py-3 px-4 text-center font-mono text-gray-400">{{ bon.items?.length || 0 }}</td>
                <td class="py-3 px-4 text-right font-mono font-bold text-gray-900">
                  {{ formatPrixCFA(calculerTotalBon(bon.items)) }}
                </td>
                <td class="py-3 px-4 text-center">
                  <span v-if="bon.statut === 'En attente'" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[10px] bg-amber-50 text-savane border border-amber-100 uppercase tracking-wide">
                    <Clock class="w-3 h-3" /> En attente
                  </span>
                  <span v-else class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[10px] bg-green-50 text-green-700 border border-green-100 uppercase tracking-wide">
                    <Check class="w-3 h-3" /> Reçu
                  </span>
                </td>
                <!-- BOUTONS D'ACTION -->
                <td class="py-3 px-4 text-right space-x-1">
                  <button @click="openDetailsPanel(bon)" title="Voir les détails" class="p-1.5 text-gray-400 hover:text-foret hover:bg-gray-100 rounded-lg transition-all cursor-pointer">
                    <Eye class="w-4 h-4" />
                  </button>
                  <button @click="openEditPanel(bon)" title="Modifier" class="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded-lg transition-all cursor-pointer">
                    <Edit3 class="w-4 h-4" />
                  </button>
                  <button @click="confirmerSuppression(bon)" title="Supprimer" class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-lg transition-all cursor-pointer">
                    <Trash2 class="w-4 h-4" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>

          <!-- PAGINATION -->
          <div class="flex items-center justify-between pt-4 border-t border-gray-100 mt-4">
            <button 
              :disabled="page === 1 || isPlaceholderData" 
              @click="page--" 
              class="px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-50 disabled:opacity-50 transition-all cursor-pointer"
            >
              ← Précédent
            </button>
            <span class="bg-gray-100 px-3 py-1.5 rounded-lg text-noir font-bold">Page {{ page }}</span>
            <button 
              :disabled="!data?.hasMore || isPlaceholderData" 
              @click="page++" 
              class="px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-50 disabled:opacity-50 transition-all cursor-pointer"
            >
              Suivant →
            </button>
          </div>
        </div>
      </div>

      <!-- VOLET LATÉRAL DYNAMIQUE (Création / Édition / Détails) -->
      <div v-if="activePanel" class="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4 animate-fadeIn sticky top-6">
        
        <!-- EN-TÊTE DU VOLET -->
        <div class="flex items-center justify-between border-b pb-2.5">
          <h3 class="font-bold text-noir text-sm">
            <span v-if="activePanel === 'create'">Nouveau Bon de Commande</span>
            <span v-else-if="activePanel === 'edit'">Modifier Bon {{ selectedBon?.numeroBon }}</span>
            <span v-else-if="activePanel === 'details'">Détails - {{ selectedBon?.numeroBon }}</span>
          </h3>
          <button @click="closePanel" class="p-1 bg-gray-50 hover:bg-gray-100 rounded-lg text-gray-400 transition-all cursor-pointer">
            <X class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- 1. MODE DÉTAILS -->
        <div v-if="activePanel === 'details' && selectedBon" class="space-y-4">
          <div class="bg-gray-50 p-3 rounded-xl space-y-1">
            <div class="flex justify-between">
              <span class="text-gray-400">Fournisseur :</span>
              <span class="font-bold text-noir">{{ selectedBon.fournisseur }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-400">Statut :</span>
              <span class="font-bold" :class="selectedBon.statut === 'Reçu' ? 'text-green-600' : 'text-savane'">
                {{ selectedBon.statut }}
              </span>
            </div>
          </div>

          <div>
            <span class="text-[10px] uppercase font-bold text-gray-400 tracking-wider block mb-2">Articles commandés</span>
            <div class="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
              <div v-for="(item, idx) in selectedBon.items" :key="idx" class="p-2.5 flex justify-between items-center bg-white">
                <div>
                  <p class="font-bold text-noir">{{ getNomProduit(item) }}</p>
                  <p class="text-[10px] text-gray-400 font-mono">{{ item.quantiteCommandee }} x {{ formatPrixCFA(item.prixUnitairePrevu) }}</p>
                </div>
                <span class="font-mono font-bold text-noir">
                  {{ formatPrixCFA(item.quantiteCommandee * item.prixUnitairePrevu) }}
                </span>
              </div>
            </div>
          </div>

          <div class="flex justify-between items-center pt-2 border-t">
            <span class="font-bold text-noir">Total Prévu :</span>
            <span class="font-mono font-bold text-sm text-foret">
              {{ formatPrixCFA(calculerTotalBon(selectedBon.items)) }}
            </span>
          </div>

          <button @click="telechargerPDF(selectedBon)" class="w-full flex items-center justify-center gap-2 py-2 bg-foret text-white font-bold rounded-xl hover:bg-foret/90 transition-all cursor-pointer">
            <Download class="w-4 h-4" /> Télécharger le PDF
          </button>
        </div>

        <!-- 2. MODE CRÉATION OU ÉDITION -->
        <form v-else-if="activePanel === 'create' || activePanel === 'edit'" @submit.prevent="soumettreFormulaire" class="space-y-4">
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Fournisseur</label>
            <select v-model="fournisseurSelectionne" class="w-full px-3 py-2 bg-[#f9f9fb] border border-gray-200 rounded-xl text-xs font-medium text-noir focus:outline-none focus:border-foret focus:bg-white transition-all">
              <option v-for="f in listeFournisseurs" :key="f" :value="f">{{ f }}</option>
            </select>
          </div>

          <div class="space-y-2">
            <label class="text-[10px] uppercase font-bold text-gray-400 tracking-wider block">Articles à commander</label>
            
            <div v-for="(item, index) in itemsCommande" :key="index" class="p-3 bg-gray-50/50 rounded-xl border border-gray-100 space-y-2 relative">
              <button v-if="itemsCommande.length > 1" type="button" @click="retirerLigneProduit(index)" class="absolute top-2 right-2 text-gray-300 hover:text-red-500 transition-colors cursor-pointer">
                <Trash2 class="w-3.5 h-3.5" />
              </button>

              <select v-model="item.productId" class="w-[85%] px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium focus:outline-none focus:border-foret">
                <option value="" disabled>Sélectionner un produit</option>
                <option v-for="p in produitsCatalogue" :key="p._id" :value="p._id">
                  {{ p.name }} ({{ p.unit }})
                </option>
              </select>

              <div class="grid grid-cols-2 gap-2">
                <div>
                  <span class="text-[9px] text-gray-400 uppercase font-bold">Quantité</span>
                  <input v-model.number="item.quantiteCommandee" type="number" min="1" class="w-full px-2 py-1 bg-white border border-gray-200 rounded-lg font-mono text-xs focus:outline-none focus:border-foret" />
                </div>
                <div>
                  <span class="text-[9px] text-gray-400 uppercase font-bold">P.U. Estimé</span>
                  <input v-model.number="item.prixUnitairePrevu" type="number" min="0" class="w-full px-2 py-1 bg-white border border-gray-200 rounded-lg font-mono text-xs focus:outline-none focus:border-foret" />
                </div>
              </div>
            </div>

            <button type="button" @click="ajouterLigneProduit" class="w-full py-1.5 border border-dashed border-gray-300 rounded-xl text-gray-400 hover:text-foret hover:border-foret transition-all font-bold text-center cursor-pointer">
              + Ajouter un produit
            </button>
          </div>

          <div class="pt-2 flex items-center gap-3">
            <button type="button" @click="closePanel" class="w-1/2 py-2 border border-gray-200 text-gray-500 font-bold rounded-xl hover:bg-gray-50 transition-all text-center cursor-pointer">
              Annuler
            </button>
            <button type="submit" :disabled="createMutation.isPending.value || updateMutation.isPending.value" class="w-1/2 py-2 bg-foret text-white font-bold rounded-xl hover:bg-foret/90 disabled:opacity-50 transition-all text-center cursor-pointer">
              {{ activePanel === 'create' ? 'Valider le bon' : 'Enregistrer' }}
            </button>
          </div>
        </form>
      </div>

    </div>
  </div>
</template>