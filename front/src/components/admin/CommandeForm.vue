<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import api from '@/stores/api'
import { X, User, Layers, CreditCard, CheckCircle2, ArrowRight, ArrowLeft } from 'lucide-vue-next'
import type { Client } from '@/type'

// --- PROPS & EMITS ---
const props = defineProps<{
  open: boolean,
  clients: Client[] | []
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

// --- CALCULS AUXILIAIRES ---
const cl = computed(() => props.clients.find(c => String(c._id) === String(clientId.value)))

// Déduction du samedi suivant pour la livraison prévue
const nextSaturday = computed(() => {
  const today = new Date()
  const resultDate = new Date(today)
  resultDate.setDate(today.getDate() + (6 - today.getDay() + 7) % 7 || 7)
  return resultDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
})

// --- TANSTACK QUERY ---
// Charge la composition et les prix du pack sélectionné en temps réel
const { data: packDetails, isLoading: isLoadingPack } = useQuery({
  queryKey: ['orderPackDetails', selectedPackSlug],
  queryFn: async ({ queryKey }) => {
    const [_, slug] = queryKey
    if (!slug) return null
    const response = await api.get(`/api/admin/formulas/${slug}`)
    return response.data
  },
  enabled: computed(() => selectedPackSlug.value !== '')
})

// Réinitialisation lors de la fermeture
const resetForm = () => {
  step.value = 1
  clientId.value = ''
  selectedPackSlug.value = ''
  paiement.value = 'Mobile Money'
  notes.value = ''
}

// --- SOUMISSION DE LA COMMANDE ---
const submitOrder = async () => {
  if (!clientId.value || !selectedPackSlug.value) return
  isSubmitting.value = true

  try {
    const payload = {
      client: clientId.value,
      formuleSlug: `ahi-${selectedPackSlug.value}`,
      modePaiement: paiement.value,
      notes: notes.value,
      totalPrice: packDetails.value?.formule.prixActuel
    }

    await api.post('/api/admin/orders', payload)
    
    // Invalider le cache des commandes pour rafraîchir la liste principale
    queryClient.invalidateQueries({ queryKey: ['orders'] })
    
    emit('success')
    resetForm()
    emit('close')
  } catch (error) {
    console.error("Erreur lors de la création de la commande:", error)
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
          <h3 class="font-display font-bold text-sm text-noir">Nouvelle commande</h3>
          <p class="text-[10px] text-gray-400">Enregistrement d'une souscription client</p>
        </div>
        <button @click="emit('close')" class="p-1.5 hover:bg-gray-50 rounded-lg text-gray-400 transition-colors">
          <X class="w-4 h-4" />
        </button>
      </div>

      <div class="px-4 pt-4 flex gap-1">
        <div 
          v-for="s in [{n:1,l:'Client'}, {n:2,l:'Formule'}, {n:3,l:'Ajust.'}, {n:4,l:'Validation'}]" 
          :key="s.n"
          :class="[
            step === s.n ? 'bg-foret text-white border-foret font-bold' : step > s.n ? 'bg-emerald-50 text-foret border-emerald-200' : 'bg-gray-50 text-gray-400 border-gray-200',
            'flex-1 py-1.5 text-[10px] text-center border rounded-lg transition-all'
          ]"
        >
          <span v-if="step > s.n">✓ </span>{{ s.l }}
        </div>
      </div>

      <div class="p-5 overflow-y-auto flex-1 space-y-4">

        <div v-if="step === 1" class="space-y-3">
          <label class="block font-bold text-noir text-[10px] uppercase tracking-wide">Sélectionner le destinataire</label>
          <div class="relative">
            <select v-model="clientId" class="w-full pl-3 pr-8 py-2.5 bg-[#f9f9fb] border border-gray-200 rounded-xl text-xs text-noir focus:outline-none focus:border-foret transition-all">
              <option value="" disabled>— Choisir un client disponible —</option>
              <option v-for="c in clients" :key="c._id" :value="c._id">{{ c.username }} · {{ c.telephone }}</option>
            </select>
          </div>
          
          <button 
            @click="step = 2" 
            :disabled="!clientId"
            class="cursor-pointer w-full mt-2 py-2.5 bg-foret text-white font-bold rounded-xl flex items-center justify-center gap-1 shadow-xs disabled:opacity-40 transition-all"
          >
            Sélectionner la formule <ArrowRight class="w-3.5 h-3.5" />
          </button>
        </div>

        <div v-if="step === 2" class="space-y-4">
          <div class="p-2.5 bg-gray-50 rounded-xl border border-gray-100 flex items-center gap-2">
            <User class="w-3.5 h-3.5 text-gray-400" />
            <span>Client : <strong class="text-noir">{{ cl?.username }}</strong> ({{ cl?.telephone }})</span>
          </div>

          <label class="block font-bold text-noir text-[10px] uppercase tracking-wide">Choisir l'offre hebdomadaire</label>
          <div class="grid grid-cols-1 gap-2">
            <button @click="selectedPackSlug = 'essentiel'" :class="[selectedPackSlug === 'essentiel' ? 'border-gray-500 bg-gray-50/70' : 'border-gray-200 bg-white', 'cursor-pointer flex items-center justify-between p-3 rounded-xl border text-left transition-all']">
              <div class="flex items-center gap-2">
                <div class="w-2 h-2 rounded-full bg-gray-500"></div>
                <div><span class="font-bold text-noir block">Ahi-Essentiel</span><span class="text-[10px] text-gray-400">Dotation de base</span></div>
              </div>
            </button>

            <button @click="selectedPackSlug = 'equilibre'" :class="[selectedPackSlug === 'equilibre' ? 'border-foret bg-emerald-50/50' : 'border-gray-200 bg-white', 'cursor-pointer flex items-center justify-between p-3 rounded-xl border text-left transition-all']">
              <div class="flex items-center gap-2">
                <div class="w-2 h-2 rounded-full bg-foret"></div>
                <div><span class="font-bold text-foret block">Ahi-Équilibré</span><span class="text-[10px] text-gray-400">Dotation ×2</span></div>
              </div>
            </button>

            <button @click="selectedPackSlug = 'confort'" :class="[selectedPackSlug === 'confort' ? 'border-savane bg-amber-50/50' : 'border-gray-200 bg-white', 'cursor-pointer flex items-center justify-between p-3 rounded-xl border text-left transition-all']">
              <div class="flex items-center gap-2">
                <div class="w-2 h-2 rounded-full bg-savane"></div>
                <div><span class="font-bold text-savane block">Ahi-Confort</span><span class="text-[10px] text-gray-400">Dotation maximale</span></div>
              </div>
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
            <button @click="step = 1" class="cursor-pointer flex-1 py-2.5 bg-gray-50 border border-gray-200 text-gray-600 font-bold rounded-xl flex items-center justify-center gap-1"><ArrowLeft class="w-3.5 h-3.5" /> Client</button>
            <button @click="step = 3" :disabled="!selectedPackSlug || isLoadingPack" class="cursor-pointer flex-1 py-2.5 bg-foret text-white font-bold rounded-xl flex items-center justify-center gap-1 disabled:opacity-40"><span v-if="isLoadingPack">Calcul...</span><span v-else class="flex items-center gap-1">Ajustements <ArrowRight class="w-3.5 h-3.5" /></span></button>
          </div>
        </div>

        <div v-if="step === 3" class="space-y-4">
          <div class="text-gray-400 text-[11px]">Fiche d'affectation pour <strong class="text-noir font-semibold">{{ cl?.username }}</strong> · Pack <span class="uppercase font-bold text-noir">{{ selectedPackSlug }}</span></div>
          
          <label class="block font-bold text-noir text-[10px] uppercase tracking-wide">Canal de Règlement</label>
          <div class="flex gap-2">
            <button v-for="m in ['Mobile Money', 'Espèces', 'Acompte']" :key="m" @click="paiement = m" :class="[paiement === m ? 'bg-foret text-white border-foret font-bold' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50', 'cursor-pointer flex-1 py-2 rounded-xl border text-center transition-all']">
              {{ m }}
            </button>
          </div>

          <label class="block font-bold text-noir text-[10px] uppercase tracking-wide">Directives de préparation & Notes</label>
          <textarea v-model="notes" rows="3" class="w-full px-3 py-2 bg-[#f9f9fb] border border-gray-200 rounded-xl focus:outline-none focus:border-foret resize-none" placeholder="Ex: Ajouter des consignes d'expédition ou modifications logistiques..."></textarea>

          <div class="flex gap-2 pt-2">
            <button @click="step = 2" class="cursor-pointer flex-1 py-2.5 bg-gray-50 border border-gray-200 text-gray-600 font-bold rounded-xl flex items-center justify-center gap-1"><ArrowLeft class="w-3.5 h-3.5" /> Offre</button>
            <button @click="step = 4" class="cursor-pointer flex-1 py-2.5 bg-foret text-white font-bold rounded-xl flex items-center justify-center gap-1">Vérification <ArrowRight class="w-3.5 h-3.5" /></button>
          </div>
        </div>

        <div v-if="step === 4" class="space-y-4">
          <div class="p-3 bg-emerald-50 border border-emerald-200 text-foret font-semibold rounded-xl flex items-center gap-2">
            <CheckCircle2 class="w-4 h-4 shrink-0 text-foret" />
            <span>Tous les paramètres sont au vert pour archivage</span>
          </div>

          <div class="bg-gray-50/50 border border-gray-100 rounded-xl p-3.5 space-y-2 text-[11px] text-gray-500">
            <div class="flex justify-between"><span class="font-medium">Client bénéficiaire :</span><strong class="text-noir font-bold">{{ cl?.username }}</strong></div>
            <div class="flex justify-between"><span class="font-medium">Formule choisie :</span><strong class="text-noir uppercase font-bold">Ahi-{{ selectedPackSlug }}</strong></div>
            <div class="flex justify-between"><span class="font-medium">Tarification globale :</span><strong class="text-foret font-mono font-bold text-sm">{{ packDetails?.formule.prixActuel.toLocaleString() }} FCFA</strong></div>
            <div class="flex justify-between items-center"><span class="font-medium">Mode de paiement :</span><span class="px-2 py-0.5 bg-gray-200 text-noir rounded-md text-[10px] font-bold">{{ paiement }}</span></div>
            <div class="flex justify-between"><span class="font-medium">Livraison programmée :</span><strong class="text-noir font-bold">Samedi {{ nextSaturday }}</strong></div>
          </div>

          <div class="flex gap-2 pt-2">
            <button @click="step = 3" class="cursor-pointer flex-1 py-2.5 bg-gray-50 border border-gray-200 text-gray-600 font-bold rounded-xl flex items-center justify-center gap-1"><ArrowLeft class="w-3.5 h-3.5" /> Notes</button>
            <button @click="submitOrder" :disabled="isSubmitting" class="cursor-pointer flex-1 py-2.5 bg-foret text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50">
              {{ isSubmitting ? 'Archivage...' : '✅ Enregistrer la commande' }}
            </button>
          </div>
        </div>

      </div>

    </div>
  </div>
</template>