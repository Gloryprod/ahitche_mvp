<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Plus, X, Trash2, Search, Eye, Edit3, Download, ChevronDown, PackageCheck } from 'lucide-vue-next'
import Swal from 'sweetalert2'
import { useQuery, useMutation, useQueryClient, keepPreviousData, type QueryFunctionContext } from '@tanstack/vue-query'
import api from '@/stores/api'
import type { BonCommande, Product, ProduitLigneBon } from '@/type'
import { messageErreur } from '@/services/erreurs'
import { useFournisseurs } from '@/composables/useFournisseurs'
import { useAuthStore } from '@/stores/auth'
import { peutEcrire } from '@/config/roles'
import {
  classeStatutBon, dateFr, estAchatDirect, estFormatFacture, formatFcfa, formatQuantite, libelleProduit, ligneRecue,
  lignesFigees, nomDuBon, numeroDuLot, peutModifierFacture, peutReceptionner, produitDeLigne, totalDuBon,
} from '@/services/bonsCommande'
import FormulaireBonFacture from './FormulaireBonFacture.vue'
import ReceptionBon from './ReceptionBon.vue'

// Bons de commande fournisseurs. Format facture : création, modification tant qu'aucune ligne n'est reçue,
// réception en lots. Les anciens bons (quantités et prix prévus) gardent leur détail et leur formulaire d'origine.

// Ancien format : données envoyées pour modifier un ancien bon
interface OrderItem {
  productId: string
  quantiteCommandee: number
  prixUnitairePrevu: number
}
interface BonPayload {
  fournisseurId: string
  items: OrderItem[]
}
type LigneAncienFormat = NonNullable<BonCommande['items']>[number]
interface PageBons {
  bonsCommande: BonCommande[]
  total: number
  hasMore: boolean
}

// Volets : détail et formulaire d'un ancien bon (à côté de la liste) ; formulaire et réception du format facture
// (à la place de la liste, toute la largeur)
type Volet = '' | 'details' | 'ancien' | 'facture' | 'reception'

// --- ÉTATS & PAGINATION ---
const page = ref(1)
const search = ref('')
const debouncedSearch = ref('')
const queryClient = useQueryClient()
const notification = ref({ text: '', type: '' })
const authStore = useAuthStore()
const ecriture = computed(() => peutEcrire(authStore.role.value, 'stock')) // Admin et gestionnaire

const volet = ref<Volet>('')
const selectedBon = ref<BonCommande | null>(null)
const ouverts = ref(new Set<string>()) // Bons au format facture dont les lignes sont dépliées

// Ancien formulaire
const fournisseurSelectionne = ref('') // Identifiant de la fiche prestataire
const itemsCommande = ref<OrderItem[]>([
  { productId: '', quantiteCommandee: 1, prixUnitairePrevu: 0 }
])

const { fournisseurs } = useFournisseurs()

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
// Recherche du serveur : numéro du bon, fournisseur et numéro de facture
const fetchPurchaseOrders = async ({ queryKey }: QueryFunctionContext): Promise<PageBons> => {
  const [, currentPage, currentSearch] = queryKey
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

// Catalogue complet, tous types (on achète aussi matières premières et fournitures), jusqu'au maximum du serveur ;
// inutile en lecture seule (le serveur renvoie les produits des bons avec leur nom)
const { data: produitsCatalogue } = useQuery<Product[]>({
  queryKey: ['productsMin'],
  queryFn: async () => {
    const res = await api.get('/api/admin/products', { params: { limit: 200 } })
    return res.data.products
  },
  enabled: ecriture,
})

// --- MUTATIONS (anciens bons et suppression) ---
const updateMutation = useMutation({
  mutationFn: async ({ id, payload }: { id: string; payload: BonPayload }) => {
    return await api.put(`/api/admin/bons-commande/${id}`, payload)
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] })
    closePanel()
    showNotification("Bon de commande modifié avec succès !", "success")
  },
  onError: (err) => showNotification(messageErreur(err, "Modification du bon impossible."), "error"),
})

// Le serveur refuse un bon dont une ligne est déjà reçue : son message s'affiche
const deleteMutation = useMutation({
  mutationFn: async (id: string) => {
    return await api.delete(`/api/admin/bons-commande/${id}`)
  },
  onSuccess: (_reponse, id) => {
    queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] })
    if (selectedBon.value?._id === id) closePanel()
    showNotification("Bon de commande supprimé avec succès", "success")
  },
  onError: (err) => showNotification(messageErreur(err, "Suppression du bon impossible."), "error"),
})

// --- VOLETS ---
const ouvrirCreation = () => {
  selectedBon.value = null
  volet.value = 'facture'
}

// Volet d'un ancien bon : au-dessus de la liste sur téléphone, amené à l'écran s'il n'y est pas
const voletAncien = ref<HTMLElement | null>(null)
const montrerVoletAncien = () => {
  void nextTick(() => {
    const haut = voletAncien.value?.getBoundingClientRect().top
    if (haut !== undefined && (haut < 0 || haut > window.innerHeight)) voletAncien.value?.scrollIntoView({ block: 'start' })
  })
}

const ouvrirDetails = (bon: BonCommande) => {
  selectedBon.value = bon
  volet.value = 'details'
  montrerVoletAncien()
}

const idProduit = (p: ProduitLigneBon | string | null | undefined) => (p && typeof p === 'object' ? p._id : (p ?? ''))

// Format facture : nouveau formulaire prérempli ; ancien format : formulaire d'origine
const ouvrirModification = (bon: BonCommande) => {
  selectedBon.value = bon
  if (estFormatFacture(bon)) {
    volet.value = 'facture'
    return
  }
  fournisseurSelectionne.value = bon.fournisseurId || '' // Anciens bons « Autre » : fournisseur à choisir
  itemsCommande.value = (bon.items ?? []).map(i => ({
    productId: idProduit(i.productId),
    quantiteCommandee: i.quantiteCommandee,
    prixUnitairePrevu: i.prixUnitairePrevu
  }))
  volet.value = 'ancien'
  montrerVoletAncien()
}

const ouvrirReception = (bon: BonCommande) => {
  selectedBon.value = bon
  volet.value = 'reception'
}

const closePanel = () => {
  volet.value = ''
  selectedBon.value = null
}

// Bon enregistré ou réceptionné : message du serveur, retour à la liste (déjà rechargée)
const apresEnvoi = (message: string) => {
  closePanel()
  showNotification(message, 'success')
}

const basculerLignes = (id: string) => {
  if (ouverts.value.has(id)) ouverts.value.delete(id)
  else ouverts.value.add(id)
}

// --- ANCIEN FORMULAIRE (inchangé) ---
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
  if (itemsValides.length === 0 || !fournisseurSelectionne.value || !selectedBon.value) return
  updateMutation.mutate({ id: selectedBon.value._id, payload: { fournisseurId: fournisseurSelectionne.value, items: itemsValides } })
}

const confirmerSuppression = async (bon: BonCommande) => {
  const result = await Swal.fire({
    titleText: `Êtes-vous sûr de vouloir supprimer ${nomDuBon(bon)} ?`, // Texte brut : le numéro est saisi à la main
    text: estFormatFacture(bon) ? 'Son numéro et sa facture pourront être saisis de nouveau.' : undefined,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#1A5C38',
    confirmButtonText: 'Oui, supprimer',
    cancelButtonText: 'Annuler',
    customClass: { popup: 'rounded-2xl font-body' }
  })

  if (result.isConfirmed) {
    deleteMutation.mutate(bon._id)
  }
}

// PDF chargé à la demande (jsPDF est lourd pour un téléphone). Après un échec de chargement, le navigateur garde
// l'échec en mémoire : réessayer ne sert qu'après avoir rechargé la page.
const telechargerPDF = async (bon: BonCommande) => {
  try {
    const pdf = await import('@/services/pdfService')
    if (estFormatFacture(bon)) pdf.genererBonFacturePDF(bon)
    else pdf.générerBonCommandePDF({ ...bon, items: bon.items ?? [] }, produitsCatalogue.value || [])
  } catch {
    showNotification("Le PDF n'a pas pu être préparé : vérifiez la connexion, rechargez la page, puis réessayez.", 'error')
  }
}

// --- AFFICHAGE ---
const typeAffiche = (bon: BonCommande) => {
  if (!estFormatFacture(bon)) return 'Ancien format'
  return bon.typeCommande === 'Achat direct' ? 'Achat direct' : 'Bon de commande'
}

// Date du bon signé ; pour un achat direct, celle de la facture
const dateAffichee = (bon: BonCommande) => {
  if (estFormatFacture(bon) && bon.typeCommande === 'Achat direct') return `Facture du ${dateFr(bon.dateFacture ?? bon.dateEmission)}`
  if (!bon.dateEmission) return ''
  return `${estFormatFacture(bon) ? 'Bon du' : 'Émis le'} ${dateFr(bon.dateEmission)}`
}

const nombreLignes = (bon: BonCommande) => {
  const n = estFormatFacture(bon) ? bon.lignes?.length ?? 0 : bon.items?.length ?? 0
  const mot = estFormatFacture(bon) ? 'ligne' : 'article'
  return `${n} ${mot}${n > 1 ? 's' : ''}`
}

const formatPrixCFA = (valeur: number) => {
  return new Intl.NumberFormat('fr-BJ', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }).format(valeur)
}

const getNomProduit = (item: LigneAncienFormat) => {
  if (item.productId && typeof item.productId === 'object' && item.productId.name) {
    return item.productId.name
  }
  const prod = produitsCatalogue.value?.find(p => p._id === item.productId)
  return prod ? prod.name : 'Produit inconnu'
}

// Une nouvelle notification relance le délai : la minuterie de la précédente ne l'efface pas
let minuterieNotification: ReturnType<typeof setTimeout> | undefined
const showNotification = (text: string, type: string) => {
  notification.value = { text, type }
  clearTimeout(minuterieNotification)
  minuterieNotification = setTimeout(() => notification.value = { text: '', type: '' }, 4000)
}

const champAncien = 'w-full px-3 py-2 bg-creme border border-creme2 rounded-xl text-xs font-medium text-noir focus:outline-none focus:border-foret'
const boutonSecondaire = 'cursor-pointer inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-creme2 bg-white text-noir font-bold hover:bg-creme'
</script>

<template>
  <div class="space-y-6 animate-fadeIn text-xs font-medium text-gris">

    <!-- BARRE D'ENTÊTE -->
    <div class="bg-white p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-creme2">
      <div class="min-w-0">
        <h1 class="font-display font-bold text-xl text-noir">Bons de commande</h1>
        <p class="text-[11px] text-gris">Factures d'achat des fournisseurs, ligne par ligne ; « Réceptionner » fait entrer les lignes en stock.</p>
      </div>
      <div class="flex items-center gap-2 w-full sm:w-auto">
        <div class="relative flex-1 min-w-0 sm:w-64 sm:flex-none">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gris" aria-hidden="true" />
          <input
            v-model="search"
            type="search"
            placeholder="Bon, facture ou fournisseur…"
            aria-label="Rechercher un bon : numéro, facture ou fournisseur"
            class="w-full pl-9 pr-3 py-2 bg-creme border border-creme2 rounded-xl text-xs font-medium text-noir focus:outline-none focus:border-foret"
          />
        </div>
        <button v-if="ecriture" type="button" @click="ouvrirCreation" class="cursor-pointer shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-foret text-white text-xs font-bold rounded-xl hover:bg-foret/90">
          <Plus class="w-3.5 h-3.5" /> Nouveau bon
        </button>
      </div>
    </div>

    <div v-if="notification.text" role="status" :class="[notification.type === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200', 'p-4 rounded-xl border text-xs font-semibold shadow-sm fixed top-4 right-4 left-4 sm:left-auto z-50 sm:max-w-sm']">
      {{ notification.text }}
    </div>

    <!-- FORMULAIRE OU RÉCEPTION D'UN BON AU FORMAT FACTURE -->
    <FormulaireBonFacture
      v-if="volet === 'facture'"
      :key="selectedBon?._id ?? 'nouveau'"
      :bon="selectedBon"
      :produits="produitsCatalogue ?? []"
      :fournisseurs="fournisseurs"
      @fermer="closePanel"
      @enregistre="apresEnvoi"
    />
    <ReceptionBon
      v-else-if="volet === 'reception' && selectedBon"
      :key="selectedBon._id"
      :bon="selectedBon"
      @fermer="closePanel"
      @receptionne="apresEnvoi"
    />

    <template v-else>
      <!-- COMPTEUR TOTAL -->
      <div class="flex items-center gap-2 bg-white p-4 rounded-2xl border border-creme2 font-semibold">
        <span>Bons enregistrés</span>
        <span class="px-2.5 py-1 bg-foret/10 text-foret rounded-full font-bold text-[11px]">{{ data?.total || 0 }}</span>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        <!-- LISTE DES BONS -->
        <div :class="[volet ? 'lg:col-span-2' : 'lg:col-span-3', 'min-w-0']">
          <p v-if="isLoading" class="bg-white rounded-2xl border border-creme2 p-6 text-center text-sm">Chargement du registre...</p>
          <p v-else-if="isError" class="p-4 bg-red-50 text-red-700 text-sm rounded-xl border border-red-200">Erreur lors de la récupération des bons de commande.</p>
          <p v-else-if="!data?.bonsCommande?.length" class="bg-white rounded-2xl border border-dashed border-creme2 p-8 text-center text-sm">
            {{ debouncedSearch ? 'Aucun bon ne correspond à cette recherche.' : 'Aucun bon de commande trouvé.' }}
          </p>

          <template v-else>
            <ul class="space-y-3 transition-opacity" :class="isPlaceholderData ? 'opacity-60' : ''">
              <li v-for="bon in data.bonsCommande" :key="bon._id" class="bg-white rounded-2xl border border-creme2 p-4">
                <!-- RÉSUMÉ DU BON -->
                <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div class="min-w-0 space-y-1">
                    <p class="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <!-- Achat direct : son numéro est celui de la facture, affiché une seule fois -->
                      <span v-if="estAchatDirect(bon)" class="font-bold text-sm text-noir break-all">Facture n° <span class="font-mono">{{ bon.numeroFacture }}</span></span>
                      <span v-else class="font-mono font-bold text-sm text-noir break-all">{{ bon.numeroBon }}</span>
                      <span class="px-2 py-0.5 rounded-full bg-creme2 text-noir text-[10px] font-bold whitespace-nowrap">{{ typeAffiche(bon) }}</span>
                    </p>
                    <p class="flex flex-wrap gap-x-3 gap-y-0.5">
                      <span v-if="estFormatFacture(bon) && !estAchatDirect(bon)">Facture n° <span class="font-mono text-noir break-all">{{ bon.numeroFacture || 'non indiquée' }}</span></span>
                      <span v-if="dateAffichee(bon)">{{ dateAffichee(bon) }}</span>
                      <span class="text-noir font-semibold break-words">{{ bon.fournisseur }}</span>
                    </p>
                  </div>
                  <div class="flex flex-wrap items-center gap-x-3 gap-y-1 sm:flex-col sm:items-end shrink-0">
                    <span :class="[classeStatutBon(bon.statut), 'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide whitespace-nowrap']">{{ bon.statut }}</span>
                    <span class="font-mono font-bold text-sm text-noir whitespace-nowrap">
                      {{ formatFcfa(totalDuBon(bon)) }}<span v-if="!estFormatFacture(bon)" class="font-body font-medium text-[10px] text-gris"> prévus</span>
                    </span>
                    <span class="whitespace-nowrap">{{ nombreLignes(bon) }}</span>
                  </div>
                </div>

                <!-- ACTIONS -->
                <div class="mt-3 pt-3 border-t border-creme2 flex flex-wrap items-center gap-2">
                  <button
                    v-if="estFormatFacture(bon)"
                    type="button"
                    :aria-expanded="ouverts.has(bon._id)"
                    :aria-controls="ouverts.has(bon._id) ? `bon-lignes-${bon._id}` : undefined"
                    :class="boutonSecondaire"
                    @click="basculerLignes(bon._id)"
                  >
                    <ChevronDown :class="[ouverts.has(bon._id) ? 'rotate-180' : '', 'w-3.5 h-3.5 transition-transform']" aria-hidden="true" />
                    {{ ouverts.has(bon._id) ? 'Masquer les lignes' : 'Voir les lignes' }}
                  </button>
                  <button v-else type="button" :class="boutonSecondaire" :aria-label="`Voir le détail du bon ${bon.numeroBon}`" @click="ouvrirDetails(bon)">
                    <Eye class="w-3.5 h-3.5" aria-hidden="true" /> Détail
                  </button>
                  <button v-if="ecriture && peutReceptionner(bon)" type="button" class="cursor-pointer inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-foret text-white font-bold hover:bg-foret/90" :aria-label="`Réceptionner le bon ${bon.numeroBon}`" @click="ouvrirReception(bon)">
                    <PackageCheck class="w-3.5 h-3.5" aria-hidden="true" /> Réceptionner
                  </button>
                  <button type="button" :class="boutonSecondaire" :aria-label="`Télécharger le PDF du bon ${bon.numeroBon}`" @click="telechargerPDF(bon)">
                    <Download class="w-3.5 h-3.5" aria-hidden="true" /> PDF
                  </button>
                  <div v-if="ecriture" class="ml-auto flex items-center gap-1">
                    <!-- Bon au format facture déjà reçu, même en partie : l'en-tête se modifie, ses lignes (en stock) non,
                         et il ne se supprime plus -->
                    <button v-if="!estFormatFacture(bon) || peutModifierFacture(bon)" type="button" title="Modifier" class="cursor-pointer p-1.5 text-gris hover:text-foret hover:bg-creme rounded-lg" :aria-label="`Modifier le bon ${bon.numeroBon}`" @click="ouvrirModification(bon)">
                      <Edit3 class="w-4 h-4" />
                    </button>
                    <button v-if="!lignesFigees(bon)" type="button" title="Supprimer" class="cursor-pointer p-1.5 text-gris hover:text-red-700 hover:bg-creme rounded-lg" :aria-label="`Supprimer le bon ${bon.numeroBon}`" @click="confirmerSuppression(bon)">
                      <Trash2 class="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <!-- DÉTAIL DÉPLIABLE (format facture) -->
                <div v-if="estFormatFacture(bon) && ouverts.has(bon._id)" :id="`bon-lignes-${bon._id}`" class="mt-3 space-y-3">
                  <dl class="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 p-3 rounded-xl bg-creme text-[11px]">
                    <div v-if="bon.typeCommande !== 'Achat direct'">
                      <dt class="text-[10px] uppercase font-bold text-gris">Date du bon</dt>
                      <dd class="text-noir">{{ dateFr(bon.dateEmission) || '—' }}</dd>
                    </div>
                    <div>
                      <dt class="text-[10px] uppercase font-bold text-gris">Date de la facture</dt>
                      <dd class="text-noir">{{ dateFr(bon.dateFacture) || '—' }}</dd>
                    </div>
                    <div v-if="bon.dateReception">
                      <dt class="text-[10px] uppercase font-bold text-gris">Dernière réception</dt>
                      <dd class="text-noir">{{ dateFr(bon.dateReception) }}</dd>
                    </div>
                    <div v-if="bon.ligneBudgetaire || bon.sousLigne">
                      <dt class="text-[10px] uppercase font-bold text-gris">Ligne budgétaire</dt>
                      <dd class="text-noir font-mono">{{ [bon.ligneBudgetaire, bon.sousLigne].filter(Boolean).join(' · ') }}</dd>
                    </div>
                    <div v-if="bon.commentaire" class="col-span-2 sm:col-span-4">
                      <dt class="text-[10px] uppercase font-bold text-gris">Commentaire</dt>
                      <dd class="text-noir break-words whitespace-pre-line">{{ bon.commentaire }}</dd>
                    </div>
                  </dl>

                  <ol class="space-y-2">
                    <li v-for="(l, i) in bon.lignes" :key="l._id" class="p-3 rounded-xl border border-creme2">
                      <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                        <p class="min-w-0 font-bold text-noir break-words"><span class="font-normal text-gris">{{ i + 1 }}.</span> {{ l.designation }}</p>
                        <span class="font-mono font-bold text-noir whitespace-nowrap">{{ formatFcfa(l.montantFcfa) }}</span>
                      </div>
                      <dl class="mt-1.5 grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1 text-[11px]">
                        <div class="flex flex-wrap gap-x-1"><dt>Facturé :</dt><dd class="text-noir">{{ l.quantiteFacture || '—' }}</dd></div>
                        <div class="flex flex-wrap gap-x-1"><dt>Produit :</dt><dd class="text-noir break-words">{{ libelleProduit(produitDeLigne(l)) }}</dd></div>
                        <div class="flex flex-wrap gap-x-1">
                          <dt>Quantité :</dt>
                          <dd class="text-noir">{{ formatQuantite(l.quantite) }} {{ produitDeLigne(l)?.unit }}<span v-if="l.detailQuantite" class="text-gris"> ({{ l.detailQuantite }})</span></dd>
                        </div>
                      </dl>
                      <p v-if="ligneRecue(l)" class="mt-1.5 text-[11px] text-savane">
                        Reçu : <strong>{{ formatQuantite(l.quantiteRecue) }} {{ produitDeLigne(l)?.unit }}</strong>
                        · lot <span class="font-mono break-all">{{ numeroDuLot(l) || '—' }}</span>
                        <template v-if="l.lotFournisseur"> · lot fournisseur <span class="font-mono break-all">{{ l.lotFournisseur }}</span></template>
                      </p>
                      <p v-else class="mt-1.5 text-[11px] text-gris">Pas encore reçue</p>
                    </li>
                  </ol>
                  <p class="text-right text-noir">Total de la facture : <span class="font-mono font-bold">{{ formatFcfa(totalDuBon(bon)) }}</span></p>
                </div>
              </li>
            </ul>

            <!-- PAGINATION -->
            <div class="flex items-center justify-between pt-4">
              <button
                type="button"
                :disabled="page === 1 || isPlaceholderData"
                @click="page--"
                class="px-4 py-2 bg-white border border-creme2 rounded-xl text-xs font-semibold text-noir hover:bg-creme disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                ← Précédent
              </button>
              <span class="bg-creme2 px-3 py-1.5 rounded-lg text-noir font-bold">Page {{ page }}</span>
              <button
                type="button"
                :disabled="!data?.hasMore || isPlaceholderData"
                @click="page++"
                class="px-4 py-2 bg-white border border-creme2 rounded-xl text-xs font-semibold text-noir hover:bg-creme disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                Suivant →
              </button>
            </div>
          </template>
        </div>

        <!-- VOLET D'UN ANCIEN BON : DÉTAIL OU FORMULAIRE D'ORIGINE (au-dessus de la liste sur téléphone) -->
        <div v-if="(volet === 'details' || volet === 'ancien') && selectedBon" ref="voletAncien" class="order-first lg:order-none scroll-mt-20 bg-white p-5 rounded-2xl border border-creme2 shadow-sm space-y-4 animate-fadeIn lg:sticky lg:top-6">
          <div class="flex items-center justify-between gap-2 border-b border-creme2 pb-2.5">
            <h2 class="font-bold text-noir text-sm break-all">
              <span v-if="volet === 'ancien'">Modifier Bon {{ selectedBon.numeroBon }}</span>
              <span v-else>Détails - {{ selectedBon.numeroBon }}</span>
            </h2>
            <button type="button" @click="closePanel" class="shrink-0 p-1 bg-creme hover:bg-creme2 rounded-lg text-gris transition-all cursor-pointer" aria-label="Fermer">
              <X class="w-3.5 h-3.5" />
            </button>
          </div>

          <!-- 1. DÉTAIL -->
          <div v-if="volet === 'details'" class="space-y-4">
            <div class="bg-creme p-3 rounded-xl space-y-1">
              <div class="flex justify-between gap-2">
                <span class="text-gris">Fournisseur :</span>
                <span class="font-bold text-noir text-right">{{ selectedBon.fournisseur }}</span>
              </div>
              <div class="flex justify-between gap-2">
                <span class="text-gris">Statut :</span>
                <span class="font-bold" :class="selectedBon.statut === 'Reçu' ? 'text-green-800' : 'text-savane'">
                  {{ selectedBon.statut }}
                </span>
              </div>
            </div>

            <div>
              <span class="text-[10px] uppercase font-bold text-gris tracking-wider block mb-2">Articles commandés</span>
              <div class="divide-y divide-creme2 border border-creme2 rounded-xl overflow-hidden">
                <div v-for="(item, idx) in selectedBon.items" :key="idx" class="p-2.5 flex justify-between items-center gap-2 bg-white">
                  <div class="min-w-0">
                    <p class="font-bold text-noir break-words">{{ getNomProduit(item) }}</p>
                    <p class="text-[10px] text-gris font-mono">{{ item.quantiteCommandee }} x {{ formatPrixCFA(item.prixUnitairePrevu) }}</p>
                  </div>
                  <span class="font-mono font-bold text-noir whitespace-nowrap">
                    {{ formatPrixCFA(item.quantiteCommandee * item.prixUnitairePrevu) }}
                  </span>
                </div>
              </div>
            </div>

            <div class="flex justify-between items-center pt-2 border-t border-creme2">
              <span class="font-bold text-noir">Total Prévu :</span>
              <span class="font-mono font-bold text-sm text-foret">
                {{ formatPrixCFA(totalDuBon(selectedBon)) }}
              </span>
            </div>

            <button type="button" @click="telechargerPDF(selectedBon)" class="w-full flex items-center justify-center gap-2 py-2 bg-foret text-white font-bold rounded-xl hover:bg-foret/90 transition-all cursor-pointer">
              <Download class="w-4 h-4" /> Télécharger le PDF
            </button>
          </div>

          <!-- 2. FORMULAIRE D'ORIGINE (anciens bons) -->
          <form v-else @submit.prevent="soumettreFormulaire" class="space-y-4">
            <div class="space-y-1">
              <label for="ancien-bon-fournisseur" class="text-[10px] uppercase font-bold text-gris tracking-wider">Fournisseur</label>
              <select id="ancien-bon-fournisseur" v-model="fournisseurSelectionne" required :class="champAncien">
                <option value="" disabled>-- Choisir le fournisseur --</option>
                <option v-for="f in fournisseurs" :key="f._id" :value="f._id">{{ f.nom }}</option>
              </select>
            </div>

            <div class="space-y-2">
              <p class="text-[10px] uppercase font-bold text-gris tracking-wider">Articles à commander</p>

              <div v-for="(item, index) in itemsCommande" :key="index" class="p-3 bg-creme/50 rounded-xl border border-creme2 space-y-2 relative">
                <button v-if="itemsCommande.length > 1" type="button" @click="retirerLigneProduit(index)" class="absolute top-2 right-2 text-gris hover:text-red-700 transition-colors cursor-pointer" :aria-label="`Retirer l'article ${index + 1}`">
                  <Trash2 class="w-3.5 h-3.5" />
                </button>

                <select v-model="item.productId" :aria-label="`Produit de l'article ${index + 1}`" class="w-[85%] px-2 py-1.5 bg-white border border-creme2 rounded-lg text-xs font-medium text-noir focus:outline-none focus:border-foret">
                  <option value="" disabled>Sélectionner un produit</option>
                  <option v-for="p in produitsCatalogue" :key="p._id" :value="p._id">
                    {{ p.name }} ({{ p.unit }})
                  </option>
                </select>

                <div class="grid grid-cols-2 gap-2">
                  <label class="block">
                    <span class="text-[9px] text-gris uppercase font-bold">Quantité</span>
                    <input v-model.number="item.quantiteCommandee" type="number" min="1" class="w-full px-2 py-1 bg-white border border-creme2 rounded-lg font-mono text-xs text-noir focus:outline-none focus:border-foret" />
                  </label>
                  <label class="block">
                    <span class="text-[9px] text-gris uppercase font-bold">P.U. Estimé</span>
                    <input v-model.number="item.prixUnitairePrevu" type="number" min="0" class="w-full px-2 py-1 bg-white border border-creme2 rounded-lg font-mono text-xs text-noir focus:outline-none focus:border-foret" />
                  </label>
                </div>
              </div>

              <button type="button" @click="ajouterLigneProduit" class="w-full py-1.5 border border-dashed border-gris-lt rounded-xl text-gris hover:text-foret hover:border-foret transition-all font-bold text-center cursor-pointer">
                + Ajouter un produit
              </button>
            </div>

            <div class="pt-2 flex items-center gap-3">
              <button type="button" @click="closePanel" class="w-1/2 py-2 border border-creme2 text-gris font-bold rounded-xl hover:bg-creme transition-all text-center cursor-pointer">
                Annuler
              </button>
              <button type="submit" :disabled="updateMutation.isPending.value" class="w-1/2 py-2 bg-foret text-white font-bold rounded-xl hover:bg-foret/90 disabled:opacity-50 transition-all text-center cursor-pointer">
                Enregistrer
              </button>
            </div>
          </form>
        </div>

      </div>
    </template>
  </div>
</template>
