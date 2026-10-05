<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import api from '@/stores/api'
import { Layers, ShoppingBag, CheckCircle, ShieldAlert, Save, Loader2 } from 'lucide-vue-next'
import type { Formule, ProductItem } from '@/type'

interface PackDetailsResponse {
  formule: Formule;
  itemCount: number;
  items: ProductItem[];
  prixCalcule: number; // Coût des matières aux prix du catalogue (le prix de vente reste formule.prixActuel)
  prixManquants: number; // Produits dont le prix est à renseigner : coût incomplet
}

const queryClient = useQueryClient()

// 1. Extension de l'état pour inclure 'reserve' et 'fraicheur'
const activePack = ref<'essentiel' | 'equilibre' | 'confort' | 'reserve' | 'fraicheur'>('essentiel')

// Champ pour le prix général fixé par l'admin
const customPrice = ref<number | null>(null)
const saveSuccess = ref(false)

// --- TANSTACK QUERY (GET) ---
const fetchPackDetails = async ({ queryKey }: { queryKey: any }): Promise<PackDetailsResponse> => {
  const [_, packType] = queryKey
  const response = await api.get(`/api/admin/formulas/${packType}`)
  return response.data
}

const { data, isLoading, isError, error } = useQuery({
  queryKey: ['packDetails', activePack],
  queryFn: fetchPackDetails,
})

// Synchroniser le prix personnalisé lorsque les données du pack sont chargées ou changent
watch(data, (newData) => {
  if (newData?.formule) {
    // Si la formule a un prix fixé personnalisé, on l'utilise, sinon le prix généré
    customPrice.value = newData.formule.prixCommercial ?? newData.formule.prixActuel ?? null
  }
}, { immediate: true })

// Reset le message de succès au changement d'onglet
watch(activePack, () => {
  saveSuccess.value = false
})

// --- TANSTACK MUTATION (UPDATE PRIX) ---
const updatePriceMutation = useMutation({
  mutationFn: async (price: number) => {
    const response = await api.patch(`/api/admin/formulas/${activePack.value}/price`, {
      prixFixe: price
    })
    return response.data
  },
  onSuccess: () => {
    // Invalider le cache pour rafraîchir les données
    queryClient.invalidateQueries({ queryKey: ['packDetails', activePack] })
    saveSuccess.value = true
    setTimeout(() => {
      saveSuccess.value = false
    }, 3000)
  }
})

const handleSavePrice = () => {
  if (customPrice.value !== null && customPrice.value >= 0) {
    updatePriceMutation.mutate(customPrice.value)
  }
}

// 2. Classes de couleurs dynamiques étendues pour les badges et synthèses
const getPackColorClass = (pack: string) => {
  if (pack === 'essentiel') return 'border-gray-500 bg-gray-50 text-gray-700'
  if (pack === 'equilibre') return 'border-foret bg-emerald-50 text-foret'
  if (pack === 'confort') return 'border-savane bg-amber-50 text-savane'
  if (pack === 'reserve') return 'border-indigo-600 bg-indigo-50 text-indigo-700'
  return 'border-rose-500 bg-rose-50 text-rose-700'
}

// 3. Texte dynamique pour la période couverte
// Logique de commande et cycle : lus dans la formule (référentiel packs v4)
const getPeriodText = computed(() => {
  const f = data.value?.formule
  if (!f) return ''
  const cycle = f.cycleJours === 7 ? 'chaque semaine' : `tous les ${f.cycleJours} jours`
  return `${f.logiqueCommande || 'à renseigner'} · cycle : ${cycle}`
})
</script>

<template>
  <div class="space-y-6 animate-fadeIn text-xs font-medium text-gray-600">
    
    <div class="bg-white p-4 rounded-2xl flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-gray-200 pb-4">
      <div>
        <h1 class="font-display font-bold text-xl text-noir">Formules & Packs</h1>
        <p class="text-gray-400 text-[11px] mt-0.5">Vue d'ensemble et simulation des dots hebdomadaires et commandes libres</p>
      </div>
      
      <!-- Sélecteur d'onglets -->
      <div class="flex flex-wrap bg-[#f9f9fb] rounded-xl border border-gray-200 self-start xl:self-center">
        <button 
          @click="activePack = 'essentiel'"
          :class="[activePack === 'essentiel' ? 'bg-white text-noir shadow-xs font-bold' : 'text-gray-400 hover:text-gray-600', 'px-3 py-2 rounded-lg transition-all cursor-pointer']"
        >
          Essentiel
        </button>
        <button 
          @click="activePack = 'equilibre'"
          :class="[activePack === 'equilibre' ? 'bg-foret text-white shadow-xs font-bold' : 'text-gray-400 hover:text-gray-600', 'px-3 py-2 rounded-lg transition-all cursor-pointer']"
        >
          Équilibré
        </button>
        <button 
          @click="activePack = 'confort'"
          :class="[activePack === 'confort' ? 'bg-savane text-white shadow-xs font-bold' : 'text-gray-400 hover:text-gray-600', 'px-3 py-2 rounded-lg transition-all cursor-pointer']"
        >
          Confort
        </button>
        <button 
          @click="activePack = 'reserve'"
          :class="[activePack === 'reserve' ? 'bg-indigo-600 text-white shadow-xs font-bold' : 'text-gray-400 hover:text-gray-600', 'px-3 py-2 rounded-lg transition-all cursor-pointer']"
        >
          Réserve
        </button>
        <button 
          @click="activePack = 'fraicheur'"
          :class="[activePack === 'fraicheur' ? 'bg-rose-500 text-white shadow-xs font-bold' : 'text-gray-400 hover:text-gray-600', 'px-3 py-2 rounded-lg transition-all cursor-pointer']"
        >
          Fraîcheur
        </button>
      </div>
    </div>

    <div v-if="isLoading" class="text-sm font-medium text-gray-500 p-12 text-center bg-white rounded-2xl border">
      Génération de la formule {{ activePack }} en cours...
    </div>
    
    <div v-else-if="isError" class="p-4 bg-red-50 text-red-700 text-sm rounded-xl border flex items-center gap-2">
      <ShieldAlert class="w-4 h-4 text-red-500" />
      <span>Erreur lors du chargement de la formule : {{ error?.message }}</span>
    </div>

    <div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      
      <!-- Table de composition -->
      <div class="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-3xs overflow-hidden p-4">
        <h3 class="font-bold text-noir text-sm mb-3 flex items-center gap-2">
          <Layers class="w-4 h-4 text-gray-400" /> Composition de la dotation commerciale
        </h3>
        
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse min-w-137.5">
            <thead>
              <tr class="bg-gray-50/70 border-b border-gray-100 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                <th class="py-3 px-4">Produit</th>
                <th class="py-3 px-4">Catégorie</th>
                <th class="py-3 px-4">Règle (libellé)</th>
                <th class="py-3 px-4 text-right">Quantité Pack</th>
                <th class="py-3 px-4 text-right">Sous-total Prix</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50 text-noir">
              <tr v-for="item in data?.items" :key="item.productId" class="hover:bg-gray-50/30 transition-colors">
                <td class="py-3 px-4 font-bold">
                  <span v-if="item.reference" class="font-mono text-gray-500 mr-1">{{ item.reference }}</span>{{ item.name }}
                  <span v-if="item.indisponible" class="text-[9px] font-semibold text-red-700 px-1.5 bg-red-50 rounded border border-red-100 ml-1">Indisponible</span>
                  <span v-if="item.commentaire" class="block text-[10px] font-normal text-gray-500">{{ item.commentaire }}</span>
                </td>
                <td class="py-3 px-4">
                  <span class="px-2 py-0.5 bg-gray-100 rounded-md text-[10px] text-gray-500">{{ item.category }}</span>
                </td>
                <td class="py-3 px-4 text-gray-500 italic">{{ item.regle || '—' }}</td>
                <td class="py-3 px-4 text-right font-bold text-noir">
                  {{ item.quantity }} {{ item.unit }}
                </td>
                <td class="py-3 px-4 text-right font-mono text-gray-700 font-semibold">
                  <span v-if="item.totalPrice === null" class="text-amber-800">prix à renseigner</span>
                  <span v-else>{{ item.totalPrice.toLocaleString('fr-FR') }} F</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Colonne Synthèse & Prix Général Admin -->
      <div class="space-y-6">
        
        <div :class="[getPackColorClass(activePack), 'p-5 rounded-2xl border shadow-sm space-y-4 transition-all']">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-bold uppercase tracking-widest opacity-80">Synthèse Formule ({{ activePack }})</span>
            <ShoppingBag class="w-4 h-4 opacity-70" />
          </div>
          
          <!-- Prix système généré -->
          <div>
            <span class="text-[10px] block opacity-70">COÛT DES MATIÈRES (PRIX DU CATALOGUE)</span>
            <h2 class="text-2xl font-black tracking-tight font-mono">
              {{ data?.prixCalcule?.toLocaleString('fr-FR') }} <span class="text-sm font-bold">FCFA</span>
            </h2>
            <p v-if="data?.prixManquants" class="text-[10px] font-bold text-amber-800">Coût incomplet : {{ data.prixManquants }} produit(s) sans prix</p>
            <p class="text-[10px] mt-1">Prix de vente : <strong>{{ data?.formule?.prixCommercial ?? data?.formule?.prixActuel ?? 'à définir' }}</strong><span v-if="(data?.formule?.prixCommercial ?? data?.formule?.prixActuel) !== null && (data?.formule?.prixCommercial ?? data?.formule?.prixActuel) !== undefined"> FCFA</span></p>
          </div>

          <!-- NOUVEAU : Champ d'édition du Prix Général par l'Admin -->
          <div class="border-t border-black/10 pt-3 space-y-2">
            <label class="text-[10px] font-bold uppercase block opacity-80">
              Prix Général Fixé (Commercial)
            </label>
            
            <div class="flex items-center gap-2">
              <div class="relative flex-1">
                <input 
                  v-model.number="customPrice"
                  type="number"
                  placeholder="Ex: 22500"
                  class="w-full bg-white border border-gray-300 focus:border-noir text-noir font-mono font-bold text-sm rounded-xl px-3 py-2 pr-12 outline-none transition-all shadow-2xs"
                />
                <span class="absolute right-3 top-2.5 text-[10px] font-bold text-gray-400">FCFA</span>
              </div>
              
              <button 
                @click="handleSavePrice"
                :disabled="updatePriceMutation.isPending.value"
                class="bg-noir hover:bg-gray-800 text-white font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                <Loader2 v-if="updatePriceMutation.isPending.value" class="w-3.5 h-3.5 animate-spin" />
                <Save v-else class="w-3.5 h-3.5" />
                <span>Enregistrer</span>
              </button>
            </div>

            <!-- Messages de retour -->
            <p v-if="saveSuccess" class="text-[10px] font-bold text-emerald-600 flex items-center gap-1 mt-1">
              <CheckCircle class="w-3 h-3" /> Prix enregistré en base avec succès !
            </p>
            <p v-if="updatePriceMutation.isError.value" class="text-[10px] font-bold text-red-600 mt-1">
              Erreur lors de l'enregistrement.
            </p>
          </div>

          <div class="border-t border-black/10 pt-3 space-y-2 text-[11px]">
            <div class="flex justify-between">
              <span>Produits actifs inclus :</span>
              <strong class="font-bold">{{ data?.itemCount }}</strong>
            </div>
            <div class="flex justify-between">
              <span>Période / Logistique :</span>
              <span>{{ getPeriodText }}</span>
            </div>
          </div>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-gray-100 shadow-3xs space-y-2">
          <h4 class="font-bold text-noir text-xs flex items-center gap-1.5">
            <CheckCircle class="w-3.5 h-3.5 text-foret" /> Référentiel packs v4 (30/06/2026)
          </h4>
          <p class="text-gray-500 text-[11px] leading-relaxed">
            Les quantités de chaque produit dans ce pack sont celles du catalogue (écran Produits) ; un produit sans quantité est absent du pack.
          </p>
          <dl v-if="data?.formule" class="text-[11px] space-y-1">
            <div v-if="data.formule.promesse"><dt class="inline font-bold text-noir">Promesse : </dt><dd class="inline">{{ data.formule.promesse }}</dd></div>
            <div v-if="data.formule.foyersCibles"><dt class="inline font-bold text-noir">Foyers cibles : </dt><dd class="inline">{{ data.formule.foyersCibles }}</dd></div>
            <div><dt class="inline font-bold text-noir">Personnalisation : </dt><dd class="inline">{{ data.formule.changementsMax ?? 'à renseigner' }} changement(s), ±{{ data.formule.variationQuantitePct ?? '…' }} % sur les quantités</dd></div>
            <div v-if="data.formule.bientotDisponible"><dd class="inline font-bold text-amber-800">Bientôt disponible : non commandable</dd></div>
          </dl>
        </div>

      </div>

    </div>
  </div>
</template>