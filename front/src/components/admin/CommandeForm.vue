<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import api from '@/stores/api'
import { X, User, CheckCircle2, ArrowRight, Plus, Minus, Trash2, PlusCircle } from 'lucide-vue-next'
import type { Client, Product, Commande } from '@/type'

interface AdjustedItem {
  productId: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  isExtra: boolean;
}

// --- PROPS & EMITS ---
const props = defineProps<{
  open: boolean,
  clients: Client[] | [],
  allProducts: Product[] | [],
  mode: 'create' | 'edit' | 'detail',
  commande?: Commande | null
}>()

const emit = defineEmits(['close', 'success'])

// --- ÉTATS DU WIZARD ---
const step = ref(1)
const queryClient = useQueryClient()
const isSubmitting = ref(false)

// Données du formulaire de commande
const clientId = ref('')
const selectedPackSlug = ref<'essentiel' | 'equilibre' | 'confort' | ''>('')
const paiement = ref('Mobile Money')
const notes = ref('')

// Pour l'ajout d'un produit hors-pack à l'étape 3
const selectedExtraProductId = ref('')

// Stockage réactif des produits finaux ajustés
const adjustedItems = ref<AdjustedItem[]>([])

// --- COMPUTES DE CONFIGURATION MODE ---
const isReadOnly = computed(() => props.mode === 'detail')
const modalTitle = computed(() => {
  if (props.mode === 'detail') return 'Détails de la commande'
  if (props.mode === 'edit') return 'Modifier la commande'
  return 'Nouvelle commande'
})

// Accueillir les données de la commande existante si modification ou détails
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    step.value = 1 // Réinitialise toujours à l'étape 1 à l'ouverture
    if ((props.mode === 'edit' || props.mode === 'detail') && props.commande) {
      clientId.value = props.commande.userId || props.commande.clientName || ''
      
      // Retirer le préfixe 'ahi-' si présent dans le slug de la base
      const slug = props.commande.formuleSlug || ''
      selectedPackSlug.value = slug.replace('ahi-', '') as any
      
      paiement.value = props.commande.modePaiement || 'Mobile Money'
      notes.value = props.commande.notes || ''
      
      // Mapper l'historique des produits figés
      if (props.commande.productsSnapshot) {
        adjustedItems.value = props.commande.productsSnapshot.map((item: any) => ({
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          isExtra: !!item.isExtra
        }))
      }
    } else {
      resetForm()
    }
  }
})

// --- CALCULS AUXILIAIRES ---
const cl = computed(() => props.clients.find(c => String(c._id) === String(clientId.value)))

// Filtre pour ne pas afficher dans la liste "Ajouter" les produits déjà présents dans le panier
const availableExtras = computed(() => {
  return props.allProducts.filter(p => 
    !adjustedItems.value.some(item => String(item.productId) === String(p._id))
  )
})

// --- TANSTACK QUERY (Formule de Base - Uniquement en mode création) ---
const { data: packDetails, isLoading: isLoadingPack } = useQuery({
  queryKey: ['orderPackDetails', () => selectedPackSlug.value],
  queryFn: async () => {
    const slug = selectedPackSlug.value
    if (!slug) return null
    const response = await api.get(`/api/admin/formulas/${slug}`)
    return response.data
  },
  // On désactive la requête automatique si on est en édition/détails car on possède déjà le snapshot exact
  enabled: computed(() => selectedPackSlug.value !== '' && (props.mode === 'create' || props.mode === 'edit'))
})

// Initialise le panier modifiable uniquement à la sélection d'un pack en mode création et edition
watch(packDetails, (newDetails) => {
  if ((props.mode === 'create' || props.mode === 'edit') && newDetails && newDetails.items) {
    adjustedItems.value = newDetails.items.map((item: AdjustedItem) => {
      const uPrice = item.unitPrice || (item.quantity > 0 ? Math.round(item.totalPrice / item.quantity) : 0)
      return {
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: uPrice,
        totalPrice: item.totalPrice || (item.quantity * uPrice),
        isExtra: false
      }
    })
  }
}, { deep: true })  

// CALCUL DYNAMIQUE DU PRIX TOTAL (Somme des items du panier)
const finalPackPrice = computed(() => {
  return adjustedItems.value.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0)
})

// --- ACTIONS SUR LES PRODUITS (Bloquées si lecture seule) ---
const incrementQty = (index: number) => {
  if (isReadOnly.value) return
  const item = adjustedItems.value[index]
  if (item) {
    item.quantity++
    item.totalPrice = item.quantity * item.unitPrice
  }
}

const decrementQty = (index: number) => {
  if (isReadOnly.value) return
  const item = adjustedItems.value[index]
  if (item) {
    if (item.quantity > 1) {
      item.quantity--
      item.totalPrice = item.quantity * item.unitPrice
    } else {
      removeItem(index)
    }
  }
}

const removeItem = (index: number) => {
  if (isReadOnly.value) return
  adjustedItems.value.splice(index, 1)
}

const addExtraProduct = () => {
  if (isReadOnly.value || !selectedExtraProductId.value) return
  
  const prod = props.allProducts.find(p => String(p._id) === String(selectedExtraProductId.value))
  if (prod) {
    adjustedItems.value.push({
      productId: prod._id,
      name: prod.name,
      quantity: 1,
      unit: prod.unit || 'unité',
      unitPrice: prod.priceUnit,
      totalPrice: prod.priceUnit,
      isExtra: true
    })
    selectedExtraProductId.value = ''
  }
}

const resetForm = () => {
  step.value = 1
  clientId.value = ''
  selectedPackSlug.value = ''
  paiement.value = 'Mobile Money'
  notes.value = ''
  adjustedItems.value = []
  selectedExtraProductId.value = ''
}

// --- SOUMISSION DE LA COMMANDE ---
const submitOrder = async () => {
  if (!clientId.value || !selectedPackSlug.value || isReadOnly.value) return
  isSubmitting.value = true

  try {
    const payload = {
      client: clientId.value,
      formuleSlug: `ahi-${selectedPackSlug.value}`,
      modePaiement: paiement.value,
      notes: notes.value,
      totalPrice: finalPackPrice.value,
      productsSnapshot: adjustedItems.value
    }

    if (props.mode === 'edit' && props.commande?.id) {
      // Route de modification de commande
      await api.put(`/api/admin/orders/${props.commande.id}`, payload)
    } else {
      // Route de création classique
      await api.post('/api/admin/orders', payload)
    }

    queryClient.invalidateQueries({ queryKey: ['orders'] })
    emit('success')
    resetForm()
    emit('close')
  } catch (error) {
    console.error("Erreur lors de la soumission de la commande:", error)
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs font-medium text-xs text-gray-600">
    <div class="bg-white rounded-2xl border border-gray-100 shadow-xl max-w-md w-full overflow-hidden flex flex-col max-h-[90vh]">
      
      <div class="p-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 class="font-display font-bold text-sm text-noir">{{ modalTitle }}</h3>
          <p class="text-[10px] text-gray-400">
            {{ isReadOnly ? 'Consultation des détails de l\'historique' : 'Gestion de la tarification et du panier' }}
          </p>
        </div>
        <button @click="emit('close')" class="cursor-pointer p-1.5 hover:bg-gray-50 rounded-lg text-gray-400 transition-colors">
          <X class="w-4 h-4" />
        </button>
      </div>

      <div class="px-4 pt-4 flex gap-1">
        <div v-for="s in [{n:1,l:'Client'}, {n:2,l:'Formule'}, {n:3,l:'Ajust.'}, {n:4,l:'Validation'}]" :key="s.n"
          :class="[step === s.n ? 'bg-foret text-white border-foret font-bold' : step > s.n ? 'bg-emerald-50 text-foret border-emerald-200' : 'bg-gray-50 text-gray-400 border-gray-200','flex-1 py-1.5 text-[10px] text-center border rounded-lg transition-all']">
          <span v-if="step > s.n">✓ </span>{{ s.l }}
        </div>
      </div>

      <div class="p-5 overflow-y-auto flex-1 space-y-4">
        
        <div v-if="step === 1" class="space-y-3">
          <label class="block font-bold text-noir text-[10px] uppercase tracking-wide">Sélectionner le destinataire</label>
          <select v-model="clientId" :disabled="isReadOnly" class="w-full px-3 py-2.5 bg-[#f9f9fb] border border-gray-200 rounded-xl text-xs text-noir focus:outline-none focus:border-foret disabled:opacity-70">
            <option value="" disabled>— Choisir un client disponible —</option>
            <option v-for="c in clients" :key="c._id" :value="c._id">{{ c.username }} · {{ c.telephone }}</option>
          </select>
          <button @click="step = 2" :disabled="!clientId" class="cursor-pointer w-full mt-2 py-2.5 bg-foret text-white font-bold rounded-xl flex items-center justify-center gap-1 disabled:opacity-40">
            Sélectionner la formule <ArrowRight class="w-3.5 h-3.5" />
          </button>
        </div>

        <div v-if="step === 2" class="space-y-4">
          <div class="p-2.5 bg-gray-50 rounded-xl border border-gray-100 flex items-center gap-2">
            <User class="w-3.5 h-3.5 text-gray-400" />
            <span>Client : <strong class="text-noir">{{ cl?.username || commande?.clientName }}</strong></span>
          </div>

          <div class="grid grid-cols-1 gap-2">
            <button v-for="pack in ['essentiel', 'equilibre', 'confort']" :key="pack" 
              :disabled="isReadOnly"
              @click="selectedPackSlug = pack as any" 
              :class="[selectedPackSlug === pack ? 'border-foret bg-emerald-50/50' : 'border-gray-200 bg-white', 'flex items-center justify-between p-3 rounded-xl border text-left cursor-pointer disabled:opacity-80 disabled:cursor-not-allowed']">
              <span class="font-bold text-noir capitalize">Ahi-{{ pack }}</span>
              <span v-if="selectedPackSlug === pack && isLoadingPack" class="text-[10px] text-gray-400">Chargement...</span>
            </button>
          </div>

          <div v-if="selectedPackSlug && packDetails" class="bg-gray-50 border border-gray-100 rounded-xl overflow-hidden shadow-2xs">
            <div class="px-3 py-2 bg-gray-100/70 font-semibold text-gray-500 flex justify-between items-center border-b">
              <span class="flex items-center gap-1"><Layers class="w-3.5 h-3.5" /> Dotation auto ({{ packDetails.itemCount }} produits)</span>
              <strong class="font-mono text-noir font-bold">{{ packDetails.formule.prixActuel.toLocaleString() }} F</strong>
            </div>
            <div class="max-h-36 overflow-y-auto divide-y divide-gray-100 bg-white">
              <div v-for="item in packDetails.items" :key="item.productId" class="flex justify-between px-3 py-1.5 text-[11px]">
                <span class="text-gray-700 font-medium">{{ item.name }}</span>
                <span class="text-gray-400 font-mono">{{ item.quantity }} {{ item.unit }} · {{ item.totalPrice.toLocaleString() }} F</span>
              </div>
            </div>
          </div>

          <div class="flex gap-2 pt-2">
            <button @click="step = 1" class="cursor-pointer flex-1 py-2.5 bg-gray-50 border border-gray-200 rounded-xl">← Client</button>
            <button @click="step = 3" :disabled="!selectedPackSlug" class="cursor-pointer flex-1 py-2.5 bg-foret text-white font-bold rounded-xl">Ajustements →</button>
          </div>
        </div>

        <div v-if="step === 3" class="space-y-4">
          
          <div v-if="!isReadOnly" class="bg-gray-50 p-2.5 border border-gray-200 rounded-xl space-y-2">
            <label class="block font-bold text-noir text-[10px] uppercase tracking-wide">➕ Ajouter un produit hors-pack</label>
            <div class="flex gap-2">
              <select v-model="selectedExtraProductId" class="flex-1 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-noir focus:outline-none focus:border-foret">
                <option value="">— Choisir un produit du catalogue —</option>
                <option v-for="p in availableExtras" :key="p._id" :value="p._id">
                  {{ p.name }} ({{ p.priceUnit }} F / {{ p.unit || 'u' }})
                </option>
              </select>
              <button type="button" @click="addExtraProduct" :disabled="!selectedExtraProductId" class="cursor-pointer px-3 bg-foret text-white rounded-lg disabled:opacity-40 flex items-center justify-center">
                <PlusCircle class="w-4 h-4" />
              </button>
            </div>
          </div>

          <div class="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-2xs">
            <div class="px-3 py-2 bg-gray-50 border-b font-bold text-noir flex justify-between items-center text-[10px] uppercase tracking-wider">
              <span>Panier de livraison</span>
              <span class="text-foret font-mono text-xs font-bold">{{ finalPackPrice.toLocaleString() }} F</span>
            </div>
            
            <div class="divide-y divide-gray-100 max-h-40 overflow-y-auto">
              <div v-for="(item, idx) in adjustedItems" :key="item.productId" class="p-2 flex items-center justify-between gap-2">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-1">
                    <span class="text-noir font-bold truncate text-[11px]">{{ item.name }}</span>
                    <span v-if="item.isExtra" class="px-1 text-[8px] bg-amber-100 text-amber-700 rounded-sm font-extrabold uppercase tracking-wide">Hors-Pack</span>
                  </div>
                  <span class="text-[10px] text-gray-400 font-mono">{{ item.unitPrice.toLocaleString() }} F / {{ item.unit }}</span>
                </div>
                
                <div class="flex items-center gap-2 shrink-0">
                  <div class="flex items-center border border-gray-200 rounded-lg bg-gray-50 overflow-hidden">
                    <button type="button" :disabled="isReadOnly" @click="decrementQty(idx)" class="p-1 hover:bg-gray-200 text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed"><Minus class="w-3 h-3" /></button>
                    <span class="px-1.5 font-mono font-bold text-noir text-[11px] min-w-5 text-center">{{ item.quantity }}</span>
                    <button type="button" :disabled="isReadOnly" @click="incrementQty(idx)" class="p-1 hover:bg-gray-200 text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed"><Plus class="w-3 h-3" /></button>
                  </div>
                  <button v-if="!isReadOnly" type="button" @click="removeItem(idx)" class="cursor-pointer p-1 text-red-400 hover:text-red-600"><Trash2 class="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          </div>

          <div class="space-y-2">
            <label class="block font-bold text-noir text-[10px] uppercase tracking-wide">Canal de Règlement</label>
            <div class="flex gap-1">
              <button v-for="m in ['Mobile Money', 'Espèces', 'Acompte']" :key="m" 
                :disabled="isReadOnly"
                @click="paiement = m" 
                :class="[paiement === m ? 'bg-foret text-white' : 'bg-white text-gray-500 border-gray-200', 'flex-1 py-1.5 rounded-lg border text-center transition-all cursor-pointer disabled:cursor-not-allowed']">
                {{ m }}
              </button>
            </div>
          </div>

          <textarea v-model="notes" :disabled="isReadOnly" rows="2" class="w-full px-3 py-2 bg-[#f9f9fb] border border-gray-200 rounded-xl focus:outline-none focus:border-foret text-[11px] disabled:opacity-70" placeholder="Directives logistiques particulières..."></textarea>

          <div class="flex gap-2 pt-1">
            <button @click="step = 2" class="cursor-pointer flex-1 py-2 bg-gray-50 border border-gray-200 rounded-xl">← Offre</button>
            <button @click="step = 4" :disabled="adjustedItems.length === 0" class="cursor-pointer flex-1 py-2 bg-foret text-white font-bold rounded-xl">Vérification →</button>
          </div>
        </div>

        <div v-if="step === 4" class="space-y-4">
          <div class="p-2.5 bg-emerald-50 border border-emerald-200 text-foret font-semibold rounded-xl flex items-center gap-2">
            <CheckCircle2 class="w-4 h-4 text-foret" />
            <span>{{ isReadOnly ? 'Récapitulatif de l\'historique archivé' : 'Panier personnalisé prêt pour validation' }}</span>
          </div>

          <div class="bg-gray-50 border border-gray-100 rounded-xl p-3 space-y-2 text-[11px]">
            <div class="flex justify-between"><span>Client :</span><strong class="text-noir">{{ cl?.username || commande?.clientName }}</strong></div>
            <div class="flex justify-between"><span>Base formule :</span><strong class="text-noir uppercase">Ahi-{{ selectedPackSlug }}</strong></div>
            <div class="flex justify-between"><span>Nombre d'articles :</span><strong class="text-noir font-mono">{{ adjustedItems.length }}</strong></div>
            <div class="flex justify-between"><span>Prix total calculé :</span><strong class="text-foret font-mono text-sm font-bold">{{ finalPackPrice.toLocaleString() }} FCFA</strong></div>
            <div class="flex justify-between"><span>Mode paiement :</span><span class="px-1.5 py-0.5 bg-gray-200 text-noir rounded text-[9px] font-bold uppercase">{{ paiement }}</span></div>
            <div v-if="commande?.statut" class="flex justify-between"><span>Statut actuel :</span><span class="text-noir font-bold">{{ commande.statut }}</span></div>
          </div>

          <div class="flex gap-2 pt-2">
            <button @click="step = 3" class="cursor-pointer flex-1 py-2.5 bg-gray-50 border border-gray-200 rounded-xl">← Ajuster</button>
            
            <button v-if="!isReadOnly" @click="submitOrder" :disabled="isSubmitting" class="cursor-pointer flex-1 py-2.5 bg-foret text-white font-bold rounded-xl">
              <span v-if="isSubmitting">Archivage...</span>
              <span v-else-if="mode === 'edit'">💾 Mettre à jour la commande</span>
              <span v-else>✅ Enregistrer la commande</span>
            </button>
            <button v-else @click="emit('close')" class="cursor-pointer flex-1 py-2.5 bg-noir text-white font-bold rounded-xl">
              Fermer la vue
            </button>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>