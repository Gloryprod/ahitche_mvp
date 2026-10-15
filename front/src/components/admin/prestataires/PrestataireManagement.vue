<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Search, Plus, Edit2, Trash2, X, Phone, MessageCircle } from 'lucide-vue-next'
import api from '@/stores/api'
import { messageErreur } from '@/services/erreurs'
import type { Prestataire, TypePrestataire } from '@/type'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/vue-query'
import { useAuthStore } from '@/stores/auth'
import { peutEcrire } from '@/config/roles'
import Swal from 'sweetalert2'

const TYPES: TypePrestataire[] = ['Fournisseur', 'Livreur', 'Autre']
const MODES_PAIEMENT = ['Mobile Money', 'Espèces', 'Virement', 'Chèque']

const authStore = useAuthStore()
const ecriture = computed(() => peutEcrire(authStore.role.value, 'prestataires'))

// --- ÉTATS ---
const page = ref(1)
const search = ref('')
const debouncedSearch = ref('')
const typeActif = ref<TypePrestataire | ''>('')
const isSubmitting = ref(false)
const notification = ref({ text: '', type: '' })
const queryClient = useQueryClient()

const showFormPanel = ref(false)
const isEditing = ref(false)

const ficheVide = () => ({
  _id: '',
  nom: '',
  type: 'Fournisseur' as TypePrestataire,
  telephone: '',
  quartier: '',
  ifuRccm: '',
  modePaiement: 'Mobile Money',
  notes: '',
  actif: true
})
const form = ref(ficheVide())

interface PaginatedPrestatairesResponse {
  prestataires: Prestataire[]
  hasMore: boolean
  total: number
}

let timeoutId: ReturnType<typeof setTimeout>
watch(search, (newValue) => {
  clearTimeout(timeoutId)
  timeoutId = setTimeout(() => {
    debouncedSearch.value = newValue
    page.value = 1
  }, 400)
})
watch(typeActif, () => { page.value = 1 })

// --- CHARGEMENT ---
const { data, isLoading, isError, error, isPlaceholderData } = useQuery({
  queryKey: ['prestataires', page, debouncedSearch, typeActif],
  queryFn: async ({ queryKey }): Promise<PaginatedPrestatairesResponse> => {
    const [, currentPage, currentSearch, currentType] = queryKey
    const response = await api.get('/api/admin/prestataires', {
      params: { page: currentPage, search: currentSearch, type: currentType || undefined, limit: 10 }
    })
    return response.data
  },
  placeholderData: keepPreviousData,
})

// --- ACTIONS ---
const openCreateMode = () => {
  isEditing.value = false
  form.value = ficheVide()
  if (typeActif.value) form.value.type = typeActif.value
  showFormPanel.value = true
}

const openEditMode = (prestataire: Prestataire) => {
  isEditing.value = true
  form.value = { ...ficheVide(), ...prestataire }
  showFormPanel.value = true
}

const closePanel = () => {
  showFormPanel.value = false
}

const handleSubmit = async () => {
  isSubmitting.value = true
  const { _id, ...fiche } = form.value
  try {
    if (isEditing.value) {
      await api.put(`/api/admin/prestataires/${_id}`, fiche)
      showNotification('Prestataire modifié.', 'success')
    } else {
      await api.post('/api/admin/prestataires', fiche)
      showNotification('Prestataire ajouté.', 'success')
    }
    queryClient.invalidateQueries({ queryKey: ['prestataires'] })
    closePanel()
  } catch (err) {
    showNotification(messageErreur(err, 'Une erreur est survenue'), 'error')
  } finally {
    isSubmitting.value = false
  }
}

const supprimerPrestataire = async (prestataire: Prestataire) => {
  const result = await Swal.fire({
    title: `Supprimer ${prestataire.nom} ?`,
    text: "Les lots, bons de commande et dépenses déjà enregistrés gardent son nom.",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#1A5C38',
    cancelButtonColor: '#d33',
    confirmButtonText: 'Oui, supprimer',
    cancelButtonText: 'Annuler',
    customClass: { popup: 'rounded-2xl font-body' }
  })
  if (!result.isConfirmed) return

  try {
    await api.delete(`/api/admin/prestataires/${prestataire._id}`)
    showNotification('Prestataire supprimé.', 'success')
    queryClient.invalidateQueries({ queryKey: ['prestataires'] })
  } catch (err) {
    showNotification(messageErreur(err, 'Suppression impossible'), 'error')
  }
}

// --- UTILS ---
const lienWhatsApp = (telephone: string) => `https://wa.me/${telephone.replace(/\D/g, '')}`

const classeType: Record<TypePrestataire, string> = {
  Fournisseur: 'bg-foret/10 text-foret',
  Livreur: 'bg-or/20 text-noir',
  Autre: 'bg-creme2 text-gris'
}

const showNotification = (text: string, type: string) => {
  notification.value = { text, type }
  setTimeout(() => notification.value = { text: '', type: '' }, 4000)
}
</script>

<template>
  <div class="space-y-6 animate-fadeIn text-xs font-medium text-gris">

    <div class="bg-white p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="font-display font-bold text-xl text-noir flex items-center gap-2">
          Prestataires
          <span class="px-2.5 py-0.5 bg-foret/10 text-foret rounded-full font-bold text-[11px] font-body">{{ data?.total ?? 0 }}</span>
        </h1>
        <p class="text-[11px] text-gris mt-0.5">Fournisseurs, livreurs et autres partenaires d'Ahitché</p>
      </div>
      <div class="flex items-center gap-3 w-full sm:w-auto">
        <div class="relative w-full sm:w-60">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gris-lt stroke-[2.5]" />
          <input v-model="search" type="search" aria-label="Rechercher un prestataire" placeholder="Nom, téléphone, quartier..." class="w-full pl-9 pr-4 py-2 bg-creme border border-creme2 rounded-xl text-xs text-noir focus:outline-none focus:border-foret focus:bg-white transition-all" />
        </div>
        <button v-if="ecriture" @click="openCreateMode" class="cursor-pointer flex items-center gap-1.5 px-4 py-2 bg-foret text-white text-xs font-bold rounded-xl hover:bg-savane transition-all shadow-sm shrink-0">
          <Plus class="w-3.5 h-3.5 stroke-3" />
          Ajouter
        </button>
      </div>
    </div>

    <div v-if="notification.text" role="status" :class="[notification.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200', 'p-4 rounded-xl border text-xs font-semibold fixed top-4 right-4 left-4 sm:left-auto z-50 max-w-sm']">
      {{ notification.text }}
    </div>

    <!-- Filtre par type -->
    <div class="flex gap-2 overflow-x-auto pb-1">
      <button
        v-for="t in ['', ...TYPES]"
        :key="t || 'tous'"
        @click="typeActif = t as TypePrestataire | ''"
        :class="['cursor-pointer px-3.5 py-2 rounded-full text-xs font-bold whitespace-nowrap border transition-colors', typeActif === t ? 'bg-foret text-white border-foret' : 'bg-white text-gris border-creme2 hover:border-foret/40']"
      >
        {{ t ? `${t}s` : 'Tous' }}
      </button>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

      <div :class="[showFormPanel ? 'lg:col-span-2' : 'lg:col-span-3', 'space-y-3']" :style="{ opacity: isPlaceholderData ? 0.6 : 1 }">
        <div v-if="isLoading" class="bg-white rounded-2xl p-8 text-center text-sm">Chargement des prestataires...</div>
        <div v-else-if="isError" class="p-4 bg-red-50 text-red-700 text-sm rounded-xl border border-red-100">
          Erreur : {{ (error as any)?.response?.data?.message || error?.message }}
        </div>
        <div v-else-if="!data?.prestataires.length" class="bg-white rounded-2xl p-8 text-center text-sm border border-dashed border-creme2">
          Aucun prestataire pour ce filtre.
        </div>

        <!-- Cartes : lisibles sur téléphone comme sur ordinateur -->
        <article
          v-for="p in data?.prestataires"
          :key="p._id"
          :class="['bg-white rounded-2xl p-4 border border-creme2 flex flex-col sm:flex-row sm:items-center gap-3 justify-between', !p.actif ? 'opacity-60' : '']"
        >
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h2 class="font-bold text-sm text-noir">{{ p.nom }}</h2>
              <span :class="[classeType[p.type], 'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider']">{{ p.type }}</span>
              <span v-if="!p.actif" class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gris">Inactif</span>
            </div>
            <p class="mt-1 text-[11px] text-gris">
              <span v-if="p.quartier">📍 {{ p.quartier }} · </span>
              Paiement : {{ p.modePaiement }}<span v-if="p.ifuRccm"> · IFU/RCCM {{ p.ifuRccm }}</span>
            </p>
            <p v-if="p.notes" class="mt-1 text-[11px] text-gris italic">{{ p.notes }}</p>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <a v-if="p.telephone" :href="`tel:${p.telephone}`" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-creme2 text-noir font-semibold hover:border-foret" :aria-label="`Appeler ${p.nom}`">
              <Phone class="w-3.5 h-3.5" /> {{ p.telephone }}
            </a>
            <a v-if="p.telephone" :href="lienWhatsApp(p.telephone)" target="_blank" rel="noopener" class="p-2 rounded-xl text-savane hover:bg-savane/10" :aria-label="`Écrire à ${p.nom} sur WhatsApp`">
              <MessageCircle class="w-4 h-4" />
            </a>
            <template v-if="ecriture">
              <button @click="openEditMode(p)" class="cursor-pointer p-2 rounded-xl text-gris hover:text-savane hover:bg-creme" :aria-label="`Modifier ${p.nom}`">
                <Edit2 class="w-3.5 h-3.5" />
              </button>
              <button @click="supprimerPrestataire(p)" class="cursor-pointer p-2 rounded-xl text-gris hover:text-red-600 hover:bg-red-50" :aria-label="`Supprimer ${p.nom}`">
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </template>
          </div>
        </article>

        <div v-if="data && (page > 1 || data.hasMore)" class="flex items-center justify-between pt-2 text-xs font-semibold">
          <button :disabled="page === 1 || isPlaceholderData" @click="page--" class="px-4 py-2 bg-white border border-creme2 rounded-xl disabled:opacity-50">← Précédent</button>
          <span class="bg-white px-3 py-1.5 rounded-lg text-noir">Page {{ page }}</span>
          <button :disabled="!data.hasMore || isPlaceholderData" @click="page++" class="px-4 py-2 bg-white border border-creme2 rounded-xl disabled:opacity-50">Suivant →</button>
        </div>
      </div>

      <!-- Formulaire -->
      <div v-if="showFormPanel" class="bg-white p-5 rounded-2xl border border-creme2 shadow-sm space-y-4 animate-fadeIn lg:sticky lg:top-6">
        <div class="flex items-center justify-between border-b border-creme2 pb-2.5">
          <h2 class="font-bold text-noir text-sm">{{ isEditing ? 'Modifier le prestataire' : 'Nouveau prestataire' }}</h2>
          <button @click="closePanel" class="p-1 bg-creme hover:bg-creme2 rounded-lg" aria-label="Fermer le formulaire">
            <X class="w-3.5 h-3.5" />
          </button>
        </div>

        <form @submit.prevent="handleSubmit" class="space-y-3">
          <div>
            <label for="presta-nom" class="block mb-1 font-bold text-noir text-[10px] uppercase">Nom</label>
            <input id="presta-nom" v-model="form.nom" type="text" required class="w-full px-3 py-2 bg-creme border border-creme2 rounded-lg focus:outline-none focus:border-foret text-noir" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label for="presta-type" class="block mb-1 font-bold text-noir text-[10px] uppercase">Type</label>
              <select id="presta-type" v-model="form.type" class="w-full px-3 py-2 bg-creme border border-creme2 rounded-lg focus:outline-none focus:border-foret text-noir">
                <option v-for="t in TYPES" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>
            <div>
              <label for="presta-paiement" class="block mb-1 font-bold text-noir text-[10px] uppercase">Paiement</label>
              <select id="presta-paiement" v-model="form.modePaiement" class="w-full px-3 py-2 bg-creme border border-creme2 rounded-lg focus:outline-none focus:border-foret text-noir">
                <option v-for="m in MODES_PAIEMENT" :key="m" :value="m">{{ m }}</option>
              </select>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label for="presta-tel" class="block mb-1 font-bold text-noir text-[10px] uppercase">Téléphone / WhatsApp</label>
              <input id="presta-tel" v-model="form.telephone" type="tel" placeholder="+229 01 97 00 00 00" class="w-full px-3 py-2 bg-creme border border-creme2 rounded-lg focus:outline-none focus:border-foret text-noir" />
            </div>
            <div>
              <label for="presta-quartier" class="block mb-1 font-bold text-noir text-[10px] uppercase">Quartier</label>
              <input id="presta-quartier" v-model="form.quartier" type="text" placeholder="Ex : Dantokpa" class="w-full px-3 py-2 bg-creme border border-creme2 rounded-lg focus:outline-none focus:border-foret text-noir" />
            </div>
          </div>
          <div>
            <label for="presta-ifu" class="block mb-1 font-bold text-noir text-[10px] uppercase">IFU / RCCM (facultatif)</label>
            <input id="presta-ifu" v-model="form.ifuRccm" type="text" class="w-full px-3 py-2 bg-creme border border-creme2 rounded-lg focus:outline-none focus:border-foret text-noir" />
          </div>
          <div>
            <label for="presta-notes" class="block mb-1 font-bold text-noir text-[10px] uppercase">Notes</label>
            <textarea id="presta-notes" v-model="form.notes" rows="2" class="w-full px-3 py-2 bg-creme border border-creme2 rounded-lg focus:outline-none focus:border-foret text-noir resize-none"></textarea>
          </div>
          <label class="flex items-center gap-2 text-noir font-semibold cursor-pointer">
            <input v-model="form.actif" type="checkbox" class="accent-foret w-4 h-4" />
            Actif (proposé dans les listes)
          </label>
          <button type="submit" :disabled="isSubmitting" class="cursor-pointer w-full py-2.5 bg-foret text-white text-xs font-bold rounded-xl hover:bg-savane transition-all disabled:opacity-50">
            {{ isSubmitting ? 'Enregistrement...' : (isEditing ? 'Enregistrer les modifications' : 'Ajouter le prestataire') }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
