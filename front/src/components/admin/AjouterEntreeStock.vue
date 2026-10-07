<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue'
import { Search, Plus, Edit2, Trash2, Eye, X, Scale, SlidersHorizontal, FlaskConical, Factory } from 'lucide-vue-next'
import api from '@/stores/api'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/vue-query'
import Swal from 'sweetalert2'
import { useFournisseurs } from '@/composables/useFournisseurs'
import { useAuthStore } from '@/stores/auth'
import { peutEcrire } from '@/config/roles'
import type { Product } from '@/type'

// --- INTERFACES TYPES ---
// Lot « à compter » : quantité et prix vides tant que le comptage physique n'est pas fait (seule la valeur facturée est connue)
interface LotStockFifo {
  _id: string
  numeroLot: string
  product: Product | string // Peut être peuplé ou ID
  quantiteInitiale: number | null
  quantiteRestante: number | null
  prixAchatUnitaire: number | null
  valeurFcfa: number | null
  dateReception: string | null
  fournisseur: string // Nom recopié de la fiche prestataire, ou « Production interne »
  fournisseurId?: string | null
  lotFournisseur: string
  conditionnement: string
  aConfirmer: string // Ce qui reste à vérifier ; vide = lot confirmé
  numeroPiece: string
  depenseId: string | null
  commentaire: string
  createdAt?: string
}

interface PaginatedLotsResponse {
  lots: LotStockFifo[]
  hasMore: boolean
  aConfirmer: number
}

type Volet = '' | 'formulaire' | 'detail' | 'comptage' | 'correction' | 'essai' | 'transformation'

// --- ÉTATS ---
const page = ref(1)
const search = ref('')
const debouncedSearch = ref('')
const seulementAConfirmer = ref(false)
const isSubmitting = ref(false)
const notification = ref({ text: '', type: '' })
const queryClient = useQueryClient()
const authStore = useAuthStore()
const ecriture = computed(() => peutEcrire(authStore.role.value, 'stock'))

// Listes auxiliaires
const listeProduits = ref<Product[]>([])
const { fournisseurs } = useFournisseurs()

const volet = ref<Volet>('')
const isEditing = ref(false)
const selectedLot = ref<LotStockFifo | null>(null)

// Date du jour à l'heure locale (toISOString donnerait la veille entre minuit et 1 h à Cotonou)
const aujourdHui = () => new Date().toLocaleDateString('sv-SE')
const formVide = () => ({
  _id: '',
  numeroLot: '', // Vide : généré (LOT-<référence>-AAAAMMJJ-NN)
  productId: '',
  aCompter: false,
  quantiteRecue: null as number | null,
  prixAchatUnitaire: null as number | null,
  valeurFcfa: null as number | null,
  aConfirmer: '',
  fournisseurId: '',
  dateReception: aujourdHui(),
  numeroPiece: '',
  lotFournisseur: '',
  conditionnement: '',
  commentaire: '',
  creerDepense: true,
  ligneBudgetaire: '' // Achat financé par la subvention : ligne du budget (ex : L5), sinon dépense d'exploitation
})
const form = ref(formVide())
const comptage = ref({ quantite: null as number | null, commentaire: '' })
const correction = ref({ sens: 'negative' as 'negative' | 'positive', quantite: null as number | null, raison: 'Perte', commentaire: '' })
const essai = ref({ productId: '', quantite: null as number | null, commentaire: '' })
const transformation = ref({ matiereId: '', quantiteMatiere: null as number | null, produitId: '', quantiteObtenue: null as number | null, date: aujourdHui(), numeroLot: '', commentaire: '' })

// Debounce pour optimiser les requêtes réseau sur la recherche de lots
let timeoutId: ReturnType<typeof setTimeout>
watch(search, (newValue) => {
  clearTimeout(timeoutId)
  timeoutId = setTimeout(() => {
    debouncedSearch.value = newValue
    page.value = 1
  }, 400)
})
watch(seulementAConfirmer, () => { page.value = 1 })

// --- CHARGEMENTS DES DONNÉES (API) ---
const chargerProduitsReference = async () => {
  try {
    const response = await api.get('/api/admin/products?limit=200')
    if (response?.data) listeProduits.value = response.data.products
  } catch (err) {
    console.error("Impossible de récupérer la liste des produits", err)
  }
}
onMounted(chargerProduitsReference)

const fetchLotsStock = async ({ queryKey }: { queryKey: any }): Promise<PaginatedLotsResponse> => {
  const [, currentPage, currentSearch, aConfirmer] = queryKey
  const response = await api.get('/api/admin/stock/lots', {
    params: { page: currentPage, search: currentSearch, limit: 10, ...(aConfirmer ? { aConfirmer: '1' } : {}) }
  })
  if (!response?.data) throw new Error('Aucune donnée de stock reçue du serveur')
  return response.data
}

const { data, isLoading, isError, error, isPlaceholderData } = useQuery({
  queryKey: ['lotsStock', page, debouncedSearch, seulementAConfirmer],
  queryFn: fetchLotsStock,
  placeholderData: keepPreviousData,
})

// --- OUTILS D'AFFICHAGE ---
const produitDuLot = (lot: LotStockFifo) => (typeof lot.product === 'object' ? lot.product : null)
const nomProduit = (lot: LotStockFifo) => produitDuLot(lot)?.name ?? '—'
const uniteLot = (lot: LotStockFifo) => produitDuLot(lot)?.unit ?? ''
const estACompter = (lot: LotStockFifo) => lot.quantiteInitiale === null
const libelleProduit = (p: Product) => (p.reference ? `${p.reference} · ${p.name}` : p.name) + ` (${p.unit})`
const formatPrix = (valeur: number | null) => (valeur === null ? '—' : new Intl.NumberFormat('fr-FR').format(valeur) + ' FCFA')
const formatDate = (dateStr: string | null) => {
  if (!dateStr) return 'non consignée'
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
const showNotification = (text: string, type: string) => {
  notification.value = { text, type }
  setTimeout(() => notification.value = { text: '', type: '' }, 4000)
}

// --- GESTION DES VOLETS ---
const ouvrir = (v: Volet, lot: LotStockFifo | null = null) => {
  selectedLot.value = lot
  volet.value = v
}
const closePanels = () => { volet.value = ''; selectedLot.value = null }

const openCreateMode = () => {
  isEditing.value = false
  form.value = formVide()
  ouvrir('formulaire')
}

const openEditMode = (lot: LotStockFifo) => {
  isEditing.value = true
  form.value = {
    ...formVide(),
    _id: lot._id,
    numeroLot: lot.numeroLot,
    productId: produitDuLot(lot)?._id ?? (lot.product as string),
    aCompter: estACompter(lot),
    quantiteRecue: lot.quantiteInitiale,
    prixAchatUnitaire: lot.prixAchatUnitaire,
    valeurFcfa: lot.valeurFcfa,
    aConfirmer: lot.aConfirmer,
    fournisseurId: lot.fournisseurId || '',
    dateReception: lot.dateReception ? lot.dateReception.substring(0, 10) : '',
    numeroPiece: lot.numeroPiece,
    lotFournisseur: lot.lotFournisseur,
    conditionnement: lot.conditionnement,
    commentaire: lot.commentaire
  }
  ouvrir('formulaire', lot)
}

const ouvrirComptage = (lot: LotStockFifo) => { comptage.value = { quantite: null, commentaire: '' }; ouvrir('comptage', lot) }
const ouvrirCorrection = (lot: LotStockFifo) => { correction.value = { sens: 'negative', quantite: null, raison: 'Perte', commentaire: '' }; ouvrir('correction', lot) }
const ouvrirEssai = () => { essai.value = { productId: '', quantite: null, commentaire: '' }; ouvrir('essai') }
const ouvrirTransformation = () => { transformation.value = { matiereId: '', quantiteMatiere: null, produitId: '', quantiteObtenue: null, date: aujourdHui(), numeroLot: '', commentaire: '' }; ouvrir('transformation') }

// Envoi commun : message du serveur, rafraîchissement des listes, fermeture du volet
const envoyer = async (action: () => Promise<{ data: { message?: string } }>, messageParDefaut: string) => {
  isSubmitting.value = true
  try {
    const { data: corps } = await action()
    showNotification(corps.message || messageParDefaut, 'success')
    queryClient.invalidateQueries({ queryKey: ['lotsStock'] })
    queryClient.invalidateQueries({ queryKey: ['globalInventory'] })
    queryClient.invalidateQueries({ queryKey: ['mouvementsStock'] })
    closePanels()
  } catch (err: any) {
    showNotification(err.response?.data?.message || "Une erreur est survenue lors de l'enregistrement", 'error')
  } finally {
    isSubmitting.value = false
  }
}

const handleSubmit = () => {
  const f = form.value
  const corps = {
    numeroLot: f.numeroLot,
    productId: f.productId,
    fournisseurId: f.fournisseurId,
    dateReception: f.dateReception,
    numeroPiece: f.numeroPiece,
    lotFournisseur: f.lotFournisseur,
    conditionnement: f.conditionnement,
    aConfirmer: f.aConfirmer,
    commentaire: f.commentaire
  }
  if (isEditing.value) {
    // La quantité ne change pas ici : « Compter » ou « Corriger »
    return envoyer(() => api.put(`/api/admin/stock/lots/${f._id}`, { ...corps, ...(f.aCompter ? {} : { prixAchatUnitaire: f.prixAchatUnitaire }) }), 'Lot modifié.')
  }
  return envoyer(() => api.post('/api/admin/stock/lots', {
    ...corps,
    quantiteRecue: f.aCompter ? null : f.quantiteRecue,
    prixAchatUnitaire: f.aCompter ? null : f.prixAchatUnitaire,
    valeurFcfa: f.valeurFcfa,
    creerDepense: f.creerDepense,
    ligneBudgetaire: f.creerDepense ? f.ligneBudgetaire.trim() : ''
  }), 'Entrée enregistrée.')
}

const envoyerComptage = () => envoyer(() => api.post(`/api/admin/stock/lots/${selectedLot.value!._id}/comptage`, comptage.value), 'Comptage enregistré.')
const envoyerCorrection = () => envoyer(() => api.post(`/api/admin/stock/lots/${selectedLot.value!._id}/correction`, correction.value), 'Correction enregistrée.')
const envoyerEssai = () => envoyer(() => api.post('/api/admin/stock/essais', essai.value), 'Essai enregistré.')
const envoyerTransformation = () => envoyer(() => api.post('/api/admin/stock/transformations', transformation.value), 'Transformation enregistrée.')

// Une perte ou une péremption retire toujours du stock
watch(() => correction.value.raison, (r) => { if (r !== 'Erreur de saisie') correction.value.sens = 'negative' })

const deleteLot = async (lot: LotStockFifo) => {
  const result = await Swal.fire({
    title: 'Supprimer ce lot ?',
    text: `Le lot ${lot.numeroLot} sort de l'inventaire ; le mouvement est consigné.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#1A5C38',
    cancelButtonColor: '#d33',
    confirmButtonText: 'Oui, supprimer',
    cancelButtonText: 'Annuler',
    customClass: { popup: 'rounded-2xl font-body' }
  })
  if (result.isConfirmed) await envoyer(() => api.delete(`/api/admin/stock/lots/${lot._id}`), 'Lot supprimé.')
}

const titreVolet = computed(() => ({
  '': '',
  formulaire: isEditing.value ? 'Modifier le lot' : 'Entrée de marchandise',
  detail: 'Fiche du lot',
  comptage: 'Compter le lot',
  correction: 'Corriger le lot',
  essai: 'Essai (sortie de stock)',
  transformation: 'Transformation'
}[volet.value]))

const champ = 'w-full px-3 py-2 bg-[#f9f9fb] border border-gray-200 rounded-lg focus:outline-none focus:border-foret text-noir'
const etiquette = 'block mb-1.5 font-bold text-noir text-[10px] uppercase'
</script>

<template>
  <div class="space-y-6 animate-fadeIn text-xs font-medium text-gris">

    <!-- BARRE D'ENTÊTE -->
    <div class="bg-white p-4 rounded-2xl flex flex-col gap-3 border-b border-gray-200">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 class="font-display font-bold text-xl text-noir">Entrées de Stock</h1>
        <div class="relative w-full sm:w-60">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gris stroke-[2.5]" />
          <input v-model="search" type="text" placeholder="Lot, fournisseur, n° de pièce…" aria-label="Rechercher un lot" class="w-full pl-9 pr-4 py-2 bg-[#f9f9fb] border border-gray-200 rounded-xl text-xs font-medium text-noir focus:outline-none focus:border-foret focus:bg-white transition-all" />
        </div>
      </div>
      <div v-if="ecriture" class="flex flex-wrap gap-2">
        <button @click="openCreateMode" class="cursor-pointer flex items-center gap-1.5 px-4 py-2 bg-foret text-white text-xs font-bold rounded-xl hover:bg-opacity-95 shadow-sm">
          <Plus class="w-3.5 h-3.5 stroke-3" /> Nouvelle entrée
        </button>
        <button @click="ouvrirTransformation" class="cursor-pointer flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-noir text-xs font-bold rounded-xl hover:bg-gray-50">
          <Factory class="w-3.5 h-3.5" /> Transformation
        </button>
        <button @click="ouvrirEssai" class="cursor-pointer flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-noir text-xs font-bold rounded-xl hover:bg-gray-50">
          <FlaskConical class="w-3.5 h-3.5" /> Essai
        </button>
      </div>
    </div>

    <!-- NOTIFICATIONS FLOTTANTES -->
    <div v-if="notification.text" role="status" :class="[notification.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200', 'p-4 rounded-xl border text-xs font-semibold shadow-2xs fixed top-4 right-4 left-4 sm:left-auto z-50 sm:max-w-sm']">
      {{ notification.text }}
    </div>

    <!-- COMPTEUR ET FILTRE « À CONFIRMER » -->
    <div class="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl shadow-2xs">
      <div class="flex items-center gap-2 text-xs font-semibold text-gris">
        <span>Lots affichés</span>
        <span class="px-2.5 py-1 bg-foret/10 text-foret rounded-full font-bold text-[11px]">{{ data?.lots?.length ?? 0 }}</span>
      </div>
      <label class="flex items-center gap-2 cursor-pointer text-xs font-semibold" :class="data?.aConfirmer ? 'text-amber-800' : 'text-gris'">
        <input v-model="seulementAConfirmer" type="checkbox" class="accent-foret" />
        Seulement les lots à compter ou à vérifier ({{ data?.aConfirmer ?? 0 }})
      </label>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

      <!-- TABLEAU DES LOTS -->
      <div :class="[volet ? 'lg:col-span-2' : 'lg:col-span-3', 'bg-white rounded-2xl border border-gray-100 shadow-3xs overflow-hidden']">
        <div v-if="isLoading" class="text-sm font-medium text-gris p-8 text-center">Chargement des lots…</div>
        <div v-else-if="isError" class="p-4 bg-red-50 text-red-700 text-sm rounded-xl border border-red-100">
          Erreur : {{ error?.message || "Impossible de charger les lots." }}
        </div>
        <div v-else class="p-4">
          <p v-if="!data?.lots?.length" class="text-center py-6 text-sm text-gris">Aucun lot ne correspond.</p>
          <div v-defilable="'Lots de stock'" v-else class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-gray-50/70 border-b border-gray-100 text-[10px] font-bold uppercase tracking-wider text-gris">
                  <th class="py-3 px-3">N° de lot</th>
                  <th class="py-3 px-3">Produit</th>
                  <th class="py-3 px-3">Fournisseur</th>
                  <th class="py-3 px-3 text-center">Reste / Initial</th>
                  <th class="py-3 px-3 text-right">P.A. unitaire</th>
                  <th class="py-3 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50 text-noir">
                <tr v-for="lot in data.lots" :key="lot._id" class="hover:bg-gray-50/50 align-top">
                  <td class="py-3 px-3 font-mono font-bold text-gray-700 whitespace-nowrap">{{ lot.numeroLot }}</td>
                  <td class="py-3 px-3">
                    <span class="font-bold">{{ nomProduit(lot) }}</span>
                    <span v-if="lot.aConfirmer" class="block mt-1 text-[10px] font-semibold text-amber-800 max-w-[16rem]">À vérifier : {{ lot.aConfirmer }}</span>
                  </td>
                  <td class="py-3 px-3 text-gris">{{ lot.fournisseur }}</td>
                  <td class="py-3 px-3 text-center whitespace-nowrap">
                    <span v-if="estACompter(lot)" class="px-2 py-0.5 rounded bg-amber-50 text-amber-800 font-bold">à compter</span>
                    <template v-else>
                      <span :class="[lot.quantiteRestante === 0 ? 'bg-red-50 text-red-800' : 'bg-gray-100 text-noir', 'px-2 py-0.5 rounded font-mono font-bold']">{{ lot.quantiteRestante }}</span>
                      <span class="text-gris font-mono text-[10px]"> / {{ lot.quantiteInitiale }} {{ uniteLot(lot) }}</span>
                    </template>
                  </td>
                  <td class="py-3 px-3 text-right font-mono text-gris whitespace-nowrap">{{ formatPrix(lot.prixAchatUnitaire) }}</td>
                  <td class="py-3 px-3">
                    <div class="flex items-center justify-center gap-1">
                      <button @click="ouvrir('detail', lot)" class="cursor-pointer p-1.5 text-gris hover:text-noir hover:bg-gray-100 rounded-lg" title="Fiche du lot" aria-label="Fiche du lot"><Eye class="w-3.5 h-3.5" /></button>
                      <template v-if="ecriture">
                        <button v-if="estACompter(lot)" @click="ouvrirComptage(lot)" class="cursor-pointer p-1.5 text-amber-700 hover:bg-amber-50 rounded-lg" title="Compter le lot" aria-label="Compter le lot"><Scale class="w-3.5 h-3.5" /></button>
                        <button v-else @click="ouvrirCorrection(lot)" class="cursor-pointer p-1.5 text-gris hover:text-savane hover:bg-amber-50 rounded-lg" title="Corriger la quantité" aria-label="Corriger la quantité"><SlidersHorizontal class="w-3.5 h-3.5" /></button>
                        <button @click="openEditMode(lot)" class="cursor-pointer p-1.5 text-gris hover:text-savane hover:bg-amber-50 rounded-lg" title="Modifier le lot" aria-label="Modifier le lot"><Edit2 class="w-3.5 h-3.5" /></button>
                        <button @click="deleteLot(lot)" class="cursor-pointer p-1.5 text-gris hover:text-red-600 hover:bg-red-50 rounded-lg" title="Supprimer de l'inventaire" aria-label="Supprimer de l'inventaire"><Trash2 class="w-3.5 h-3.5" /></button>
                      </template>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="flex items-center justify-between pt-4 border-t border-gray-100 text-xs font-semibold text-gris">
            <button :disabled="page === 1 || isPlaceholderData" @click="page--" class="px-4 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">← Précédent</button>
            <span class="bg-gray-100 px-3 py-1.5 rounded-lg text-noir">Page {{ page }}</span>
            <button :disabled="!data?.hasMore || isPlaceholderData" @click="page++" class="px-4 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">Suivant →</button>
          </div>
        </div>
      </div>

      <!-- VOLET LATÉRAL (au-dessus du tableau sur téléphone) -->
      <div v-if="volet" class="order-first lg:order-none bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4 animate-fadeIn lg:sticky lg:top-6">
        <div class="flex items-center justify-between border-b pb-2.5">
          <h3 class="font-bold text-noir text-sm">{{ titreVolet }}<span v-if="selectedLot && volet !== 'formulaire'" class="block font-mono text-[11px] text-gris">{{ selectedLot.numeroLot }} · {{ nomProduit(selectedLot) }}</span></h3>
          <button @click="closePanels" class="cursor-pointer p-1 bg-gray-50 hover:bg-gray-100 rounded-lg text-gris" aria-label="Fermer"><X class="w-3.5 h-3.5" /></button>
        </div>

        <!-- ENTRÉE / MODIFICATION -->
        <form v-if="volet === 'formulaire'" @submit.prevent="handleSubmit" class="space-y-4">
          <div>
            <label :class="etiquette" for="stock-produit">Produit reçu</label>
            <select id="stock-produit" v-model="form.productId" :class="champ" :disabled="isEditing" required>
              <option value="" disabled>-- Sélectionner l'article --</option>
              <option v-for="prod in listeProduits" :key="prod._id" :value="prod._id">{{ libelleProduit(prod) }}</option>
            </select>
          </div>

          <div>
            <label :class="etiquette" for="stock-numero">Numéro de lot</label>
            <input id="stock-numero" v-model="form.numeroLot" type="text" :placeholder="isEditing ? '' : 'Vide : généré (LOT-référence-date-NN)'" :class="[champ, 'font-mono']" :required="isEditing" />
          </div>

          <div v-if="!isEditing" class="flex gap-2" role="radiogroup" aria-label="Quantité">
            <button type="button" @click="form.aCompter = false" :class="[!form.aCompter ? 'bg-foret text-white border-foret' : 'bg-white text-noir border-gray-200', 'cursor-pointer flex-1 py-2 rounded-lg border font-bold']">Quantité connue</button>
            <button type="button" @click="form.aCompter = true" :class="[form.aCompter ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-noir border-gray-200', 'cursor-pointer flex-1 py-2 rounded-lg border font-bold']">À compter</button>
          </div>

          <div v-if="!form.aCompter" class="grid grid-cols-2 gap-3">
            <div>
              <label :class="etiquette" for="stock-quantite">Quantité reçue</label>
              <input id="stock-quantite" v-model.number="form.quantiteRecue" type="number" min="0" step="any" :disabled="isEditing" :class="[champ, 'font-mono disabled:opacity-60']" :required="!isEditing" />
            </div>
            <div>
              <label :class="etiquette" for="stock-prix">Prix d'achat (u.)</label>
              <input id="stock-prix" v-model.number="form.prixAchatUnitaire" type="number" min="0" step="any" placeholder="FCFA" :class="[champ, 'font-mono']" />
            </div>
            <p v-if="isEditing" class="col-span-2 text-[10px] text-gris">La quantité se change par « Corriger », avec un motif.</p>
          </div>

          <div v-if="!isEditing" class="grid grid-cols-2 gap-3">
            <div>
              <label :class="etiquette" for="stock-valeur">Valeur facturée</label>
              <input id="stock-valeur" v-model.number="form.valeurFcfa" type="number" min="0" placeholder="FCFA" :class="[champ, 'font-mono']" :required="form.aCompter" />
            </div>
            <div>
              <label :class="etiquette" for="stock-piece">N° de pièce</label>
              <input id="stock-piece" v-model="form.numeroPiece" type="text" placeholder="Facture ou reçu" :class="[champ, 'font-mono']" />
            </div>
          </div>
          <div v-else>
            <label :class="etiquette" for="stock-piece-modif">N° de pièce</label>
            <input id="stock-piece-modif" v-model="form.numeroPiece" type="text" :class="[champ, 'font-mono']" />
          </div>

          <div>
            <label :class="etiquette" for="stock-a-confirmer">{{ form.aCompter ? 'Ce qu\'il faut compter' : 'À vérifier (facultatif)' }}</label>
            <input id="stock-a-confirmer" v-model="form.aConfirmer" type="text" :placeholder="form.aCompter ? 'Ex : nombre de litres (compter les bidons)' : 'Vide : lot confirmé'" :class="champ" :required="form.aCompter && !isEditing" />
          </div>

          <div>
            <label :class="etiquette" for="stock-fournisseur">Fournisseur</label>
            <select v-if="!isEditing || selectedLot?.fournisseurId !== null" id="stock-fournisseur" v-model="form.fournisseurId" :class="champ" required>
              <option value="" disabled>-- Choisir le fournisseur --</option>
              <option v-for="f in fournisseurs" :key="f._id" :value="f._id">{{ f.nom }}</option>
            </select>
            <p v-else class="text-noir font-bold">{{ selectedLot?.fournisseur }}</p>
            <p v-if="!fournisseurs.length" class="mt-1 text-[10px] text-gris">Aucun fournisseur actif : ajoutez-en un dans « Prestataires ».</p>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label :class="etiquette" for="stock-date">Date de réception</label>
              <input id="stock-date" v-model="form.dateReception" type="date" :class="champ" :required="!isEditing" />
            </div>
            <div>
              <label :class="etiquette" for="stock-lot-fournisseur">Lot du fournisseur</label>
              <input id="stock-lot-fournisseur" v-model="form.lotFournisseur" type="text" placeholder="Sur le carton" :class="[champ, 'font-mono']" />
            </div>
          </div>

          <div>
            <label :class="etiquette" for="stock-conditionnement">Conditionnement</label>
            <input id="stock-conditionnement" v-model="form.conditionnement" type="text" placeholder="Ex : 2 cartons de 20 paquets de 500 g" :class="champ" />
          </div>
          <div>
            <label :class="etiquette" for="stock-commentaire">Commentaire</label>
            <textarea id="stock-commentaire" v-model="form.commentaire" rows="2" :class="champ"></textarea>
          </div>

          <label v-if="!isEditing" class="flex items-start gap-2 text-[11px] cursor-pointer">
            <input v-model="form.creerDepense" type="checkbox" class="mt-0.5 accent-foret" />
            <span>Créer la dépense d'achat si aucune dépense ne porte ce n° de pièce (sinon le lot s'y rattache, sans seconde dépense).</span>
          </label>
          <div v-if="!isEditing && form.creerDepense">
            <label :class="etiquette" for="stock-ligne">Ligne budgétaire (achat financé par la subvention)</label>
            <input id="stock-ligne" v-model="form.ligneBudgetaire" type="text" placeholder="Ex : L5 ; vide : dépense d'exploitation" :class="[champ, 'font-mono']" />
          </div>

          <button type="submit" :disabled="isSubmitting" class="cursor-pointer w-full py-2.5 bg-foret text-white text-xs font-bold rounded-xl hover:bg-opacity-95 shadow-sm disabled:opacity-50">
            {{ isSubmitting ? 'Enregistrement…' : (isEditing ? 'Enregistrer les modifications' : 'Valider l\'entrée de stock') }}
          </button>
        </form>

        <!-- COMPTAGE D'UN LOT À COMPTER -->
        <form v-if="volet === 'comptage' && selectedLot" @submit.prevent="envoyerComptage" class="space-y-4">
          <p class="p-2 rounded-lg bg-amber-50 text-amber-900 text-[11px]">{{ selectedLot.aConfirmer || 'Quantité à compter' }}<span v-if="selectedLot.conditionnement"> · {{ selectedLot.conditionnement }}</span></p>
          <div>
            <label :class="etiquette" for="comptage-quantite">Quantité comptée ({{ uniteLot(selectedLot) }})</label>
            <input id="comptage-quantite" v-model.number="comptage.quantite" type="number" min="0" step="any" :class="[champ, 'font-mono']" required />
          </div>
          <p v-if="selectedLot.valeurFcfa !== null && comptage.quantite" class="text-[11px] text-gris">Prix d'achat déduit : {{ formatPrix(Math.round(selectedLot.valeurFcfa / comptage.quantite * 100) / 100) }} / {{ uniteLot(selectedLot) }}</p>
          <div>
            <label :class="etiquette" for="comptage-commentaire">Commentaire</label>
            <input id="comptage-commentaire" v-model="comptage.commentaire" type="text" :class="champ" />
          </div>
          <button type="submit" :disabled="isSubmitting" class="cursor-pointer w-full py-2.5 bg-foret text-white text-xs font-bold rounded-xl disabled:opacity-50">Enregistrer le comptage</button>
        </form>

        <!-- CORRECTION MOTIVÉE -->
        <form v-if="volet === 'correction' && selectedLot" @submit.prevent="envoyerCorrection" class="space-y-4">
          <p class="text-[11px]">Reste actuel : <strong class="font-mono text-noir">{{ selectedLot.quantiteRestante }} {{ uniteLot(selectedLot) }}</strong></p>
          <div>
            <label :class="etiquette" for="correction-raison">Motif</label>
            <select id="correction-raison" v-model="correction.raison" :class="champ">
              <option>Perte</option>
              <option>Péremption</option>
              <option>Erreur de saisie</option>
            </select>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label :class="etiquette" for="correction-sens">Sens</label>
              <select id="correction-sens" v-model="correction.sens" :disabled="correction.raison !== 'Erreur de saisie'" :class="[champ, 'disabled:opacity-60']">
                <option value="negative">Retirer</option>
                <option value="positive">Ajouter</option>
              </select>
            </div>
            <div>
              <label :class="etiquette" for="correction-quantite">Quantité</label>
              <input id="correction-quantite" v-model.number="correction.quantite" type="number" min="0" step="any" :class="[champ, 'font-mono']" required />
            </div>
          </div>
          <div>
            <label :class="etiquette" for="correction-commentaire">Précision</label>
            <input id="correction-commentaire" v-model="correction.commentaire" type="text" :class="champ" />
          </div>
          <button type="submit" :disabled="isSubmitting" class="cursor-pointer w-full py-2.5 bg-foret text-white text-xs font-bold rounded-xl disabled:opacity-50">Enregistrer la correction</button>
        </form>

        <!-- ESSAI -->
        <form v-if="volet === 'essai'" @submit.prevent="envoyerEssai" class="space-y-4">
          <div>
            <label :class="etiquette" for="essai-produit">Produit</label>
            <select id="essai-produit" v-model="essai.productId" :class="champ" required>
              <option value="" disabled>-- Choisir --</option>
              <option v-for="prod in listeProduits" :key="prod._id" :value="prod._id">{{ libelleProduit(prod) }}</option>
            </select>
          </div>
          <div>
            <label :class="etiquette" for="essai-quantite">Quantité utilisée</label>
            <input id="essai-quantite" v-model.number="essai.quantite" type="number" min="0" step="any" :class="[champ, 'font-mono']" required />
          </div>
          <div>
            <label :class="etiquette" for="essai-objet">Objet de l'essai</label>
            <input id="essai-objet" v-model="essai.commentaire" type="text" placeholder="Ex : essai du moulin" :class="champ" required />
          </div>
          <button type="submit" :disabled="isSubmitting" class="cursor-pointer w-full py-2.5 bg-foret text-white text-xs font-bold rounded-xl disabled:opacity-50">Enregistrer l'essai</button>
        </form>

        <!-- TRANSFORMATION -->
        <form v-if="volet === 'transformation'" @submit.prevent="envoyerTransformation" class="space-y-4">
          <p class="text-[11px] text-gris">La matière sort du stock (FIFO) ; le produit obtenu entre dans un lot « Production interne », valorisé au coût de la matière.</p>
          <div class="grid grid-cols-[1fr_6rem] gap-3">
            <div>
              <label :class="etiquette" for="transfo-matiere">Matière</label>
              <select id="transfo-matiere" v-model="transformation.matiereId" :class="champ" required>
                <option value="" disabled>-- Choisir --</option>
                <option v-for="prod in listeProduits" :key="prod._id" :value="prod._id">{{ libelleProduit(prod) }}</option>
              </select>
            </div>
            <div>
              <label :class="etiquette" for="transfo-qm">Quantité</label>
              <input id="transfo-qm" v-model.number="transformation.quantiteMatiere" type="number" min="0" step="any" :class="[champ, 'font-mono']" required />
            </div>
          </div>
          <div class="grid grid-cols-[1fr_6rem] gap-3">
            <div>
              <label :class="etiquette" for="transfo-produit">Produit obtenu</label>
              <select id="transfo-produit" v-model="transformation.produitId" :class="champ" required>
                <option value="" disabled>-- Choisir --</option>
                <option v-for="prod in listeProduits" :key="prod._id" :value="prod._id">{{ libelleProduit(prod) }}</option>
              </select>
            </div>
            <div>
              <label :class="etiquette" for="transfo-qo">Quantité</label>
              <input id="transfo-qo" v-model.number="transformation.quantiteObtenue" type="number" min="0" step="any" :class="[champ, 'font-mono']" required />
            </div>
          </div>
          <p v-if="transformation.quantiteMatiere && transformation.quantiteObtenue" class="text-[11px] text-noir">Rendement : <strong>{{ Math.round(transformation.quantiteObtenue / transformation.quantiteMatiere * 100) }} %</strong></p>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label :class="etiquette" for="transfo-date">Date</label>
              <input id="transfo-date" v-model="transformation.date" type="date" :class="champ" required />
            </div>
            <div>
              <label :class="etiquette" for="transfo-lot">N° de lot</label>
              <input id="transfo-lot" v-model="transformation.numeroLot" type="text" placeholder="Vide : généré" :class="[champ, 'font-mono']" />
            </div>
          </div>
          <div>
            <label :class="etiquette" for="transfo-commentaire">Commentaire</label>
            <input id="transfo-commentaire" v-model="transformation.commentaire" type="text" placeholder="Ex : mouture au moulin de…" :class="champ" />
          </div>
          <button type="submit" :disabled="isSubmitting" class="cursor-pointer w-full py-2.5 bg-foret text-white text-xs font-bold rounded-xl disabled:opacity-50">Enregistrer la transformation</button>
        </form>

        <!-- FICHE DU LOT -->
        <dl v-if="volet === 'detail' && selectedLot" class="grid grid-cols-2 gap-x-3 gap-y-3 text-xs">
          <div class="col-span-2"><dt class="text-[10px] uppercase font-bold text-gris">Produit</dt><dd class="text-noir font-bold text-sm">{{ nomProduit(selectedLot) }}</dd></div>
          <div><dt class="text-[10px] uppercase font-bold text-gris">Quantité initiale</dt><dd class="font-mono font-bold text-noir">{{ selectedLot.quantiteInitiale ?? 'à compter' }} {{ uniteLot(selectedLot) }}</dd></div>
          <div><dt class="text-[10px] uppercase font-bold text-gris">Reste</dt><dd class="font-mono font-bold" :class="selectedLot.quantiteRestante === 0 ? 'text-red-600' : 'text-foret'">{{ selectedLot.quantiteRestante ?? '—' }}</dd></div>
          <div><dt class="text-[10px] uppercase font-bold text-gris">Prix d'achat</dt><dd class="font-mono">{{ formatPrix(selectedLot.prixAchatUnitaire) }}</dd></div>
          <div><dt class="text-[10px] uppercase font-bold text-gris">Valeur facturée</dt><dd class="font-mono">{{ formatPrix(selectedLot.valeurFcfa) }}</dd></div>
          <div class="col-span-2"><dt class="text-[10px] uppercase font-bold text-gris">Fournisseur</dt><dd class="text-noir font-bold">{{ selectedLot.fournisseur }}</dd></div>
          <div><dt class="text-[10px] uppercase font-bold text-gris">Réception</dt><dd class="font-mono">{{ formatDate(selectedLot.dateReception) }}</dd></div>
          <div><dt class="text-[10px] uppercase font-bold text-gris">Lot fournisseur</dt><dd class="font-mono">{{ selectedLot.lotFournisseur || '—' }}</dd></div>
          <div class="col-span-2"><dt class="text-[10px] uppercase font-bold text-gris">Pièce</dt><dd class="font-mono">{{ selectedLot.numeroPiece || '—' }}<span v-if="selectedLot.numeroPiece" class="font-body text-[10px] ml-1" :class="selectedLot.depenseId ? 'text-savane' : 'text-amber-800'">{{ selectedLot.depenseId ? '· dépense rattachée' : '· aucune dépense rattachée' }}</span></dd></div>
          <div v-if="selectedLot.conditionnement" class="col-span-2"><dt class="text-[10px] uppercase font-bold text-gris">Conditionnement</dt><dd>{{ selectedLot.conditionnement }}</dd></div>
          <div v-if="selectedLot.aConfirmer" class="col-span-2"><dt class="text-[10px] uppercase font-bold text-amber-800">À vérifier</dt><dd class="text-amber-900">{{ selectedLot.aConfirmer }}</dd></div>
          <div v-if="selectedLot.commentaire" class="col-span-2"><dt class="text-[10px] uppercase font-bold text-gris">Commentaire</dt><dd>{{ selectedLot.commentaire }}</dd></div>
        </dl>
      </div>

    </div>
  </div>
</template>
