<script setup lang="ts">
import { ref } from 'vue'
import { FileText, Plus, X, Check, Clock, Trash2 } from 'lucide-vue-next'
import api from '@/stores/api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import type { Product } from '@/type'
import { générerBonCommandePDF } from '@/services/pdfService'

// --- INTERFACES TYPES ---
interface NewOrderItem {
  productId: string
  quantiteCommandee: number
  prixUnitairePrevu: number
}

// --- ÉTATS ---
const queryClient = useQueryClient()
const showCreatePanel = ref(false)

// Formulaire de création
const fournisseurSelectionne = ref('ETS EUROHI & FILS')
const itemsCommande = ref<NewOrderItem[]>([
  { productId: '', quantiteCommandee: 1, prixUnitairePrevu: 0 }
])

const listeFournisseurs = ['ETS EUROHI & FILS', 'AHOUANDJO DAVID', 'Hananim Distribution', 'Autre']

// --- QUERIES (Bons de commande & Catalogue produits pour le select) ---
const { data: bonsCommande, isLoading, isError } = useQuery({
  queryKey: ['purchaseOrders'],
  queryFn: async () => {
    const res = await api.get('/api/admin/bons-commande')
    return res.data
  }
})

const { data: produitsCatalogue } = useQuery<Product[]>({
  queryKey: ['productsMin'],
  queryFn: async () => {
    const res = await api.get('/api/admin/products')
    return res.data.products
  }
})

// --- MUTATION (Envoi du formulaire) ---
const createMutation = useMutation({
  mutationFn: async (payload: any) => {
    return await api.post('/api/admin/bons-commande', payload)
  },
  onSuccess: (response) => {
    queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] })
    const bonCree = response?.data?.bon
    
    if (bonCree) {
      // 3. Lancement automatique de l'impression et téléchargement du PDF
      générerBonCommandePDF(bonCree, produitsCatalogue.value || [])
    }
    closeCreatePanel()
    // Optionnel : ajouter ici un toast de succès (ex: toast.success)
  }
})

// --- ACTIONS FORMULAIRE ---
const ajouterLigneProduit = () => {
  itemsCommande.value.push({ productId: '', quantiteCommandee: 1, prixUnitairePrevu: 0 })
}

const retirerLigneProduit = (index: number) => {
  if (itemsCommande.value.length > 1) {
    itemsCommande.value.splice(index, 1)
  }
}

const soumettreBonCommande = () => {
  // Filtrer les lignes vides par sécurité
  const itemsValides = itemsCommande.value.filter(item => item.productId !== '')
  if (itemsValides.length === 0) return

  createMutation.mutate({
    fournisseur: fournisseurSelectionne.value,
    items: itemsValides
  })
}

const closeCreatePanel = () => {
  showCreatePanel.value = false
  fournisseurSelectionne.value = 'ETS EUROHI & FILS'
  itemsCommande.value = [{ productId: '', quantiteCommandee: 1, prixUnitairePrevu: 0 }]
}

const calculerTotalBon = (items: any[]) => {
  return items.reduce((sum, item) => sum + (item.quantiteCommandee * item.prixUnitairePrevu), 0)
}

const formatPrixCFA = (valeur: number) => {
  return new Intl.NumberFormat('fr-BJ', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }).format(valeur)
}
</script>

<template>
  <div class="space-y-6 animate-fadeIn text-xs font-medium text-gray-600">

    <!-- BARRE D'ENTÊTE -->
    <div class="bg-white p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
      <h1 class="font-display font-bold text-xl text-noir flex items-center gap-2">
        <FileText class="w-5 h-5 text-foret stroke-[2.5]" />
        Bons de Commande
      </h1>
      <button @click="showCreatePanel = true" class="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-foret hover:bg-foret/90 text-white rounded-xl font-bold tracking-wide shadow-sm transition-all self-end sm:self-auto">
        <Plus class="w-4 h-4 stroke-[2.5]" />
        Générer un bon
      </button>
    </div>

    <!-- GRILLE PRINCIPALE -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      
      <!-- HISTORIQUE DES BONS ÉMIS -->
      <div :class="[showCreatePanel ? 'lg:col-span-2' : 'lg:col-span-3', 'bg-white rounded-2xl border border-gray-100 shadow-3xs overflow-hidden transition-all']">
        <div v-if="isLoading" class="text-sm text-gray-500 p-8 text-center">
          Chargement du registre d'approvisionnement...
        </div>
        <div v-else-if="isError" class="p-4 bg-red-50 text-red-700 text-sm rounded-xl">
          Erreur lors de la récupération des bons de commande.
        </div>
        <div v-else class="p-4 overflow-x-auto">
          <div v-if="!bonsCommande || bonsCommande.length === 0" class="text-center py-8 text-sm text-gray-400">
            Aucun bon de commande n'a été émis pour le moment.
          </div>

          <table v-else class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-gray-50/70 border-b border-gray-100 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                <th class="py-3 px-4">Code Référence</th>
                <th class="py-3 px-4">Fournisseur ciblé</th>
                <th class="py-3 px-4 text-center">Articles</th>
                <th class="py-3 px-4 text-right">Montant Prévu</th>
                <th class="py-3 px-4 text-center">Statut</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50 text-noir">
              <tr v-for="bon in bonsCommande" :key="bon._id" class="hover:bg-gray-50/50 transition-colors">
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
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- VOLET DE CRÉATION LATÉRAL (Formulaire d'émission) -->
      <div v-if="showCreatePanel" class="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4 animate-fadeIn sticky top-6">
        <div class="flex items-center justify-between border-b pb-2.5">
          <h3 class="font-bold text-noir text-sm">Nouveau Bon de Commande</h3>
          <button @click="closeCreatePanel" class="p-1 bg-gray-50 hover:bg-gray-100 rounded-lg text-gray-400 transition-all">
            <X class="w-3.5 h-3.5" />
          </button>
        </div>

        <form @submit.prevent="soumettreBonCommande" class="space-y-4">
          <!-- Sélection du fournisseur -->
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Fournisseur</label>
            <select v-model="fournisseurSelectionne" class="w-full px-3 py-2 bg-[#f9f9fb] border border-gray-200 rounded-xl text-xs font-medium text-noir focus:outline-none focus:border-foret focus:bg-white transition-all">
              <option v-for="f in listeFournisseurs" :key="f" :value="f">{{ f }}</option>
            </select>
          </div>

          <!-- Lignes de produits -->
          <div class="space-y-2">
            <label class="text-[10px] uppercase font-bold text-gray-400 tracking-wider block">Articles à commander</label>
            
            <div v-for="(item, index) in itemsCommande" :key="index" class="p-3 bg-gray-50/50 rounded-xl border border-gray-100 space-y-2 relative">
              <button v-if="itemsCommande.length > 1" type="button" @click="retirerLigneProduit(index)" class="absolute top-2 right-2 text-gray-300 hover:text-red-500 transition-colors">
                <Trash2 class="w-3.5 h-3.5" />
              </button>

              <!-- Sélection du produit -->
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

            <button type="button" @click="ajouterLigneProduit" class="w-full py-1.5 border border-dashed border-gray-300 rounded-xl text-gray-400 hover:text-foret hover:border-foret transition-all font-bold text-center">
              + Ajouter un produit
            </button>
          </div>

          <!-- Actions de validation -->
          <div class="pt-2 flex items-center gap-3">
            <button type="button" @click="closeCreatePanel" class="w-1/2 py-2 border border-gray-200 text-gray-500 font-bold rounded-xl hover:bg-gray-50 transition-all text-center">
              Annuler
            </button>
            <button type="submit" :disabled="createMutation.isPending.value" class="w-1/2 py-2 bg-foret text-white font-bold rounded-xl hover:bg-foret/90 disabled:opacity-50 transition-all text-center">
              {{ createMutation.isPending.value ? 'Génération...' : 'Valider le bon' }}
            </button>
          </div>
        </form>
      </div>

    </div>
  </div>
</template>