<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/vue-query'
import { Plus, CheckCircle2, Trash2, Paperclip, X, Upload } from 'lucide-vue-next'
import Swal from 'sweetalert2'
import api from '@/stores/api'
import type { Depense, LigneBudget, Prestataire } from '@/type'

// Liste des dépenses d'une catégorie (Budget ou Exploitation) : ajout, paiement avec justificatif, audit
const props = defineProps<{
  categorie: 'Budget' | 'Exploitation'
  ecriture: boolean
  lignes?: LigneBudget[] // Budget : lignes de la convention, pour le choix et le filtre
}>()
const emit = defineEmits<{ notifier: [texte: string, type: 'success' | 'error'] }>()

const TYPES_EXPLOITATION = ['Achat stock', 'Livraison', 'Compensation', 'Autre'] as const
const queryClient = useQueryClient()
const page = ref(1)
const filtreLigne = ref('')
const filtreEffectue = ref<'' | 'true' | 'false'>('')
watch([filtreLigne, filtreEffectue], () => { page.value = 1 })

const { data, isLoading } = useQuery({
  queryKey: ['depenses', () => props.categorie, filtreLigne, filtreEffectue, page],
  queryFn: async (): Promise<{ depenses: Depense[]; total: number; hasMore: boolean }> =>
    (await api.get('/api/admin/finances/depenses', {
      params: { categorie: props.categorie, ligne: filtreLigne.value || undefined, effectue: filtreEffectue.value || undefined, page: page.value }
    })).data,
  placeholderData: keepPreviousData,
})

const { data: prestataires } = useQuery({
  queryKey: ['prestataires', 'tous-actifs'],
  queryFn: async (): Promise<Prestataire[]> => (await api.get('/api/admin/prestataires', { params: { actif: 'true', limit: 200 } })).data.prestataires,
})

const rafraichir = () => {
  queryClient.invalidateQueries({ queryKey: ['depenses'] })
  queryClient.invalidateQueries({ queryKey: ['finances'] })
}

const formatFCFA = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`
const formatUSD = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
const dateCourte = (d: string | null) => d ? new Date(d).toLocaleDateString('fr-FR') : '-'

// --- Ajout ---
const formOuvert = ref(false)
const envoi = ref(false)
const nouvelle = () => ({ referenceLigne: '', typeExploitation: 'Autre', libelle: '', partenaireId: '', montantPrevuFcfa: null as number | null, montantPrevuUsd: null as number | null })
const form = ref(nouvelle())

async function ajouter() {
  envoi.value = true
  try {
    await api.post('/api/admin/finances/depenses', { ...form.value, categorie: props.categorie, partenaireId: form.value.partenaireId || null })
    emit('notifier', 'Dépense ajoutée.', 'success')
    form.value = nouvelle()
    formOuvert.value = false
    rafraichir()
  } catch (err: any) {
    emit('notifier', err.response?.data?.message || "Impossible d'ajouter la dépense", 'error')
  } finally {
    envoi.value = false
  }
}

// --- Paiement : montant réel, date et justificatif ---
const aPayer = ref<Depense | null>(null)
const paiement = ref({ montantReelFcfa: null as number | null, datePaiement: '', urlPieceJointe: '' })
const televersement = ref(false)

function ouvrirPaiement(d: Depense) {
  aPayer.value = d
  paiement.value = { montantReelFcfa: d.montantPrevuFcfa, datePaiement: new Date().toISOString().slice(0, 10), urlPieceJointe: '' }
}

async function joindre(evenement: Event) {
  const fichier = (evenement.target as HTMLInputElement).files?.[0]
  if (!fichier) return
  if (fichier.size > 10 * 1024 * 1024) return emit('notifier', 'Fichier trop lourd (10 Mo maximum).', 'error')
  const donnees = new FormData()
  donnees.append('fichier', fichier)
  televersement.value = true
  try {
    paiement.value.urlPieceJointe = (await api.post('/api/admin/finances/justificatifs', donnees)).data.url
  } catch (err: any) {
    emit('notifier', err.response?.data?.message || 'Téléversement impossible (PDF, JPG ou PNG).', 'error')
  } finally {
    televersement.value = false
  }
}

async function confirmerPaiement() {
  if (!aPayer.value) return
  envoi.value = true
  try {
    await api.patch(`/api/admin/finances/depenses/${aPayer.value._id}/effectuer`, paiement.value)
    emit('notifier', `« ${aPayer.value.libelle} » marquée effectuée.`, 'success')
    aPayer.value = null
    rafraichir()
  } catch (err: any) {
    emit('notifier', err.response?.data?.message || 'Validation impossible', 'error')
  } finally {
    envoi.value = false
  }
}

async function basculerAudit(d: Depense) {
  try {
    await api.patch(`/api/admin/finances/depenses/${d._id}/audit`, { estValidePourAudit: !d.estValidePourAudit })
    rafraichir()
  } catch (err: any) {
    emit('notifier', err.response?.data?.message || 'Mise à jour impossible', 'error')
  }
}

async function supprimer(d: Depense) {
  const choix = await Swal.fire({
    title: `Supprimer « ${d.libelle} » ?`, icon: 'warning', showCancelButton: true,
    confirmButtonColor: '#1A5C38', confirmButtonText: 'Supprimer', cancelButtonText: 'Annuler',
    customClass: { popup: 'rounded-2xl font-body' }
  })
  if (!choix.isConfirmed) return
  try {
    await api.delete(`/api/admin/finances/depenses/${d._id}`)
    emit('notifier', 'Dépense supprimée.', 'success')
    rafraichir()
  } catch (err: any) {
    emit('notifier', err.response?.data?.message || 'Suppression impossible', 'error')
  }
}

const libelleLigne = (code: string) => props.lignes?.find(l => l.code === code)?.libelle ?? ''
const totalAffiche = computed(() => data.value?.total ?? 0)
</script>

<template>
  <div class="bg-white rounded-2xl border border-creme2 p-4 space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <h2 class="font-bold text-sm mr-auto">Dépenses <span class="text-gris font-normal">({{ totalAffiche }})</span></h2>
      <select v-if="categorie === 'Budget'" v-model="filtreLigne" aria-label="Filtrer par ligne" class="px-3 py-2 rounded-xl border border-creme2 bg-creme text-xs">
        <option value="">Toutes les lignes</option>
        <option v-for="l in lignes" :key="l.code" :value="l.code">{{ l.code }} · {{ l.libelle }}</option>
      </select>
      <select v-model="filtreEffectue" aria-label="Filtrer par état" class="px-3 py-2 rounded-xl border border-creme2 bg-creme text-xs">
        <option value="">Toutes</option>
        <option value="false">À payer</option>
        <option value="true">Effectuées</option>
      </select>
      <button v-if="ecriture" @click="formOuvert = !formOuvert" class="cursor-pointer inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-foret text-white text-xs font-bold">
        <Plus class="w-3.5 h-3.5" /> Dépense
      </button>
    </div>

    <!-- Ajout -->
    <form v-if="formOuvert" @submit.prevent="ajouter" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-3 rounded-xl bg-creme/60 border border-creme2 text-xs">
      <label v-if="categorie === 'Budget'" class="font-bold uppercase text-[10px] text-gris">Ligne budgétaire
        <select v-model="form.referenceLigne" required class="mt-1 w-full px-3 py-2 rounded-lg border border-creme2 bg-white text-sm font-normal normal-case text-noir">
          <option value="" disabled>Choisir</option>
          <option v-for="l in lignes" :key="l.code" :value="l.code">{{ l.code }} · {{ l.libelle }}</option>
        </select>
      </label>
      <label v-else class="font-bold uppercase text-[10px] text-gris">Type
        <select v-model="form.typeExploitation" class="mt-1 w-full px-3 py-2 rounded-lg border border-creme2 bg-white text-sm font-normal normal-case text-noir">
          <option v-for="t in TYPES_EXPLOITATION" :key="t" :value="t">{{ t }}</option>
        </select>
      </label>
      <label class="font-bold uppercase text-[10px] text-gris sm:col-span-1 lg:col-span-2">Libellé
        <input v-model="form.libelle" required type="text" class="mt-1 w-full px-3 py-2 rounded-lg border border-creme2 bg-white text-sm font-normal normal-case text-noir" />
      </label>
      <label class="font-bold uppercase text-[10px] text-gris">Prestataire (facultatif)
        <select v-model="form.partenaireId" class="mt-1 w-full px-3 py-2 rounded-lg border border-creme2 bg-white text-sm font-normal normal-case text-noir">
          <option value="">Aucun</option>
          <option v-for="p in prestataires" :key="p._id" :value="p._id">{{ p.nom }} ({{ p.type }})</option>
        </select>
      </label>
      <label class="font-bold uppercase text-[10px] text-gris">Prévu (FCFA)
        <input v-model.number="form.montantPrevuFcfa" type="number" min="0" class="mt-1 w-full px-3 py-2 rounded-lg border border-creme2 bg-white text-sm font-normal text-noir" />
      </label>
      <label class="font-bold uppercase text-[10px] text-gris">ou Prévu (USD)
        <input v-model.number="form.montantPrevuUsd" type="number" min="0" step="0.01" class="mt-1 w-full px-3 py-2 rounded-lg border border-creme2 bg-white text-sm font-normal text-noir" />
      </label>
      <p class="sm:col-span-2 lg:col-span-3 text-[11px] text-gris">L'autre devise est calculée avec le taux en vigueur, qui reste ensuite figé sur la dépense.</p>
      <button type="submit" :disabled="envoi" class="cursor-pointer sm:col-span-2 lg:col-span-3 px-3 py-2.5 rounded-xl bg-foret text-white font-bold disabled:opacity-50">Enregistrer la dépense prévue</button>
    </form>

    <!-- Liste -->
    <p v-if="isLoading" class="text-center text-gris py-6">Chargement...</p>
    <p v-else-if="!data?.depenses.length" class="text-center text-gris py-6 border border-dashed border-creme2 rounded-xl">Aucune dépense pour ce filtre.</p>
    <div v-else class="overflow-x-auto">
      <table class="w-full text-left text-xs border-collapse min-w-170">
        <thead>
          <tr class="text-[10px] uppercase tracking-wider text-gris border-b border-creme2">
            <th class="py-2 pr-2">{{ categorie === 'Budget' ? 'Ligne' : 'Type' }}</th>
            <th class="py-2 pr-2">Libellé</th>
            <th class="py-2 pr-2 text-right">Prévu</th>
            <th class="py-2 pr-2 text-right">Réel</th>
            <th class="py-2 pr-2">Paiement</th>
            <th class="py-2 pr-2 text-center">Audit</th>
            <th class="py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-creme2">
          <tr v-for="d in data.depenses" :key="d._id" :class="!d.estValidePourAudit ? 'opacity-60' : ''">
            <td class="py-2.5 pr-2 font-bold whitespace-nowrap" :title="libelleLigne(d.referenceLigne)">{{ categorie === 'Budget' ? d.referenceLigne : d.typeExploitation }}</td>
            <td class="py-2.5 pr-2">
              {{ d.libelle }}
              <span v-if="d.partenaireId" class="block text-gris">{{ d.partenaireId.nom }}</span>
            </td>
            <td class="py-2.5 pr-2 text-right whitespace-nowrap">{{ formatFCFA(d.montantPrevuFcfa) }}<span class="block text-gris">{{ formatUSD(d.montantPrevuUsd) }}</span></td>
            <td class="py-2.5 pr-2 text-right whitespace-nowrap">
              <template v-if="d.estEffectue">{{ formatFCFA(d.montantReelFcfa) }}<span class="block text-gris">{{ formatUSD(d.montantReelUsd) }}</span></template>
              <span v-else class="text-gris">-</span>
            </td>
            <td class="py-2.5 pr-2 whitespace-nowrap">
              <span v-if="d.estEffectue" class="inline-flex items-center gap-1 text-green-800 font-semibold"><CheckCircle2 class="w-3.5 h-3.5" /> {{ dateCourte(d.datePaiement) }}</span>
              <span v-else class="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-bold text-[10px]">À payer</span>
              <a v-if="d.urlPieceJointe" :href="d.urlPieceJointe" target="_blank" rel="noopener" class="ml-1 inline-flex text-savane" aria-label="Voir le justificatif"><Paperclip class="w-3.5 h-3.5" /></a>
            </td>
            <td class="py-2.5 pr-2 text-center">
              <input type="checkbox" :checked="d.estValidePourAudit" :disabled="!ecriture" @change="basculerAudit(d)" class="accent-foret w-4 h-4" :aria-label="`Inclure « ${d.libelle} » dans l'audit`" />
            </td>
            <td class="py-2.5 text-right whitespace-nowrap">
              <template v-if="ecriture && !d.estEffectue">
                <button @click="ouvrirPaiement(d)" class="cursor-pointer px-2.5 py-1.5 rounded-lg bg-foret text-white font-bold text-[11px]">Payée</button>
                <button @click="supprimer(d)" class="cursor-pointer p-1.5 text-gris hover:text-red-600" :aria-label="`Supprimer « ${d.libelle} »`"><Trash2 class="w-3.5 h-3.5" /></button>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="data && (page > 1 || data.hasMore)" class="flex justify-between text-xs">
      <button :disabled="page === 1" @click="page--" class="px-3 py-1.5 rounded-lg border border-creme2 disabled:opacity-50">← Précédent</button>
      <button :disabled="!data.hasMore" @click="page++" class="px-3 py-1.5 rounded-lg border border-creme2 disabled:opacity-50">Suivant →</button>
    </div>

    <!-- Fenêtre de paiement -->
    <div v-if="aPayer" class="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" @click.self="aPayer = null">
      <form @submit.prevent="confirmerPaiement" role="dialog" aria-modal="true" aria-labelledby="titre-paiement" class="w-full max-w-md bg-white rounded-2xl p-5 space-y-4 text-sm">
        <div class="flex items-start justify-between gap-2">
          <div>
            <h3 id="titre-paiement" class="font-bold">Dépense payée</h3>
            <p class="text-xs text-gris">{{ aPayer.libelle }} · prévu {{ formatFCFA(aPayer.montantPrevuFcfa) }}</p>
          </div>
          <button type="button" @click="aPayer = null" class="p-1.5 rounded-lg bg-creme" aria-label="Fermer"><X class="w-4 h-4" /></button>
        </div>
        <label class="block text-[10px] font-bold uppercase text-gris">Montant payé (FCFA)
          <input v-model.number="paiement.montantReelFcfa" type="number" min="1" required class="mt-1 w-full px-3 py-2 rounded-lg border border-creme2 bg-creme text-sm text-noir font-normal" />
        </label>
        <label class="block text-[10px] font-bold uppercase text-gris">Date du paiement
          <input v-model="paiement.datePaiement" type="date" required class="mt-1 w-full px-3 py-2 rounded-lg border border-creme2 bg-creme text-sm text-noir font-normal" />
        </label>
        <div>
          <p class="text-[10px] font-bold uppercase text-gris mb-1">Justificatif (obligatoire)</p>
          <label class="flex items-center gap-2 px-3 py-3 rounded-xl border border-dashed border-foret/40 bg-creme/60 cursor-pointer text-xs font-semibold">
            <Upload class="w-4 h-4 text-foret" />
            <span>{{ televersement ? 'Envoi en cours...' : paiement.urlPieceJointe ? 'Justificatif joint ✓ (changer)' : 'Choisir un PDF, JPG ou PNG (10 Mo max.)' }}</span>
            <input type="file" accept="application/pdf,image/jpeg,image/png" class="sr-only" @change="joindre" />
          </label>
        </div>
        <button type="submit" :disabled="envoi || televersement || !paiement.urlPieceJointe" class="cursor-pointer w-full px-3 py-2.5 rounded-xl bg-foret text-white text-xs font-bold disabled:opacity-50">
          Marquer comme effectuée
        </button>
      </form>
    </div>
  </div>
</template>
