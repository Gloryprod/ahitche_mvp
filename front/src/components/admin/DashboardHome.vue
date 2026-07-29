<script setup lang="ts">
import { computed } from 'vue'
import { useQuery, keepPreviousData, useQueries } from '@tanstack/vue-query'
import api from '@/stores/api'
import type { Commande } from '@/type'
import { 
  AlertTriangle, 
  Bell, 
  MessageSquare,
  RefreshCw,
  Clock
} from 'lucide-vue-next'

// --- INTERFACES ---
interface PaginatedCommandesResponse {
  orders: Commande[]
  hasMore: boolean
  total?: number
}

interface InventoryItem {
  productId: string
  nom: string
  unite: string
  stockTotal: number
  nbLotsActifs: number
  seuilAlerte: number
  enAlerte: boolean
}

// --- 1. CHARGEMENT DES COMMANDES ---
const fetchDashboardOrders = async (): Promise<PaginatedCommandesResponse> => {
  try {
    const response = await api.get('/api/admin/commandes', {
      params: { limit: 100 }
    })
    return response.data
  } catch (err) {
    console.error('Erreur API Dashboard Orders:', err)
    return { orders: [], hasMore: false, total: 0 }
  }
}

const { data: ordersData, isLoading: isLoadingOrders, isError: isErrorOrders, refetch: refetchOrders } = useQuery<PaginatedCommandesResponse>({
  queryKey: ['dashboard-orders'],
  queryFn: fetchDashboardOrders,
  placeholderData: keepPreviousData,
  retry: 1
})

const ordersList = computed<Commande[]>(() => ordersData.value?.orders || [])

// --- 2. CHARGEMENT DE L'INVENTAIRE (STOCK) ---
const fetchGlobalInventory = async (): Promise<InventoryItem[]> => {
  try {
    const response = await api.get('/api/admin/inventory/global')
    return response.data || []
  } catch (err) {
    console.error('Erreur API Inventory:', err)
    return []
  }
}

const { data: inventaireData, isLoading: isLoadingStock, refetch: refetchStock } = useQuery<InventoryItem[]>({
  queryKey: ['globalInventory'],
  queryFn: fetchGlobalInventory,
  placeholderData: keepPreviousData,
  retry: 1
})

// --- 3. GESTION DES ALERTES STOCK ---
// Normalize the query data (Ref<InventoryItem[] | undefined>) to a plain arr:ay for safe array ops
const inventaireRaw = computed((): InventoryItem[] => {
  return inventaireData?.value || []
})

const stockAlerts = computed(() => inventaireRaw.value.filter(item => item.enAlerte))

// --- 4. GESTION DES RENOUVELLEMENTS (Livrés + 30j -> Alerte si <= 5j) ---
const upcomingRenewals = computed(() => {
  const now = new Date()
  
  return ordersList.value
    .filter(order => order.statut === 'Livré' && order.dateLivraison)
    .map(order => {
      const deliveryDate = new Date(order.dateLivraison)
      // Échéance de l'abonnement à +30 jours
      const expiryDate = new Date(deliveryDate)
      expiryDate.setDate(expiryDate.getDate() + 30)

      // Calcul de la différence en jours
      const diffTime = expiryDate.getTime() - now.getTime()
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

      return {
        ...order,
        expiryDate,
        daysRemaining
      }
    })
    // On ne garde que les abonnements qui arrivent à échéance dans 5 jours ou moins (y compris ceux dépassés <= 0)
    .filter(item => item.daysRemaining <= 5)
    // Tri par priorité (ceux qui expirent le plus tôt en premier)
    .sort((a, b) => a.daysRemaining - b.daysRemaining)
})

// --- 5. CALCULS KPIS GÉNÉRAUX ---
const activeClientsCount = computed(() => {
  const validOrders = ordersList.value.filter(o => o && o.deletedAt == null)
  const uniqueClients = new Set(validOrders.map(o => o.clientName?.trim().toLowerCase()).filter(Boolean))
  return uniqueClients.size
})

const targetClients = 20

const estimatedRevenue = computed(() => {
  return ordersList.value
    .filter(o => o && o.deletedAt == null)
    .reduce((sum, o) => sum + (Number(o.total) || 0), 0)
})

const pendingOrdersCount = computed(() => {
  return ordersList.value.filter(o => o && o.statut === 'En attente').length
})

const formulaDistribution = computed(() => {
  const formulasConfig = [
    { name: 'AHI ESSENTIEL', key: 'ESSENTIEL', color: 'bg-foret' },
    { name: 'AHI ÉQUILIBRÉ', key: 'EQUILIBRE', color: 'bg-amber-600' },
    { name: 'AHI CONFORT', key: 'CONFORT', color: 'bg-blue-600' },
    { name: 'AHI RÉSERVE', key: 'RESERVE', color: 'bg-purple-600' },
    { name: 'AHI FRAÎCHEUR', key: 'FRAICHEUR', color: 'bg-emerald-500' }
  ]

  // Fonction utilitaire pour nettoyer les chaînes (retire accents, espaces et met en majuscules)
  const sanitize = (str: string) => 
    str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim() : ""

  // 1. Récupération de toutes les commandes valides
  const validOrders = ordersList.value.filter(o => o && o.deletedAt == null)
  const totalOrders = validOrders.length || 1

  return formulasConfig.map(f => {
    const sanitizedKey = sanitize(f.key)

    // 2. Comptage direct sur TOUTES les commandes (matche "pack confort", "AHI CONFORT", "CONFORT", etc.)
    const count = validOrders.filter(o => {
      if (!o.formule) return false
      return sanitize(o.formule).includes(sanitizedKey)
    }).length

    const percentage = Math.round((count / totalOrders) * 100)

    return {
      ...f,
      count,
      percentage,
      width: `${percentage}%`
    }
  })
})

const recentOrders = computed(() => {
  return ordersList.value.slice(0, 5)
})

// Configuration des 5 formules
const PACKS_CONFIG = [
  { key: 'essentiel', label: 'ESSENTIEL', defaultLaunchPrice: 10800 },
  { key: 'equilibre', label: 'ÉQUILIBRÉ', defaultLaunchPrice: 21600 },
  { key: 'confort', label: 'CONFORT', defaultLaunchPrice: 35000 },
  { key: 'reserve', label: 'RÉSERVE', defaultLaunchPrice: 0 },
  { key: 'fraicheur', label: 'FRAÎCHEUR', defaultLaunchPrice: 0 }
]

// Exécution parallèle des requêtes pour chaque formule
const formulaQueries = useQueries({
  queries: PACKS_CONFIG.map(pack => ({
    queryKey: ['packDetails', pack.key],
    queryFn: async () => {
      const response = await api.get(`/api/admin/formulas/${pack.key}`)
      return response.data
    },
    staleTime: 1000 * 60 * 5 // Cache 5 minutes
  }))
})

// Indique si au moins une formule est en cours de chargement
const isLoadingFormulas = computed(() => formulaQueries.value.some(q => q.isLoading))

// Calcul dynamique des marges pour chaque pack
const grossMargins = computed(() => {
  return PACKS_CONFIG.map((pack, index) => {
    const query = formulaQueries.value[index]
    const data = query?.data

    // Prix de vente (ou depuis l'API si disponible)
    const launchPrice = data?.formule?.prixActuel ?? pack.defaultLaunchPrice

    // Calcul du coût réel de la dotation (somme des sous-totaux des produits)
    const realCost = data?.items
      ? data.items.reduce((sum: number, item: any) => sum + (Number(item.totalPrice) || 0), 0)
      : 0

    // Marge brute = Prix de vente - Coût réel
    const margin = launchPrice - realCost

    return {
      formula: pack.label,
      key: pack.key,
      launchPrice,
      realCost,
      margin,
      hasData: !!data
    }
  })
})

// Refresh global
const refreshAll = () => {
  refetchOrders()
  refetchStock()
}

const openWhatsApp = (phone: string, clientName: string, formula: string, daysRemaining: number) => {
  if (!phone) return
  const cleanPhone = phone.replace(/\s+/g, '')
  
  let msgText = `Bonjour ${clientName}, votre abonnement Ahitché (${formula}) arrive à son terme dans ${daysRemaining} jour(s).`
  if (daysRemaining <= 0) {
    msgText = `Bonjour ${clientName}, votre abonnement Ahitché (${formula}) a pris fin.`
  }
  
  const msg = encodeURIComponent(`${msgText} Souhaitez-vous le renouveler pour la prochaine tournée de livraison ?`)
  window.open(`https://wa.me/${cleanPhone}?text=${msg}`, '_blank')
}

const getStatutClass = (statut: Commande['statut']) => {
  switch (statut) {
    case 'En attente': return 'bg-amber-100 text-amber-800'
    case 'Livré': return 'bg-green-100 text-green-700'
    default: return 'bg-gray-100 text-gray-700'
  }
}
</script>

<template>
  <div class="space-y-5 text-xs font-body text-noir animate-fadeIn">
    
    <!-- EN-TÊTE -->
    <div class="bg-white p-4 rounded-2xl flex items-center justify-between border-b border-gray-200 shadow-2xs">
      <div>
        <h1 class="font-display font-bold text-xl text-noir">Tableau de bord</h1>
        <p class="text-[11px] text-gray-400 font-medium">Aperçu opérationnel & logistique d'Ahitché</p>
      </div>

      <div class="flex items-center gap-3">
        <button @click="refreshAll" title="Actualiser" class="p-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-all cursor-pointer">
          <RefreshCw :class="['w-4 h-4 text-gray-600', isLoadingOrders || isLoadingStock ? 'animate-spin' : '']" />
        </button>

        <div class="bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200 text-gray-500 font-mono text-[11px]">
          1 USD = <span class="font-bold text-noir">571 FCFA</span>
        </div>
      </div>
    </div>

    <!-- CHARGEMENT INITIAL -->
    <div v-if="isLoadingOrders && isLoadingStock" class="text-center py-12 bg-white rounded-2xl border border-gray-100">
      <span class="animate-pulse text-gray-500 font-medium">Synchronisation des données en cours...</span>
    </div>

    <template v-else>
      <!-- 1. CARTES KPIS -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div class="bg-white p-4 rounded-2xl border border-gray-100 shadow-3xs space-y-2">
          <span class="text-[10px] font-bold uppercase tracking-wider text-gray-400">CLIENTS ACTIFS</span>
          <div class="flex items-baseline justify-between">
            <span class="text-2xl font-display font-bold text-noir">{{ activeClientsCount }}</span>
            <span class="text-[11px] text-gray-500">↑ obj. {{ targetClients }} pilote</span>
          </div>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-gray-100 shadow-3xs space-y-2">
          <span class="text-[10px] font-bold uppercase tracking-wider text-gray-400">CA ESTIMÉ / CYCLE</span>
          <div class="flex items-baseline justify-between">
            <span class="text-2xl font-display font-bold text-noir">{{ estimatedRevenue.toLocaleString('fr-FR') }}</span>
            <span class="text-[11px] text-gray-500">FCFA · {{ activeClientsCount }} clients</span>
          </div>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-gray-100 shadow-3xs space-y-2">
          <span class="text-[10px] font-bold uppercase tracking-wider text-gray-400">COMMANDES EN ATTENTE</span>
          <div class="flex items-baseline justify-between">
            <span class="text-2xl font-display font-bold text-noir">{{ pendingOrdersCount }}</span>
            <span class="text-[11px] text-amber-600 font-semibold">→ À préparer</span>
          </div>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-gray-100 shadow-3xs space-y-2">
          <span class="text-[10px] font-bold uppercase tracking-wider text-gray-400">RENOUVELLEMENTS (J-5)</span>
          <div class="flex items-baseline justify-between">
            <span class="text-2xl font-display font-bold text-noir">{{ upcomingRenewals.length }}</span>
            <span class="text-[11px] text-red-500 font-semibold">Client(s) concerné(s)</span>
          </div>
        </div>

      </div>

      <!-- 2. BANNIÈRES D'ALERTES -->
      <div class="space-y-2">
        
        <!-- Alerte Stock Bas -->
        <div v-if="stockAlerts.length > 0" class="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 flex items-center justify-between gap-2.5">
          <div class="flex items-center gap-2.5">
            <AlertTriangle class="w-4 h-4 text-red-600 shrink-0" />
            <p class="leading-tight">
              <strong>Attention : {{ stockAlerts.length }} produit(s) en rupture proche</strong> — 
              <span v-for="(item, idx) in stockAlerts.slice(0, 3)" :key="item.productId">
                {{ item.nom }} ({{ item.stockTotal }}{{ item.unite }})<span v-if="idx < Math.min(stockAlerts.length, 3) - 1">, </span>
              </span>
              <span v-if="stockAlerts.length > 3"> et {{ stockAlerts.length - 3 }} autre(s)</span>.
            </p>
          </div>
          <router-link to="/dashboard/admin/inventory" class="text-[11px] font-bold text-red-700 underline shrink-0">Voir stock →</router-link>
        </div>

        <!-- Alerte Renouvellements imminents (J-5) -->
        <div v-if="upcomingRenewals.length > 0 && upcomingRenewals[0]" class="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 flex items-center justify-between gap-2.5">
          <div class="flex items-center gap-2.5">
            <Bell class="w-4 h-4 text-amber-600 shrink-0" />
            <p class="leading-tight">
              <strong>{{ upcomingRenewals.length }} renouvellement(s) sous 5 jours</strong> — 
              <span>Prochain : {{ upcomingRenewals[0]?.clientName }} ({{ upcomingRenewals[0]?.formule }}) 
                <span class="font-bold">
                  {{ upcomingRenewals[0]?.daysRemaining <= 0 ? 'Expiré aujourd\'hui' : 'dans ' + upcomingRenewals[0]?.daysRemaining + ' jour(s)' }}
                </span>
              </span>.
            </p>
          </div>
          <span class="text-[11px] font-semibold text-amber-950 shrink-0">Relance recommandée</span>
        </div>

      </div>

      <!-- 3. CONTENU PRINCIPAL -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        <!-- COLONNE GAUCHE (2/3) -->
        <div class="lg:col-span-2 space-y-5">
            
            <!-- RÉPARTITION CLIENTS -->
            <div class="bg-white p-4 rounded-2xl border border-gray-100 shadow-3xs space-y-4">
                <div class="flex items-center justify-between border-b border-gray-100 pb-2">
                <h2 class="font-bold text-noir text-sm">Répartition clients</h2>
                <span class="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-md text-[10px]">par formule</span>
                </div>

                <div class="space-y-3">
                <div v-for="form in formulaDistribution" :key="form.name" class="flex items-center gap-3">
                    <span class="w-20 font-bold text-[10px] uppercase text-gray-600 tracking-wider">{{ form.name }}</span>
                    <div class="flex-1 bg-gray-100 h-3 rounded-full overflow-hidden">
                    <div :class="[form.color, 'h-full transition-all duration-500 rounded-full']" :style="{ width: form.width }"></div>
                    </div>
                    <span class="w-16 text-right font-semibold text-gray-500">{{ form.count }} client(s)</span>
                </div>
                </div>
            </div>

            <!-- MARGE BRUTE -->
            <div class="bg-white p-4 rounded-2xl border border-gray-100 shadow-3xs space-y-3">
            <div class="flex items-center justify-between border-b border-gray-100 pb-2">
                <div>
                <h2 class="font-bold text-noir text-sm">Marge brute</h2>
                <p class="text-[10px] text-gray-400">Calculée dynamiquement selon les compositions des packs</p>
                </div>
                <span class="px-2.5 py-0.5 bg-amber-100 text-amber-800 font-bold rounded-full text-[10px]">
                Phase 1 lancement
                </span>
            </div>

            <!-- Indication pendant le chargement -->
            <div v-if="isLoadingFormulas" class="text-center py-6 text-gray-400 animate-pulse">
                Calcul des coûts et marges par formule...
            </div>

            <div v-else class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                <thead>
                    <tr class="border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    <th class="py-2 px-3">Formule</th>
                    <th class="py-2 px-3 text-right">Prix Vente</th>
                    <th class="py-2 px-3 text-right">Coût Réel (Dotation)</th>
                    <th class="py-2 px-3 text-right">Marge Brute</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-50 font-mono">
                    <tr v-for="item in grossMargins" :key="item.key" class="hover:bg-gray-50/50 transition-colors">
                    <td class="py-2.5 px-3 font-body font-bold text-foret">{{ item.formula }}</td>
                    
                    <!-- Prix Lancement / Vente -->
                    <td class="py-2.5 px-3 text-right font-semibold">
                        <span v-if="item.launchPrice === 0" class="text-gray-400 font-body text-[10px]">Variable / Pilote</span>
                        <span v-else>{{ item.launchPrice.toLocaleString('fr-FR') }} F</span>
                    </td>

                    <!-- Coût Réel des produits du pack -->
                    <td class="py-2.5 px-3 text-right text-gray-500">
                        {{ item.realCost.toLocaleString('fr-FR') }} F
                    </td>

                    <!-- Marge Brute Calculated -->
                    <td class="py-2.5 px-3 text-right">
                        <span v-if="item.launchPrice === 0" class="text-gray-400 font-body text-[10px]">
                        N/A
                        </span>
                        <span 
                        v-else 
                        :class="[
                            item.margin < 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700', 
                            'px-2 py-0.5 rounded font-bold text-[11px] inline-block'
                        ]"
                        >
                        {{ item.margin > 0 ? '+' : '' }}{{ item.margin.toLocaleString('fr-FR') }} F
                        </span>
                    </td>
                    </tr>
                </tbody>
                </table>
            </div>
            </div>

        </div>

        <!-- COLONNE DROITE (1/3) -->
        <div class="space-y-5">
          
          <!-- LISTE DES RENOUVELLEMENTS À VENIR (<= 5 JOURS) -->
          <div class="bg-white p-4 rounded-2xl border border-gray-100 shadow-3xs space-y-3">
            <div class="flex items-center justify-between border-b border-gray-100 pb-2">
              <h2 class="font-bold text-noir text-sm flex items-center gap-1.5">
                <Clock class="w-4 h-4 text-amber-600" />
                Renouvellements J-5
              </h2>
              <span class="px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-bold text-[10px]">
                {{ upcomingRenewals.length }}
              </span>
            </div>

            <div v-if="upcomingRenewals.length === 0" class="text-center py-6 text-gray-400">
              <p>Aucun renouvellement requis dans les 5 prochains jours.</p>
            </div>

            <div v-else class="space-y-2.5">
              <div 
                v-for="item in upcomingRenewals" 
                :key="item.id" 
                class="p-3 bg-gray-50 hover:bg-gray-100/80 rounded-xl flex items-center justify-between border border-gray-100 transition-all gap-2"
              >
                <div class="overflow-hidden">
                  <span class="font-bold text-noir block truncate">{{ item.clientName }}</span>
                  <div class="flex items-center gap-1.5 mt-0.5">
                    <span class="px-1.5 py-0.2 bg-white border border-gray-200 rounded text-[9px] font-bold text-gray-600 uppercase">
                      {{ item.formule }}
                    </span>
                    <span 
                      :class="[
                        item.daysRemaining <= 0 ? 'text-red-600 font-bold' : 'text-amber-600 font-semibold',
                        'text-[10px]'
                      ]"
                    >
                      {{ item.daysRemaining <= 0 ? 'Expiré' : 'J-' + item.daysRemaining }}
                    </span>
                  </div>
                </div>
                
                <button 
                  @click="openWhatsApp(item.whatsapp, item.clientName, item.formule, item.daysRemaining)" 
                  class="shrink-0 cursor-pointer px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] rounded-lg flex items-center gap-1 transition-all shadow-xs"
                  title="Relancer sur WhatsApp"
                >
                  <MessageSquare class="w-3 h-3" /> Relancer
                </button>
              </div>
            </div>
          </div>

          <!-- DERNIÈRES COMMANDES -->
          <div class="bg-white p-4 rounded-2xl border border-gray-100 shadow-3xs space-y-3">
            <div class="flex items-center justify-between border-b border-gray-100 pb-2">
              <h2 class="font-bold text-noir text-sm">Dernières commandes</h2>
              <router-link to="/commandes" class="text-[10px] text-foret font-bold hover:underline">Voir tout →</router-link>
            </div>

            <table class="w-full text-left">
              <thead>
                <tr class="text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-50">
                  <th class="pb-2">Client</th>
                  <th class="pb-2 text-center">Formule</th>
                  <th class="pb-2 text-right">Statut</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50">
                <tr v-for="cmd in recentOrders" :key="cmd.id" class="hover:bg-gray-50/50">
                  <td class="py-2.5">
                    <span class="font-bold text-noir block leading-tight">{{ cmd.clientName }}</span>
                  </td>
                  <td class="py-2.5 text-center">
                    <span class="px-2 py-0.5 bg-gray-100 rounded text-[10px] font-bold text-gray-600 uppercase">
                      {{ cmd.formule }}
                    </span>
                  </td>
                  <td class="py-2.5 text-right">
                    <span :class="[getStatutClass(cmd.statut), 'px-2 py-0.5 rounded text-[10px] font-bold']">
                      {{ cmd.statut }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

        </div>

      </div>
    </template>

  </div>
</template>

<style scoped>
.animate-fadeIn {
  animation: fadeIn 0.2s ease-in-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(3px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>