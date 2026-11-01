<script setup lang="ts">
import { computed } from 'vue'
import { useQuery, keepPreviousData, useQueries } from '@tanstack/vue-query'
import axios from 'axios'
import api from '@/stores/api'
import { classeStatut } from '@/config/commandes'
import { useAuthStore } from '@/stores/auth'
import { peutLire, peutEcrire } from '@/config/roles'
import { FORMULES } from '@/config/formules'
import { estAchatLibre } from '@/config/vip'
import { useTauxChange } from '@/composables/useTauxChange'
import { useToast } from 'vue-toastification'
import type { Commande, ProductItem } from '@/type'
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

// Inventaire complet (même les produits à 0) : un produit à 0 qui a un seuil compte parmi les alertes
interface InventoryItem {
  productId: string
  nom: string
  unite: string
  stockTotal: number
  nbLotsActifs: number
  seuilAlerte: number | null // Vide : pas d'alerte
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

const { data: ordersData, isLoading: isLoadingOrders, refetch: refetchOrders } = useQuery<PaginatedCommandesResponse>({
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

// Taux USD/FCFA en vigueur (section Finances), affiché seulement aux rôles qui y ont accès
const authStore = useAuthStore()
const toast = useToast()
const { data: tauxData } = useQuery({
  queryKey: ['finances', 'taux'],
  queryFn: async () => (await api.get('/api/admin/finances/taux')).data as { courant: number; convention: number },
  enabled: computed(() => peutLire(authStore.role.value, 'finances')),
})
const tauxUsd = computed(() => tauxData.value?.courant)
const tauxConvention = computed(() => tauxData.value?.convention)

// Admin et comptable : le taux se modifie d'un clic (nouveau taux ou retour au taux de la convention)
const tauxModifiable = computed(() => peutEcrire(authStore.role.value, 'finances'))
const { modifierTaux } = useTauxChange()
const changerTaux = async () => {
  if (!tauxData.value) return
  try {
    const message = await modifierTaux(tauxData.value.courant, tauxData.value.convention)
    if (message) toast.success(message)
  } catch (err) {
    const message = axios.isAxiosError<{ message?: string }>(err) ? err.response?.data?.message : undefined
    toast.error(message || 'Modification du taux impossible')
  }
}

// --- 4. GESTION DES RENOUVELLEMENTS ---
// Relance si le client ne se manifeste pas : à la fin du cycle enregistré sur la formule (réglable dans l'écran
// Formules) ; alerte à J-5. Sans valeur chargée : 30 jours (packs mensuels), 7 pour Fraîcheur.
const CYCLES_PAR_DEFAUT: Record<string, number> = { 'ahi-fraicheur': 7 }
const cycleJours = (formuleSlug: string): number => {
  const index = PACKS_CONFIG.findIndex(pack => `ahi-${pack.key}` === formuleSlug)
  return formulaQueries.value[index]?.data?.formule?.cycleJours ?? CYCLES_PAR_DEFAUT[formuleSlug] ?? 30
}

// Achats libres VIP : ni formule ni cycle (formuleSlug « achat-libre »), donc hors relances et hors répartition par formule
const commandesDePacks = computed(() => ordersList.value.filter(o => o && o.deletedAt == null && !estAchatLibre(o)))

const upcomingRenewals = computed(() => {
  const now = new Date()
  const commandesActives = commandesDePacks.value

  // Dernière commande de chaque client (la liste arrive de la plus récente à la plus ancienne) :
  // une relance n'a de sens que s'il n'a rien commandé depuis
  const derniereParClient = new Map<string, Commande>()
  for (const order of commandesActives) {
    const cle = order.userId ?? order.clientName
    if (!derniereParClient.has(cle)) derniereParClient.set(cle, order)
  }

  return [...derniereParClient.values()]
    .filter(order => order.statut === 'Livrée' && order.dateLivraison)
    .map(order => {
      const deliveryDate = new Date(order.dateLivraison)
      // Échéance du cycle de la formule
      const expiryDate = new Date(deliveryDate)
      expiryDate.setDate(expiryDate.getDate() + cycleJours(order.formuleSlug))

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

// Objectif de clients : paramètre enregistré (Simulateurs > Paramètres) ; rien d'affiché tant qu'il n'est pas renseigné
const { data: parametres } = useQuery({
  queryKey: ['parametres'],
  queryFn: async (): Promise<{ objectifClients: number | null }> => (await api.get('/api/admin/parametres')).data,
  enabled: computed(() => peutLire(authStore.role.value, 'parametres')),
})
// Chiffre d'affaires et marges : pas pour les gestionnaires (D-17), mêmes droits que les simulateurs
const voirMarges = computed(() => peutLire(authStore.role.value, 'simulateurs'))

// Fréquentation du site (mesure d'audience sans cookie) : 30 derniers jours
interface Frequentation {
  visites: number
  clicsWhatsApp: number
  tauxClic: number | null
  origines: { detail: string; nombre: number }[]
  pages: { detail: string; nombre: number }[]
}
const { data: frequentation } = useQuery({
  queryKey: ['frequentation', 30],
  queryFn: async () => (await api.get('/api/admin/mesures', { params: { jours: 30 } })).data as Frequentation,
  enabled: computed(() => peutLire(authStore.role.value, 'mesures')),
})
// « accueil:formule-ahi-equilibre » -> « Accueil · carte AHI ÉQUILIBRÉ » ; « accueil:hero » -> « Accueil · hero »
const libelleOrigine = (detail: string) => {
  const [page, origine = ''] = detail.split(':')
  const formule = FORMULES.find(f => origine === `formule-${f.slug}`)
  return `${page === 'accueil' ? 'Accueil' : page} · ${formule ? `carte ${formule.nom}` : origine.replace(/-/g, ' ')}`
}
const targetClients = computed(() => parametres.value?.objectifClients ?? null)

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

  // 1. Récupération de toutes les commandes valides de packs (les achats libres n'ont pas de formule)
  const validOrders = commandesDePacks.value
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
  { key: 'essentiel', label: 'ESSENTIEL' },
  { key: 'equilibre', label: 'ÉQUILIBRÉ' },
  { key: 'confort', label: 'CONFORT' },
  { key: 'reserve', label: 'RÉSERVE' },
  { key: 'fraicheur', label: 'FRAÎCHEUR' }
]

// Exécution parallèle des requêtes pour chaque formule
const formulaQueries = useQueries({
  queries: PACKS_CONFIG.map(pack => ({
    queryKey: ['packDetails', pack.key],
    queryFn: async () => {
      const response = await api.get(`/api/admin/formulas/${pack.key}`)
      return response.data
    },
    staleTime: 1000 * 60 * 5, // Cache 5 minutes
    enabled: voirMarges
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
    const launchPrice: number | null = data?.formule?.prixCommercial ?? data?.formule?.prixActuel ?? null // Vide : prix à définir

    // Calcul du coût réel de la dotation (somme des sous-totaux des produits)
    const realCost = data?.items
      ? data.items.reduce((sum: number, item: ProductItem) => sum + (Number(item.totalPrice) || 0), 0)
      : 0

    // Marge brute = Prix de vente - Coût réel
    const margin = launchPrice === null ? null : launchPrice - realCost

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

</script>

<template>
  <div class="space-y-5 text-xs font-body text-noir animate-fadeIn">
    
    <!-- EN-TÊTE -->
    <div class="bg-white p-4 rounded-2xl flex items-center justify-between border-b border-gray-200 shadow-2xs">
      <div>
        <h1 class="font-display font-bold text-xl text-noir">Tableau de bord</h1>
        <p class="text-[11px] text-gris font-medium">Aperçu opérationnel & logistique d'Ahitché</p>
      </div>

      <div class="flex items-center gap-3">
        <button @click="refreshAll" title="Actualiser" class="p-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-all cursor-pointer">
          <RefreshCw :class="['w-4 h-4 text-gris', isLoadingOrders || isLoadingStock ? 'animate-spin' : '']" />
        </button>

        <component
          :is="tauxModifiable ? 'button' : 'div'"
          v-if="tauxUsd"
          :type="tauxModifiable ? 'button' : undefined"
          @click="tauxModifiable && changerTaux()"
          :title="tauxModifiable ? 'Modifier le taux USD/FCFA' : undefined"
          :class="['bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200 text-gris font-mono text-[11px]', tauxModifiable ? 'cursor-pointer hover:border-foret' : '']"
        >
          1 USD = <span class="font-bold text-noir">{{ tauxUsd }} FCFA</span>
          <span v-if="tauxUsd === tauxConvention" class="font-body text-savane"> · convention</span>
        </component>
      </div>
    </div>

    <!-- CHARGEMENT INITIAL -->
    <div v-if="isLoadingOrders && isLoadingStock" class="text-center py-12 bg-white rounded-2xl border border-gray-100">
      <span class="animate-pulse text-gris font-medium">Synchronisation des données en cours...</span>
    </div>

    <template v-else>
      <!-- 1. CARTES KPIS -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div class="bg-white p-4 rounded-2xl border border-gray-100 shadow-3xs space-y-2">
          <span class="text-[10px] font-bold uppercase tracking-wider text-gris">CLIENTS ACTIFS</span>
          <div class="flex items-baseline justify-between">
            <span class="text-2xl font-display font-bold text-noir">{{ activeClientsCount }}</span>
            <span v-if="targetClients !== null" class="text-[11px] text-gris">↑ obj. {{ targetClients }} pilote</span>
          </div>
        </div>

        <div v-if="voirMarges" class="bg-white p-4 rounded-2xl border border-gray-100 shadow-3xs space-y-2">
          <span class="text-[10px] font-bold uppercase tracking-wider text-gris">CA ESTIMÉ / CYCLE</span>
          <div class="flex items-baseline justify-between">
            <span class="text-2xl font-display font-bold text-noir">{{ estimatedRevenue.toLocaleString('fr-FR') }}</span>
            <span class="text-[11px] text-gris">FCFA · {{ activeClientsCount }} clients</span>
          </div>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-gray-100 shadow-3xs space-y-2">
          <span class="text-[10px] font-bold uppercase tracking-wider text-gris">COMMANDES EN ATTENTE</span>
          <div class="flex items-baseline justify-between">
            <span class="text-2xl font-display font-bold text-noir">{{ pendingOrdersCount }}</span>
            <span class="text-[11px] text-amber-800 font-semibold">→ À préparer</span>
          </div>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-gray-100 shadow-3xs space-y-2">
          <span class="text-[10px] font-bold uppercase tracking-wider text-gris">RENOUVELLEMENTS (J-5)</span>
          <div class="flex items-baseline justify-between">
            <span class="text-2xl font-display font-bold text-noir">{{ upcomingRenewals.length }}</span>
            <span class="text-[11px] text-red-700 font-semibold">Client(s) concerné(s)</span>
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
          <router-link to="/dashboard/admin/inventaire" class="text-[11px] font-bold text-red-700 underline shrink-0">Voir stock →</router-link>
        </div>

        <!-- Alerte Renouvellements imminents (J-5) -->
        <div v-if="upcomingRenewals.length > 0 && upcomingRenewals[0]" class="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 flex items-center justify-between gap-2.5">
          <div class="flex items-center gap-2.5">
            <Bell class="w-4 h-4 text-amber-800 shrink-0" />
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
                <span class="px-2 py-0.5 bg-gray-100 text-gris rounded-md text-[10px]">par formule</span>
                </div>

                <div class="space-y-3">
                <div v-for="form in formulaDistribution" :key="form.name" class="flex items-center gap-3">
                    <span class="w-20 font-bold text-[10px] uppercase text-gris tracking-wider">{{ form.name }}</span>
                    <div class="flex-1 bg-gray-100 h-3 rounded-full overflow-hidden">
                    <div :class="[form.color, 'h-full transition-all duration-500 rounded-full']" :style="{ width: form.width }"></div>
                    </div>
                    <span class="w-16 text-right font-semibold text-gris">{{ form.count }} client(s)</span>
                </div>
                </div>
            </div>

            <!-- FRÉQUENTATION DU SITE -->
            <div v-if="frequentation" class="bg-white p-4 rounded-2xl border border-gray-100 shadow-3xs space-y-4">
                <div class="flex items-center justify-between border-b border-gray-100 pb-2">
                <h2 class="font-bold text-noir text-sm">Fréquentation du site</h2>
                <span class="px-2 py-0.5 bg-gray-100 text-gris rounded-md text-[10px]">30 derniers jours, sans cookie</span>
                </div>
                <div class="grid grid-cols-3 gap-3 text-center">
                <div><p class="text-xl font-bold text-noir tabular-nums">{{ frequentation.visites.toLocaleString('fr-FR') }}</p><p class="text-[10px] text-gris">pages vues</p></div>
                <div><p class="text-xl font-bold text-foret tabular-nums">{{ frequentation.clicsWhatsApp.toLocaleString('fr-FR') }}</p><p class="text-[10px] text-gris">clics WhatsApp</p></div>
                <div><p class="text-xl font-bold text-noir tabular-nums">{{ frequentation.tauxClic === null ? '—' : `${frequentation.tauxClic} %` }}</p><p class="text-[10px] text-gris">clics / pages vues</p></div>
                </div>
                <div v-if="frequentation.origines.length">
                <p class="text-[10px] font-bold uppercase tracking-wider text-gris mb-1.5">D'où viennent les clics WhatsApp</p>
                <ul class="space-y-1">
                    <li v-for="o in frequentation.origines" :key="o.detail" class="flex justify-between gap-3 text-xs">
                    <span class="text-noir truncate">{{ libelleOrigine(o.detail) }}</span>
                    <span class="font-semibold text-gris tabular-nums">{{ o.nombre }}</span>
                    </li>
                </ul>
                </div>
                <p v-else class="text-xs text-gris">Aucun clic vers WhatsApp mesuré sur la période.</p>
            </div>

            <!-- MARGE BRUTE -->
            <div v-if="voirMarges" class="bg-white p-4 rounded-2xl border border-gray-100 shadow-3xs space-y-3">
            <div class="flex items-center justify-between border-b border-gray-100 pb-2">
                <div>
                <h2 class="font-bold text-noir text-sm">Marge brute</h2>
                <p class="text-[10px] text-gris">Calculée dynamiquement selon les compositions des packs</p>
                </div>
                <span class="px-2.5 py-0.5 bg-amber-100 text-amber-800 font-bold rounded-full text-[10px]">
                Phase 1 lancement
                </span>
            </div>

            <!-- Indication pendant le chargement -->
            <div v-if="isLoadingFormulas" class="text-center py-6 text-gris animate-pulse">
                Calcul des coûts et marges par formule...
            </div>

            <div v-defilable="'Marge brute par formule'" v-else class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                <thead>
                    <tr class="border-b border-gray-100 text-[10px] font-bold text-gris uppercase tracking-wider">
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
                        <span v-if="item.launchPrice === null" class="text-gris font-body text-[10px]">Prix à définir</span>
                        <span v-else>{{ item.launchPrice.toLocaleString('fr-FR') }} F</span>
                    </td>

                    <!-- Coût Réel des produits du pack -->
                    <td class="py-2.5 px-3 text-right text-gris">
                        {{ item.realCost.toLocaleString('fr-FR') }} F
                    </td>

                    <!-- Marge Brute Calculated -->
                    <td class="py-2.5 px-3 text-right">
                        <span v-if="item.margin === null" class="text-gris font-body text-[10px]">
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
                <Clock class="w-4 h-4 text-amber-800" />
                Renouvellements J-5
              </h2>
              <span class="px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-bold text-[10px]">
                {{ upcomingRenewals.length }}
              </span>
            </div>

            <div v-if="upcomingRenewals.length === 0" class="text-center py-6 text-gris">
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
                    <span class="px-1.5 py-0.2 bg-white border border-gray-200 rounded text-[9px] font-bold text-gris uppercase">
                      {{ item.formule }}
                    </span>
                    <span 
                      :class="[
                        item.daysRemaining <= 0 ? 'text-red-600 font-bold' : 'text-amber-800 font-semibold',
                        'text-[10px]'
                      ]"
                    >
                      {{ item.daysRemaining <= 0 ? 'Expiré' : 'J-' + item.daysRemaining }}
                    </span>
                  </div>
                </div>
                
                <button 
                  @click="openWhatsApp(item.whatsapp, item.clientName, item.formule, item.daysRemaining)" 
                  class="shrink-0 cursor-pointer px-2.5 py-1.5 bg-foret hover:bg-savane text-white font-bold text-[10px] rounded-lg flex items-center gap-1 transition-all shadow-xs"
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
              <router-link to="/dashboard/admin/commandes" class="inline-flex items-center min-h-11 sm:min-h-6 px-2 -mr-2 text-[10px] text-foret font-bold hover:underline">Voir tout →</router-link>
            </div>

            <table class="w-full text-left">
              <thead>
                <tr class="text-[10px] font-bold text-gris uppercase tracking-wider border-b border-gray-50">
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
                    <span class="px-2 py-0.5 bg-gray-100 rounded text-[10px] font-bold text-gris uppercase">
                      {{ cmd.formule }}
                    </span>
                  </td>
                  <td class="py-2.5 text-right">
                    <span :class="[classeStatut(cmd.statut), 'px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap']">
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