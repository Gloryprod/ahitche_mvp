<!-- <script setup lang="ts">
import { ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import api from '@/stores/api'
import { Layers, ShoppingBag, CheckCircle, ShieldAlert } from 'lucide-vue-next'
import type { Formule } from '@/type'
import type { ProductItem } from '@/type'

interface PackDetailsResponse {
  formule: Formule;
  itemCount: number;
  items: ProductItem[];
}

// État pour l'onglet de formule sélectionné
const activePack = ref<'essentiel' | 'equilibre' | 'confort'>('essentiel')

// --- TANSTACK QUERY ---
const fetchPackDetails = async ({ queryKey }: { queryKey: any }) : Promise<PackDetailsResponse> => {
  const [_, packType] = queryKey
  const response = await api.get(`/api/admin/formulas/${packType}`)
  return response.data
}

const { data, isLoading, isError, error } = useQuery({
  queryKey: ['packDetails', activePack],
  queryFn: fetchPackDetails,
})

// Définir les classes de couleurs dynamiques selon le pack pour le design
const getPackColorClass = (pack: string) => {
  if (pack === 'essentiel') return 'border-gray-500 bg-gray-50 text-gray-700'
  if (pack === 'equilibre') return 'border-foret bg-emerald-50 text-foret'
  return 'border-savane bg-amber-50 text-savane'
}
</script>

<template>
  <div class="space-y-6 animate-fadeIn text-xs font-medium text-gray-600">
    
    <div class="bg-white p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
      <div>
        <h1 class="font-display font-bold text-xl text-noir">Formules & Packs</h1>
        <p class="text-gray-400 text-[11px] mt-0.5">Vue d'ensemble et simulation des dots hebdomadaires</p>
      </div>
      
      <div class="flex bg-[#f9f9fb] p-1 rounded-xl border border-gray-200 self-start sm:self-center">
        <button 
          @click="activePack = 'essentiel'"
          :class="[activePack === 'essentiel' ? 'bg-white text-noir shadow-xs font-bold' : 'text-gray-400 hover:text-gray-600', 'px-4 py-2 rounded-lg transition-all cursor-pointer']"
        >
          Essentiel
        </button>
        <button 
          @click="activePack = 'equilibre'"
          :class="[activePack === 'equilibre' ? 'bg-foret text-white shadow-xs font-bold' : 'text-gray-400 hover:text-gray-600', 'px-4 py-2 rounded-lg transition-all cursor-pointer']"
        >
          Équilibré
        </button>
        <button 
          @click="activePack = 'confort'"
          :class="[activePack === 'confort' ? 'bg-savane text-white shadow-xs font-bold' : 'text-gray-400 hover:text-gray-600', 'px-4 py-2 rounded-lg transition-all cursor-pointer']"
        >
          Confort
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
                <th class="py-3 px-4 text-center">Coefficient</th>
                <th class="py-3 px-4 text-right">Quantité Pack</th>
                <th class="py-3 px-4 text-right">Sous-total Prix</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50 text-noir">
              <tr v-for="item in data?.items" :key="item.productId" :class="[item.quantity === 0 ? 'opacity-40 bg-gray-50/50' : '', 'hover:bg-gray-50/30 transition-colors']">
                <td class="py-3 px-4 font-bold">
                  {{ item.name }}
                  <span v-if="item.quantity === 0" class="text-[9px] font-semibold text-red-500 px-1.5 py-0.2 bg-red-50 rounded border border-red-100 ml-1">Absent</span>
                </td>
                <td class="py-3 px-4">
                  <span class="px-2 py-0.5 bg-gray-100 rounded-md text-[10px] text-gray-500">{{ item.category }}</span>
                </td>
                <td class="py-3 px-4 text-center font-mono text-gray-500">
                  ×{{ item.appliedMultiplier }}
                </td>
                <td class="py-3 px-4 text-right font-bold text-noir">
                  {{ item.quantity }} {{ item.unit }}
                </td>
                <td class="py-3 px-4 text-right font-mono text-gray-700 font-semibold">
                  {{ item.totalPrice.toLocaleString() }} F
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="space-y-6">
        
        <div :class="[getPackColorClass(activePack), 'p-5 rounded-2xl border shadow-sm space-y-4 transition-all']">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-bold uppercase tracking-widest opacity-80">Synthèse Formule</span>
            <ShoppingBag class="w-4 h-4 opacity-70" />
          </div>
          
          <div>
            <span class="text-[10px] block opacity-70">VALEUR FINANCIÈRE DU PACK</span>
            <h2 class="text-2xl font-black tracking-tight font-mono">
              {{ data?.formule.prixActuel.toLocaleString() }} <span class="text-sm font-bold">FCFA</span>
            </h2>
          </div>

          <div class="border-t border-black/10 pt-3 space-y-2 text-[11px]">
            <div class="flex justify-between">
              <span>Produits actifs inclus :</span>
              <strong class="font-bold">{{ data?.itemCount }} / 16</strong>
            </div>
            <div class="flex justify-between">
              <span>Période couverte :</span>
              <span>1 Personne / 1 Semaine</span>
            </div>
          </div>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-gray-100 shadow-3xs space-y-2">
          <h4 class="font-bold text-noir text-xs flex items-center gap-1.5">
            <CheckCircle class="w-3.5 h-3.5 text-foret" /> Note de conformité technique (V2)
          </h4>
          <p class="text-gray-400 text-[11px] leading-relaxed">
            Ce pack applique automatiquement les règles de l'écosystème Ahitché du référentiel officiel du <span class="font-semibold text-gray-500">28/05/2026</span>. Les plafonnements sur les féculents (Coquillettes limitées à 12 kg au lieu de 15 kg au niveau Confort) sont audités et calculés dynamiquement par le moteur d'API.
          </p>
        </div>

      </div>

    </div>
  </div>
</template> -->

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import api from '@/stores/api'
import { Layers, ShoppingBag, CheckCircle, ShieldAlert } from 'lucide-vue-next'
import type { Formule } from '@/type'
import type { ProductItem } from '@/type'

interface PackDetailsResponse {
  formule: Formule;
  itemCount: number;
  items: ProductItem[];
}

// 1. Extension de l'état pour inclure 'reserve' et 'fraicheur'
const activePack = ref<'essentiel' | 'equilibre' | 'confort' | 'reserve' | 'fraicheur'>('essentiel')

// --- TANSTACK QUERY ---
const fetchPackDetails = async ({ queryKey }: { queryKey: any }) : Promise<PackDetailsResponse> => {
  const [_, packType] = queryKey
  const response = await api.get(`/api/admin/formulas/${packType}`)
  return response.data
}

const { data, isLoading, isError, error } = useQuery({
  queryKey: ['packDetails', activePack],
  queryFn: fetchPackDetails,
})

// 2. Classes de couleurs dynamiques étendues pour les badges et synthèses
const getPackColorClass = (pack: string) => {
  if (pack === 'essentiel') return 'border-gray-500 bg-gray-50 text-gray-700'
  if (pack === 'equilibre') return 'border-foret bg-emerald-50 text-foret'
  if (pack === 'confort') return 'border-savane bg-amber-50 text-savane'
  if (pack === 'reserve') return 'border-indigo-600 bg-indigo-50 text-indigo-700'
  return 'border-rose-500 bg-rose-50 text-rose-700'
}

// 3. Texte dynamique pour la période couverte
const getPeriodText = computed(() => {
  if (activePack.value === 'reserve') return 'Commande Volumétrique (Mensuelle / Bi-mensuelle)'
  if (activePack.value === 'fraicheur') return 'Base de départ minimale (Modulable par le client)'
  return '1 Personne / 1 Semaine'
})
</script>

<template>
  <div class="space-y-6 animate-fadeIn text-xs font-medium text-gray-600">
    
    <div class="bg-white p-4 rounded-2xl flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-gray-200 pb-4">
      <div>
        <h1 class="font-display font-bold text-xl text-noir">Formules & Packs</h1>
        <p class="text-gray-400 text-[11px] mt-0.5">Vue d'ensemble et simulation des dots hebdomadaires et commandes libres</p>
      </div>
      
      <!-- Sélecteur d'onglets mis à jour avec les 5 choix -->
      <div class="flex flex-wrap bg-[#f9f9fb] p-1 rounded-xl border border-gray-200 self-start xl:self-center gap-1">
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
                <th class="py-3 px-4 text-center">Coefficient (virtuel)</th>
                <th class="py-3 px-4 text-right">Quantité Pack</th>
                <th class="py-3 px-4 text-right">Sous-total Prix</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50 text-noir">
              <tr v-for="item in data?.items" :key="item.productId" :class="[item.quantity === 0 ? 'opacity-40 bg-gray-50/50' : '', 'hover:bg-gray-50/30 transition-colors']">
                <td class="py-3 px-4 font-bold">
                  {{ item.name }}
                  <span v-if="item.quantity === 0" class="text-[9px] font-semibold text-red-500 px-1.5 py-0.2 bg-red-50 rounded border border-red-100 ml-1">Absent</span>
                </td>
                <td class="py-3 px-4">
                  <span class="px-2 py-0.5 bg-gray-100 rounded-md text-[10px] text-gray-500">{{ item.category }}</span>
                </td>
                <td class="py-3 px-4 text-center font-mono text-gray-500">
                  <span v-if="['reserve', 'fraicheur'].includes(activePack)">—</span>
                  <span v-else>×{{ item.appliedMultiplier }}</span>
                </td>
                <td class="py-3 px-4 text-right font-bold text-noir">
                  {{ item.quantity }} {{ item.unit }}
                </td>
                <td class="py-3 px-4 text-right font-mono text-gray-700 font-semibold">
                  {{ item.totalPrice.toLocaleString() }} F
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="space-y-6">
        
        <div :class="[getPackColorClass(activePack), 'p-5 rounded-2xl border shadow-sm space-y-4 transition-all']">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-bold uppercase tracking-widest opacity-80">Synthèse Formule ({{ activePack }})</span>
            <ShoppingBag class="w-4 h-4 opacity-70" />
          </div>
          
          <div>
            <span class="text-[10px] block opacity-70">VALEUR FINANCIÈRE DU PACK</span>
            <h2 class="text-2xl font-black tracking-tight font-mono">
              <span v-if="activePack === 'fraicheur' && data?.formule.prixActuel === 0" class="text-lg">À définir après pilote</span>
              <span v-else>{{ data?.formule.prixActuel.toLocaleString() }} <span class="text-sm font-bold">FCFA</span></span>
            </h2>
          </div>

          <div class="border-t border-black/10 pt-3 space-y-2 text-[11px]">
            <div class="flex justify-between">
              <span>Produits actifs inclus :</span>
              <strong class="font-bold">{{ data?.itemCount }} / {{ activePack === 'reserve' || activePack === 'fraicheur' ? '11' : '16' }}</strong>
            </div>
            <div class="flex justify-between">
              <span>Période / Logistique :</span>
              <span>{{ getPeriodText }}</span>
            </div>
          </div>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-gray-100 shadow-3xs space-y-2">
          <h4 class="font-bold text-noir text-xs flex items-center gap-1.5">
            <CheckCircle class="w-3.5 h-3.5 text-foret" /> Note de conformité technique (V4)
          </h4>
          <p class="text-gray-400 text-[11px] leading-relaxed">
            <span v-if="activePack === 'reserve'">
              Ce pack applique la règle de stockage de volume à cycle libre. L'oignon y est comptabilisé au panier (3 000 FCFA brute) au lieu de lots hebdomadaires.
            </span>
            <span v-else-if="activePack === 'fraicheur'">
              Ce pack affiche la configuration minimale d'aromates et produits frais[cite: 2]. Les quantités définitives de vente seront validées au cours du pilote à Calavi Kpota[cite: 2].
            </span>
            <span v-else>
              Ce pack applique automatiquement les règles de l'écosystème Ahitché du référentiel officiel du <span class="font-semibold text-gray-500">30/06/2026</span>[cite: 2]. Les plafonnements sur les féculents sont audités et calculés dynamiquement[cite: 2].
            </span>
          </p>
        </div>

      </div>

    </div>
  </div>
</template>