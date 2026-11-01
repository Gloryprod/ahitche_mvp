<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, computed, defineAsyncComponent, nextTick } from 'vue'
import api from '@/stores/api'
import { messageErreur } from '@/services/erreurs'
import { useQuery, useMutation, useQueryClient, keepPreviousData, type QueryFunctionContext } from '@tanstack/vue-query'
import CommandeForm from '@/components/admin/CommandeForm.vue'
import type { Client, Commande, Product } from '@/type'
import { Eye, Edit2, Trash2, Search, CheckCircle, ChevronDown } from 'lucide-vue-next'
import Swal from 'sweetalert2'
import { STATUTS, TRANSITIONS, classeStatut, type StatutCommande } from '@/config/commandes'
import { useChangementStatut } from '@/composables/useChangementStatut'
import { useAuthStore } from '@/stores/auth'
import { peutEcrire } from '@/config/roles'
import { estVendu } from '@/config/produits'
import { estAchatLibre } from '@/config/vip'

// Achat libre VIP : détail et chiffrage des demandes libres dans une fenêtre à part (chargée à l'ouverture),
// jamais dans le formulaire d'un pack
const DetailAchatLibre = defineAsyncComponent(() => import('@/components/admin/vip/DetailAchatLibre.vue'))
const achatLibreOuvert = ref<Commande | null>(null)
// Saisie d'un achat libre au nom d'un client VIP (admin et gestionnaires), chargée à l'ouverture
const FormulaireAchatLibreAdmin = defineAsyncComponent(() => import('@/components/admin/vip/FormulaireAchatLibreAdmin.vue'))
const saisieAchatLibre = ref(false)

// « Nouvelle commande » : choix entre un pack (formulaire existant) et un achat libre VIP
const menuNouvelle = ref(false)
const zoneMenuNouvelle = ref<HTMLElement | null>(null)
const premierChoix = ref<HTMLButtonElement | null>(null)
async function basculerMenuNouvelle() {
  menuNouvelle.value = !menuNouvelle.value
  if (menuNouvelle.value) {
    await nextTick()
    premierChoix.value?.focus()
  }
}
const fermerMenuSiDehors = (e: PointerEvent) => {
  if (menuNouvelle.value && !zoneMenuNouvelle.value?.contains(e.target as Node)) menuNouvelle.value = false
}
onMounted(() => document.addEventListener('pointerdown', fermerMenuSiDehors))
onBeforeUnmount(() => document.removeEventListener('pointerdown', fermerMenuSiDehors))

const authStore = useAuthStore()
const ecriture = computed(() => peutEcrire(authStore.role.value, 'commandes'))
const estAdmin = computed(() => authStore.role.value === 'admin')

// Remise en attente (D-10) : seul l'admin la valide ou la refuse
async function deciderRemise(cmd: Commande, decision: 'valider' | 'refuser') {
  try {
    const { message } = (await api.patch(`/api/admin/orders/${cmd.id}/remise`, { decision })).data
    queryClient.invalidateQueries({ queryKey: ['orders'] })
    showNotification(message, 'success')
  } catch (err) {
    showNotification(messageErreur(err, 'Décision impossible'), 'error')
  }
}

interface PaginatedCommandesResponse {
  orders: Commande[]
  hasMore: boolean
  total?: number
}

// États réactifs
const statutActif = ref('Toutes')
const page = ref(1)
const search = ref('')
const debouncedSearch = ref('')
const isModalOpen = ref(false)
const notification = ref({ text: '', type: '' })

// Pour la gestion de l'édition / détails
const selectedCommande = ref<Commande | null>(null)
const formMode = ref<'create' | 'edit' | 'detail'>('create')

// Listes pour les sélections du formulaire
const usersList = ref<Client[]>([])
const prodList = ref<Product[]>([])

const queryClient = useQueryClient()

onMounted(async () => {
  try {
    const [userRes, productRes] = await Promise.all([
      api.get('/api/admin/users?limit=100'),
      api.get('/api/admin/products?limit=200') // Maximum du serveur : les matières premières et fournitures en font partie
    ])
    usersList.value = userRes.data.users || []
    // Seuls les produits vendus (fixes et variables) peuvent entrer dans une commande ; le serveur refuse les autres
    prodList.value = ((productRes.data.products || []) as Product[]).filter(p => estVendu(p.type))
  } catch {
    showNotification("Erreur lors du chargement des options de formulaire", "error")
  }
})

// Debounce pour l'input de recherche
let timeoutId: ReturnType<typeof setTimeout>
watch(search, (newValue) => {
  clearTimeout(timeoutId)
  timeoutId = setTimeout(() => {
    debouncedSearch.value = newValue
    page.value = 1 
  }, 400)
})

watch(statutActif, () => {
  page.value = 1
})

const fetchCommandes = async ({ queryKey }: QueryFunctionContext): Promise<PaginatedCommandesResponse> => {
  const [, currentPage, currentSearch, currentStatut] = queryKey
  
  const response = await api.get('/api/admin/commandes', {
    params: {
      page: currentPage,
      search: currentSearch,
      limit: 10, 
      statut: currentStatut === 'Toutes' ? undefined : currentStatut
    }
  })
  
  if (!response?.data) throw new Error('Aucune donnée reçue du serveur')
  return response.data
}

const { data, isLoading, isError, error, isPlaceholderData } = useQuery({
  queryKey: ['orders', page, debouncedSearch, statutActif], 
  queryFn: fetchCommandes,
  placeholderData: keepPreviousData,
})

// --- MUTATIONS (ACTIONS DU TABLEAU) ---

// Mutation pour supprimer (archiver) la commande
const { mutate: deleteOrder } = useMutation({
  mutationFn: async (orderId: string) => {
    return await api.delete(`/api/admin/orders/${orderId}`)
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['orders'] })
    showNotification("Commande supprimée avec succès", "success")
  },
  onError: () => showNotification("Erreur lors de la suppression de la commande", "error")
})

// --- GESTION DES CLICS ACTIONS ---

const openCreateMode = () => {
  formMode.value = 'create'
  selectedCommande.value = null
  isModalOpen.value = true
}

const openDetailMode = (cmd: Commande) => {
  if (estAchatLibre(cmd)) {
    achatLibreOuvert.value = cmd
    return
  }
  formMode.value = 'detail'
  selectedCommande.value = cmd
  isModalOpen.value = true
}

const openEditMode = (cmd: Commande) => {
  if (estAchatLibre(cmd)) return // Son prix vient des prix VIP et du chiffrage : jamais recalculé comme un pack
  formMode.value = 'edit'
  selectedCommande.value = cmd
  isModalOpen.value = true
}

// Changement de statut guidé (paiement à la livraison), partagé avec l'écran Logistique
const { choisirEtChanger } = useChangementStatut()

const handleChangerStatut = async (cmd: Commande) => {
  try {
    const message = await choisirEtChanger(cmd)
    if (!message) return
    queryClient.invalidateQueries({ queryKey: ['orders'] })
    showNotification(message, 'success')
  } catch (err) {
    showNotification(messageErreur(err, 'Impossible de modifier le statut'), 'error')
  }
}

const handleDeleteClick = async(orderId: string) => {
  const result = await Swal.fire({
    title: 'Êtes-vous sûr de vouloir supprimer cette commande ?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#1e3a1f', // Adapte avec ta couleur "foret"
    cancelButtonColor: '#d33',
    confirmButtonText: 'Oui, supprimer',
    cancelButtonText: 'Annuler',
    background: '#ffffff',
    customClass: {
      popup: 'rounded-2xl font-body'
    }
  });

  if (result.isConfirmed) {
    deleteOrder(orderId)
  }
}

// --- STYLES ET NOTIFICATIONS ---
const ongletsStatut: (StatutCommande | 'Toutes')[] = ['Toutes', ...STATUTS]

const paiementStyles: Record<string, string> = {
  'Mobile Money': 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
  'Espèces': 'bg-amber-50 text-amber-700 border-amber-200/60',
  'Acompte': 'bg-sky-50 text-sky-700 border-sky-200/60'
}

const showNotification = (text: string, type: string) => {
  notification.value = { text, type }
  setTimeout(() => notification.value = { text: '', type: '' }, 4000)
}

const handleOrderSuccess = () => {
  queryClient.invalidateQueries({ queryKey: ['orders'] })
  showNotification("Opération effectuée avec succès", "success")
}

// Demandes libres chiffrées ou retirées : la liste (total, badge « à chiffrer ») est rechargée
const nouvelleCommandePack = () => {
  menuNouvelle.value = false
  openCreateMode()
}
const nouvelAchatLibre = () => {
  menuNouvelle.value = false
  saisieAchatLibre.value = true
}
// Achat libre saisi : il apparaît en tête de la liste « Toutes » (la plus récente d'abord)
const handleAchatLibreCree = (message: string) => {
  saisieAchatLibre.value = false
  statutActif.value = 'Toutes'
  page.value = 1
  queryClient.invalidateQueries({ queryKey: ['orders'] })
  showNotification(message, 'success')
}

const handleAchatLibreModifie = (message: string) => {
  queryClient.invalidateQueries({ queryKey: ['orders'] })
  showNotification(message, 'success')
}
</script>

<template>
  <div class="space-y-6">
    <div class="bg-white p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
      <h1 class="font-display font-bold text-xl text-noir">Commandes & Clients</h1>

      <div v-if="ecriture" ref="zoneMenuNouvelle" class="relative" @keydown.esc="menuNouvelle = false">
        <button
          type="button" :aria-expanded="menuNouvelle" aria-controls="menu-nouvelle-commande" @click="basculerMenuNouvelle"
          class="cursor-pointer w-full sm:w-auto min-h-11 px-4 py-2 bg-foret text-white text-xs font-bold rounded-lg hover:bg-opacity-95 transition-all shadow-sm flex items-center justify-center gap-1"
        >
          + Nouvelle commande <ChevronDown class="w-4 h-4" aria-hidden="true" />
        </button>
        <div v-if="menuNouvelle" id="menu-nouvelle-commande" class="absolute left-0 right-0 sm:left-auto sm:w-72 mt-2 z-30 bg-white rounded-2xl border border-creme2 shadow-lg p-2 space-y-1">
          <button ref="premierChoix" type="button" class="cursor-pointer w-full text-left min-h-11 p-3 rounded-xl hover:bg-creme focus-visible:bg-creme" @click="nouvelleCommandePack">
            <span class="block text-sm font-bold text-noir">Pack</span>
            <span class="block text-xs text-gris">Formule du mois : Essentiel, Équilibré, Confort</span>
          </button>
          <button type="button" class="cursor-pointer w-full text-left min-h-11 p-3 rounded-xl hover:bg-creme focus-visible:bg-creme" @click="nouvelAchatLibre">
            <span class="flex items-center gap-1.5 text-sm font-bold text-noir">Achat libre <span class="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-or text-noir">VIP</span></span>
            <span class="block text-xs text-gris">Au détail, au prix VIP, pour un client VIP</span>
          </button>
        </div>
      </div>
    </div>

    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 bg-white p-4 rounded-2xl shadow-2xs">
      <div class="flex items-center gap-2 text-xs font-semibold text-gris">
        <span>{{ statutActif === 'Toutes' ? 'Toutes les commandes' : `Commandes : ${statutActif.toLowerCase()}` }}</span>
        <span class="px-2.5 py-1 bg-foret/10 text-foret rounded-full font-bold text-[11px]">{{ data?.total || 0 }}</span>
      </div>
    </div>

    <div v-if="notification.text" :class="[notification.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200', 'p-4 rounded-xl border text-xs font-semibold shadow-2xs fixed top-4 right-4 z-50 max-w-sm']">
      {{ notification.text }}
    </div>

    <div v-if="isLoading" class="text-sm font-medium text-gris py-12 text-center bg-white rounded-2xl border border-gray-100 shadow-sm">
      <span class="inline-block animate-pulse">Chargement initial des commandes...</span>
    </div>
    
    <div v-else-if="isError" class="p-4 bg-red-50 text-red-700 text-sm rounded-xl border border-red-100">
      Erreur : {{ error?.message || "Impossible de charger la liste." }}
    </div>

    <div v-else :style="{ opacity: isPlaceholderData ? 0.6 : 1 }" class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-5 transition-opacity duration-200">
      
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-50 pb-2">
        <div class="flex gap-5 text-xs font-semibold text-gris overflow-x-auto whitespace-nowrap">
          <button v-for="onglet in ongletsStatut" :key="onglet" @click="statutActif = onglet" :class="['pb-2 border-b-2 transition-all cursor-pointer', statutActif === onglet ? 'border-foret text-foret font-bold' : 'border-transparent hover:text-noir']">{{ onglet }}</button>
        </div>

        <div class="relative w-full sm:w-64">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gris stroke-[2.5]" />
            <input v-model="search" type="text" aria-label="Rechercher un client" placeholder="Rechercher un client..." class="w-full pl-9 pr-4 py-2 bg-[#f9f9fb] border border-gray-200 rounded-xl text-xs font-medium text-noir placeholder-gray-400 focus:outline-none focus:border-foret focus:bg-white transition-all shadow-2xs" />
        </div>
      </div>

      <div v-if="!data?.orders || data.orders.length === 0" class="text-center py-12 text-sm text-gris bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
        Aucune commande ne correspond à ces critères.
      </div>

      <div v-defilable="'Commandes'" v-else class="overflow-x-auto">
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="border-b border-gray-100 text-[10px] text-gris font-bold uppercase tracking-wider">
              <th class="py-3 px-2 font-normal">#</th>
              <th class="py-3 px-2 font-normal">Client</th>
              <th class="py-3 px-2 font-normal">Whatsapp</th>
              <th class="py-3 px-2 font-normal">Formule</th>
              <th class="py-3 px-2 font-normal">Total</th>
              <th class="py-3 px-2 font-normal">Mode Paiement</th>
              <th class="py-3 px-2 font-normal">Date</th>
              <th class="py-3 px-2 font-normal">Statut</th>
              <th class="py-3 px-2 font-normal text-center">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50 text-gris font-medium">

            <tr v-for="cmd in data?.orders" :key="cmd.id" class="hover:bg-gray-50/60 transition-colors">
              <td class="py-3.5 px-2 text-gris whitespace-nowrap">
                {{ cmd.reference }}
              </td>
              <td class="py-3.5 px-2 text-noir font-bold">{{ cmd.clientName }}</td>
              <td class="py-3.5 px-2 text-gris tracking-wide">{{ cmd.whatsapp }}</td>
              <td class="py-3.5 px-2">
                <!-- Achat libre VIP : badge « VIP », et « à chiffrer » tant que des demandes libres attendent leur prix -->
                <span v-if="estAchatLibre(cmd)" class="inline-flex flex-wrap items-center gap-1">
                  <span class="bg-creme2 text-noir px-2 py-0.5 rounded text-[10px] font-bold uppercase whitespace-nowrap">Achat libre</span>
                  <span class="bg-or text-noir px-1.5 py-0.5 rounded text-[10px] font-extrabold">VIP</span>
                  <span v-if="(cmd.demandesAChiffrer ?? 0) > 0" class="bg-white border border-or-deep text-noir px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap">à chiffrer ({{ cmd.demandesAChiffrer }})</span>
                </span>
                <span v-else class="bg-creme2 text-gris px-2 py-0.5 rounded text-[10px] font-bold border border-creme2 uppercase">
                    {{ cmd.formule }}
                </span>
              </td>
              <td class="py-3.5 px-2 text-noir font-semibold whitespace-nowrap">
                {{ cmd.total.toLocaleString('fr-FR') }} F
                <span v-if="cmd.remise?.statut === 'Validée'" class="block text-[9px] font-bold text-savane" :title="cmd.remise.motif">remise − {{ cmd.remise.montant.toLocaleString('fr-FR') }} F</span>
                <span v-else-if="cmd.remise?.statut === 'À valider'" class="block text-[9px] font-bold text-amber-800" :title="cmd.remise.motif">
                  remise à valider : {{ cmd.remise.montant.toLocaleString('fr-FR') }} F
                  <template v-if="estAdmin">
                    <button type="button" @click="deciderRemise(cmd, 'valider')" class="cursor-pointer underline ml-1">valider</button>
                    <button type="button" @click="deciderRemise(cmd, 'refuser')" class="cursor-pointer underline ml-1">refuser</button>
                  </template>
                </span>
              </td>
              <td class="py-3.5 px-2">
                <span :class="['inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold border', paiementStyles[cmd.modePaiement] || 'bg-gray-50 text-gris border-gray-200']">
                  {{ cmd.modePaiement }}
                </span>
              </td>
              <td class="py-3.5 px-2 text-gris">{{ cmd.date }}</td>
              <td class="py-3.5 px-2">
                <span :class="[classeStatut(cmd.statut), 'px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap']">
                    {{ cmd.statut }}
                </span>
              </td>
              <td class="py-3.5 px-2 text-right">
                <div class="flex items-center justify-center gap-1.5">
                  <button v-if="ecriture && TRANSITIONS[cmd.statut]?.length && cmd.deletedAt === null" @click="handleChangerStatut(cmd)" title="Changer le statut" aria-label="Changer le statut" class="cursor-pointer p-1.5 text-gris hover:text-green-800 hover:bg-green-50 rounded-lg transition-colors">
                    <CheckCircle class="w-3.5 h-3.5" />
                  </button>
                  
                  <button @click="openDetailMode(cmd)" title="Voir détails" class="cursor-pointer p-1.5 text-gris hover:text-noir hover:bg-gray-100 rounded-lg transition-colors" aria-label="Voir le détail">
                    <Eye class="w-3.5 h-3.5" />
                  </button>
                  
                  <button v-if="ecriture && !estAchatLibre(cmd)" @click="openEditMode(cmd)" title="Modifier" class="cursor-pointer p-1.5 text-gris hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-colors" aria-label="Modifier">
                    <Edit2 class="w-3.5 h-3.5" />
                  </button>
                  
                  <button v-if="ecriture" @click="handleDeleteClick(cmd.id)" title="Supprimer" class="cursor-pointer p-1.5 text-gris hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" aria-label="Supprimer">
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>
            
          </tbody>
        </table>

        <div class="flex items-center justify-between pt-4 border-t border-gray-100 text-xs font-semibold text-gris">
          <button :disabled="page === 1 || isPlaceholderData" @click="page--" class="px-4 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm">← Précédent</button>
          <span class="bg-gray-100 px-3 py-1.5 rounded-lg text-noir">Page {{ page }}</span>
          <button :disabled="!data?.hasMore || isPlaceholderData" @click="page++" class="px-4 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm">Suivant →</button>
        </div>
      </div>
    </div>

    <CommandeForm 
        :open="isModalOpen" 
        :mode="formMode"
        :commande="selectedCommande"
        :clients="usersList || []" 
        :allProducts="prodList || []"
        @close="isModalOpen = false" 
        @success="handleOrderSuccess" 
    />

    <FormulaireAchatLibreAdmin
        v-if="saisieAchatLibre"
        @fermer="saisieAchatLibre = false"
        @cree="handleAchatLibreCree"
    />

    <DetailAchatLibre
        v-if="achatLibreOuvert"
        :commande="achatLibreOuvert"
        @fermer="achatLibreOuvert = null"
        @modifiee="handleAchatLibreModifie"
    />
  </div>
</template>