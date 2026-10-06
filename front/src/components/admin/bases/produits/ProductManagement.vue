<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { Search, Plus, Edit2, Trash2, X, Wand2 } from 'lucide-vue-next'
import api from '@/stores/api'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/vue-query'
import Swal from 'sweetalert2'
import type { Product, CompositionRule, Category, PackType } from '@/type'

// Catalogue du référentiel packs v4 : produits fixes (base des packs) et produits variables (extras).
// Les quantités par pack font foi (D-14) ; la règle sert seulement à proposer les quantités d'un nouveau produit.
// Une valeur vide reste vide et s'affiche « à renseigner ».
const PACKS: { cle: PackType; libelle: string }[] = [
  { cle: 'essentiel', libelle: 'Essentiel' },
  { cle: 'equilibre', libelle: 'Équilibré' },
  { cle: 'confort', libelle: 'Confort' },
  { cle: 'reserve', libelle: 'Réserve' },
  { cle: 'fraicheur', libelle: 'Fraîcheur' },
]

const page = ref(1)
const search = ref('')
const debouncedSearch = ref('')
const filtreType = ref<'' | 'base fixe' | 'extra'>('')
const isSubmitting = ref(false)
const notification = ref({ text: '', type: '' })
const queryClient = useQueryClient()
const showFormPanel = ref(false)
const isEditing = ref(false)

const categoriesList = ref<Category[]>([])
const rulesList = ref<CompositionRule[]>([])

type Quantites = Record<PackType, number | null>
const quantitesVides = (): Quantites => ({ essentiel: null, equilibre: null, confort: null, reserve: null, fraicheur: null })
const formVide = () => ({
  _id: '', reference: '', name: '', category: '', compositionRule: '', type: 'base fixe' as Product['type'],
  statut: 'disponible' as Product['statut'], unit: 'kg', priceUnit: null as number | null, seuilAlerte: null as number | null,
  commentaire: '', quantites: quantitesVides(),
})
const form = ref(formVide())

onMounted(async () => {
  try {
    const [catRes, ruleRes] = await Promise.all([
      api.get('/api/admin/categories?limit=100'),
      api.get('/api/admin/composition-rules?limit=100')
    ])
    categoriesList.value = catRes.data.categories || []
    rulesList.value = ruleRes.data.rules || []
  } catch {
    showNotification('Erreur lors du chargement des catégories et des règles', 'error')
  }
})

let timeoutId: ReturnType<typeof setTimeout>
watch(search, (valeur) => {
  clearTimeout(timeoutId)
  timeoutId = setTimeout(() => { debouncedSearch.value = valeur; page.value = 1 }, 400)
})
watch(filtreType, () => { page.value = 1 })

const { data, isLoading, isError, error, isPlaceholderData } = useQuery({
  queryKey: ['products', page, debouncedSearch, filtreType],
  queryFn: async () => (await api.get('/api/admin/products', {
    params: { page: page.value, search: debouncedSearch.value, type: filtreType.value || undefined, limit: 20 }
  })).data,
  placeholderData: keepPreviousData,
})

const aRenseigner = 'à renseigner'
const prix = (n: number | null) => n === null || n === undefined ? aRenseigner : `${n.toLocaleString('fr-FR')} F`
const quantite = (n: number | null | undefined) => n === null || n === undefined ? '—' : n.toLocaleString('fr-FR')

function openCreateMode() {
  isEditing.value = false
  form.value = formVide()
  showFormPanel.value = true
}

function openEditMode(p: Product) {
  isEditing.value = true
  form.value = {
    _id: p._id, reference: p.reference || '', name: p.name, category: p.category?._id || '',
    compositionRule: p.compositionRule?._id || '', type: p.type, statut: p.statut, unit: p.unit,
    priceUnit: p.priceUnit, seuilAlerte: p.seuilAlerte, commentaire: p.commentaire || '',
    quantites: { ...quantitesVides(), ...(p.quantites || {}) },
  }
  showFormPanel.value = true
}

// Proposition à partir de la règle (nouveau produit) : Équilibré et Confort = Essentiel × multiplicateurs
const regleChoisie = computed(() => rulesList.value.find(r => r._id === form.value.compositionRule))
function proposerQuantites() {
  const base = form.value.quantites.essentiel
  const regle = regleChoisie.value
  if (!regle || base === null) return
  // Une règle sans multiplicateur ne propose rien pour ce pack
  if (regle.multiplierEquilibre !== null) form.value.quantites.equilibre = Math.round(base * regle.multiplierEquilibre * 100) / 100
  if (regle.multiplierConfort !== null) form.value.quantites.confort = Math.round(base * regle.multiplierConfort * 100) / 100
}

// Un champ numérique vidé vaut '' : on l'envoie comme vide (null), jamais comme 0
const versNombre = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number(v))

async function handleSubmit() {
  isSubmitting.value = true
  const charge = {
    ...form.value,
    priceUnit: versNombre(form.value.priceUnit),
    seuilAlerte: versNombre(form.value.seuilAlerte),
    quantites: Object.fromEntries(PACKS.map(p => [p.cle, versNombre(form.value.quantites[p.cle])])),
  }
  try {
    if (isEditing.value) {
      await api.put(`/api/admin/products/${form.value._id}`, charge)
      showNotification('Produit modifié.', 'success')
    } else {
      await api.post('/api/admin/products', charge)
      showNotification('Produit ajouté au catalogue.', 'success')
    }
    queryClient.invalidateQueries({ queryKey: ['products'] })
    showFormPanel.value = false
  } catch (err: any) {
    showNotification(err.response?.data?.message || 'Une erreur est survenue', 'error')
  } finally {
    isSubmitting.value = false
  }
}

async function deleteProduct(p: Product) {
  const result = await Swal.fire({
    title: `Supprimer « ${p.name} » ?`,
    text: 'Il ne sera plus utilisé dans les compositions de packs.',
    icon: 'warning', showCancelButton: true, confirmButtonColor: '#1A5C38',
    confirmButtonText: 'Supprimer', cancelButtonText: 'Annuler',
    customClass: { popup: 'rounded-2xl font-body' }
  })
  if (!result.isConfirmed) return
  try {
    await api.delete(`/api/admin/products/${p._id}`)
    showNotification('Produit supprimé.', 'success')
    queryClient.invalidateQueries({ queryKey: ['products'] })
  } catch {
    showNotification('Impossible de supprimer le produit', 'error')
  }
}

function showNotification(text: string, type: string) {
  notification.value = { text, type }
  setTimeout(() => notification.value = { text: '', type: '' }, 4000)
}
</script>

<template>
  <div class="space-y-6 text-xs font-medium text-gris">
    <div class="bg-white p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-creme2">
      <div>
        <h1 class="font-display font-bold text-xl text-noir">Catalogue des produits</h1>
        <p class="text-[11px] text-gris">Référentiel packs v4 · quantités par pack, dans l'unité du produit (« — » = absent du pack)</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <div class="relative w-full sm:w-56">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gris-lt" />
          <input v-model="search" type="search" placeholder="Nom ou référence..." aria-label="Rechercher un produit" class="w-full pl-9 pr-3 py-2 bg-creme border border-creme2 rounded-xl text-xs text-noir focus:outline-none focus:border-foret" />
        </div>
        <select v-model="filtreType" aria-label="Filtrer par type" class="px-3 py-2 rounded-xl border border-creme2 bg-creme text-xs text-noir">
          <option value="">Tous les produits</option>
          <option value="base fixe">Base fixe des packs</option>
          <option value="extra">Extras (variables)</option>
        </select>
        <button @click="openCreateMode" class="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 bg-foret text-white text-xs font-bold rounded-xl">
          <Plus class="w-3.5 h-3.5" /> Ajouter
        </button>
      </div>
    </div>

    <div v-if="notification.text" role="status" :class="[notification.type === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200', 'p-4 rounded-xl border text-xs font-semibold fixed top-4 right-4 z-50 max-w-sm']">
      {{ notification.text }}
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
      <div :class="[showFormPanel ? 'xl:col-span-2' : 'xl:col-span-3', 'bg-white rounded-2xl border border-creme2 overflow-hidden']">
        <div v-if="isLoading" class="p-6 text-center">Chargement du catalogue...</div>
        <div v-else-if="isError" class="p-4 m-4 bg-red-50 text-red-800 rounded-xl border">Erreur : {{ error?.message }}</div>
        <div v-else class="p-4">
          <p class="mb-3 font-semibold">Produits au catalogue : <span class="px-2 py-0.5 bg-foret/10 text-foret rounded-full font-bold">{{ data?.total || 0 }}</span></p>
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse min-w-200">
              <thead>
                <tr class="border-b border-creme2 text-[10px] font-bold uppercase tracking-wider text-gris">
                  <th class="py-2 pr-2">Réf.</th>
                  <th class="py-2 pr-2">Produit</th>
                  <th class="py-2 pr-2 text-right">P.U.</th>
                  <th v-for="p in PACKS" :key="p.cle" class="py-2 px-1 text-right">{{ p.libelle }}</th>
                  <th class="py-2 px-1 text-right">Seuil</th>
                  <th class="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-creme2 text-noir">
                <tr v-for="prod in data?.products" :key="prod._id" :class="prod.statut === 'indisponible' ? 'bg-creme/70' : ''">
                  <td class="py-2.5 pr-2 font-mono font-bold">{{ prod.reference || '—' }}</td>
                  <td class="py-2.5 pr-2">
                    <span class="font-bold">{{ prod.name }}</span>
                    <span class="block text-[10px] text-gris">
                      {{ prod.category?.name || 'Catégorie à renseigner' }} · {{ prod.type === 'extra' ? 'extra' : 'base fixe' }} · {{ prod.unit }}
                      <span v-if="prod.statut === 'indisponible'" class="ml-1 px-1.5 rounded bg-red-50 text-red-800 font-bold">indisponible</span>
                    </span>
                  </td>
                  <td class="py-2.5 pr-2 text-right font-mono" :class="prod.priceUnit === null ? 'text-amber-800' : ''">{{ prix(prod.priceUnit) }}</td>
                  <td v-for="p in PACKS" :key="p.cle" class="py-2.5 px-1 text-right tabular-nums">{{ quantite(prod.quantites?.[p.cle]) }}</td>
                  <td class="py-2.5 px-1 text-right tabular-nums" :class="prod.seuilAlerte === null ? 'text-amber-800' : ''">{{ prod.seuilAlerte === null ? aRenseigner : quantite(prod.seuilAlerte) }}</td>
                  <td class="py-2.5 text-right whitespace-nowrap">
                    <button @click="openEditMode(prod)" class="cursor-pointer p-1.5 text-gris hover:text-foret" :aria-label="`Modifier ${prod.name}`"><Edit2 class="w-3.5 h-3.5" /></button>
                    <button @click="deleteProduct(prod)" class="cursor-pointer p-1.5 text-gris hover:text-red-700" :aria-label="`Supprimer ${prod.name}`"><Trash2 class="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="flex items-center justify-between pt-4 mt-2 border-t border-creme2">
            <button :disabled="page === 1 || isPlaceholderData" @click="page--" class="px-4 py-2 border border-creme2 rounded-xl disabled:opacity-50">← Précédent</button>
            <span class="font-bold text-noir">Page {{ page }}</span>
            <button :disabled="!data?.hasMore || isPlaceholderData" @click="page++" class="px-4 py-2 border border-creme2 rounded-xl disabled:opacity-50">Suivant →</button>
          </div>
        </div>
      </div>

      <div v-if="showFormPanel" class="bg-white p-5 rounded-2xl border border-creme2 space-y-4 xl:sticky xl:top-6">
        <div class="flex items-center justify-between border-b border-creme2 pb-2.5">
          <h3 class="font-bold text-noir text-sm">{{ isEditing ? 'Modifier le produit' : 'Ajouter au catalogue' }}</h3>
          <button @click="showFormPanel = false" class="p-1 rounded-lg bg-creme" aria-label="Fermer"><X class="w-3.5 h-3.5" /></button>
        </div>

        <form @submit.prevent="handleSubmit" class="space-y-3">
          <div class="grid grid-cols-3 gap-2">
            <label class="block text-[10px] font-bold uppercase text-gris">Réf.
              <input id="produit-reference" v-model="form.reference" type="text" placeholder="P01" class="mt-1 w-full px-3 py-2 bg-creme border border-creme2 rounded-lg text-noir font-normal normal-case" />
            </label>
            <label class="col-span-2 block text-[10px] font-bold uppercase text-gris">Nom du produit
              <input id="produit-nom" v-model="form.name" type="text" required class="mt-1 w-full px-3 py-2 bg-creme border border-creme2 rounded-lg text-noir font-normal normal-case" />
            </label>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <label class="block text-[10px] font-bold uppercase text-gris">Type
              <select id="produit-type" v-model="form.type" class="mt-1 w-full px-3 py-2 bg-creme border border-creme2 rounded-lg text-noir font-normal normal-case">
                <option value="base fixe">Base fixe des packs</option>
                <option value="extra">Extra (variable)</option>
              </select>
            </label>
            <label class="block text-[10px] font-bold uppercase text-gris">Statut
              <select id="produit-statut" v-model="form.statut" class="mt-1 w-full px-3 py-2 bg-creme border border-creme2 rounded-lg text-noir font-normal normal-case">
                <option value="disponible">Disponible</option>
                <option value="indisponible">Indisponible</option>
              </select>
            </label>
            <label class="block text-[10px] font-bold uppercase text-gris">Catégorie
              <select id="produit-categorie" v-model="form.category" class="mt-1 w-full px-3 py-2 bg-creme border border-creme2 rounded-lg text-noir font-normal normal-case">
                <option value="">À renseigner</option>
                <option v-for="cat in categoriesList" :key="cat._id" :value="cat._id">{{ cat.name }}</option>
              </select>
            </label>
            <label class="block text-[10px] font-bold uppercase text-gris">Unité
              <input id="produit-unite" v-model="form.unit" type="text" required placeholder="kg, L, lot, boîte…" class="mt-1 w-full px-3 py-2 bg-creme border border-creme2 rounded-lg text-noir font-normal normal-case" />
            </label>
            <label class="block text-[10px] font-bold uppercase text-gris">Prix unitaire (FCFA)
              <input id="produit-prix" v-model="form.priceUnit" type="number" min="0" step="any" placeholder="à renseigner" class="mt-1 w-full px-3 py-2 bg-creme border border-creme2 rounded-lg text-noir font-normal normal-case" />
            </label>
            <label class="block text-[10px] font-bold uppercase text-gris">Seuil d'alerte
              <input id="produit-seuil" v-model="form.seuilAlerte" type="number" min="0" step="any" placeholder="à renseigner" class="mt-1 w-full px-3 py-2 bg-creme border border-creme2 rounded-lg text-noir font-normal normal-case" />
            </label>
          </div>

          <fieldset class="p-3 rounded-xl border border-creme2 space-y-2">
            <legend class="px-1 text-[10px] font-bold uppercase text-gris">Quantités par pack ({{ form.unit || 'unité' }}) · vide = absent</legend>
            <div class="grid grid-cols-5 gap-1.5">
              <label v-for="p in PACKS" :key="p.cle" class="block text-[9px] font-bold uppercase text-gris text-center">{{ p.libelle }}
                <input :id="`produit-quantite-${p.cle}`" v-model="form.quantites[p.cle]" type="number" min="0" step="any" class="mt-1 w-full px-1.5 py-2 bg-creme border border-creme2 rounded-lg text-noir font-normal text-center" />
              </label>
            </div>
            <div class="flex flex-wrap items-end gap-2">
              <label class="flex-1 block text-[10px] font-bold uppercase text-gris">Règle (libellé)
                <select id="produit-regle" v-model="form.compositionRule" class="mt-1 w-full px-3 py-2 bg-creme border border-creme2 rounded-lg text-noir font-normal normal-case">
                  <option value="">Aucune</option>
                  <option v-for="rule in rulesList" :key="rule._id" :value="rule._id">{{ rule.name }}</option>
                </select>
              </label>
              <button type="button" :disabled="!regleChoisie || form.quantites.essentiel === null" @click="proposerQuantites" class="cursor-pointer inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-foret/30 text-foret font-bold disabled:opacity-40" title="Équilibré et Confort calculés depuis Essentiel avec la règle choisie">
                <Wand2 class="w-3.5 h-3.5" /> Proposer
              </button>
            </div>
          </fieldset>

          <label class="block text-[10px] font-bold uppercase text-gris">Commentaire
            <textarea id="produit-commentaire" v-model="form.commentaire" rows="2" maxlength="500" class="mt-1 w-full px-3 py-2 bg-creme border border-creme2 rounded-lg text-noir font-normal normal-case"></textarea>
          </label>

          <button type="submit" :disabled="isSubmitting" class="cursor-pointer w-full py-2.5 bg-foret text-white text-xs font-bold rounded-xl disabled:opacity-50">
            {{ isSubmitting ? 'Enregistrement...' : (isEditing ? 'Enregistrer les modifications' : 'Ajouter le produit') }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
