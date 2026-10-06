<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/vue-query'
import { Plus, CheckCircle2, Trash2, Paperclip, X, Upload, AlertTriangle, Lock } from 'lucide-vue-next'
import Swal from 'sweetalert2'
import api from '@/stores/api'
import type { Depense, Justificatif, LigneBudget, Prestataire } from '@/type'

// Liste des dépenses d'une catégorie (Budget ou Exploitation) : ajout, paiement, pièces justificatives, audit
const props = defineProps<{
  categorie: 'Budget' | 'Exploitation'
  ecriture: boolean
  lignes?: LigneBudget[] // Budget : lignes de la convention, pour le choix et le filtre
}>()
const emit = defineEmits<{ notifier: [texte: string, type: 'success' | 'error'] }>()

const TYPES_EXPLOITATION = ['Achat stock', 'Livraison', 'Compensation', 'Autre'] as const
const MODES_PAIEMENT = ['Mobile Money', 'Espèces', 'Virement', 'Chèque'] as const
const SOURCES = ['Subvention N°171', 'Fonds propres', 'Ventes'] as const
const MOIS = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6']
const queryClient = useQueryClient()
const page = ref(1)
const filtreLigne = ref('')
const filtreEffectue = ref<'' | 'true' | 'false'>('')
const filtreMois = ref('')
watch([filtreLigne, filtreEffectue, filtreMois], () => { page.value = 1 })

const { data, isLoading } = useQuery({
  queryKey: ['depenses', () => props.categorie, filtreLigne, filtreEffectue, filtreMois, page],
  queryFn: async (): Promise<{ depenses: Depense[]; total: number; hasMore: boolean; moisClos: string[] }> =>
    (await api.get('/api/admin/finances/depenses', {
      params: { categorie: props.categorie, ligne: filtreLigne.value || undefined, effectue: filtreEffectue.value || undefined, mois: filtreMois.value || undefined, page: page.value }
    })).data,
  placeholderData: keepPreviousData,
})

const { data: prestataires } = useQuery({
  queryKey: ['prestataires', 'tous-actifs'],
  queryFn: async (): Promise<Prestataire[]> => (await api.get('/api/admin/prestataires', { params: { actif: 'true', limit: 200 } })).data.prestataires,
  enabled: computed(() => props.ecriture), // Seulement pour le formulaire d'ajout (l'auditeur n'a pas accès aux prestataires)
})

const rafraichir = () => {
  queryClient.invalidateQueries({ queryKey: ['depenses'] })
  queryClient.invalidateQueries({ queryKey: ['finances'] })
}

const formatFCFA = (n: number | null) => n === null ? 'non fixé' : `${Math.round(n).toLocaleString('fr-FR')} FCFA`
const formatUSD = (n: number | null) => n === null ? '' : `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
const dateCourte = (d: string | null) => d ? new Date(d).toLocaleDateString('fr-FR') : '-'
const aujourdHui = () => new Date().toLocaleDateString('sv-SE')
const estClos = (d: Depense) => !!d.moisProjet && !!data.value?.moisClos.includes(d.moisProjet)

// --- Ajout ---
const formOuvert = ref(false)
const envoi = ref(false)
const nouvelle = () => ({
  referenceLigne: '', sousLigne: '', typeExploitation: 'Autre', libelle: '', partenaireId: '',
  montantPrevuFcfa: null as number | null, montantPrevuUsd: null as number | null,
  numeroPiece: '', numeroAutorisation: '', modePaiement: '', referencePaiement: '', sourceFinancement: '', commentaire: ''
})
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

// --- Fenêtre « pièces » (et paiement pour une dépense à payer) : justificatifs en stockage privé ---
const ouverte = ref<Depense | null>(null)
const paiement = ref({ montantReelFcfa: null as number | null, datePaiement: '', modePaiement: '', referencePaiement: '' })
const pieces = ref<Justificatif[]>([])
const typePiece = ref('')
const televersement = ref(false)
const typesProposes = computed(() => {
  const p = ouverte.value?.pieces
  return p ? [...p.attendues, ...p.facultatives] : []
})
const typesPresents = computed(() => new Set(pieces.value.map(p => p.typePiece)))

function ouvrir(d: Depense) {
  ouverte.value = d
  pieces.value = [...(d.justificatifs ?? [])]
  typePiece.value = d.pieces.manquantes[0] ?? ''
  paiement.value = { montantReelFcfa: d.montantPrevuFcfa, datePaiement: aujourdHui(), modePaiement: d.modePaiement, referencePaiement: d.referencePaiement }
}

async function joindre(evenement: Event) {
  const champ = evenement.target as HTMLInputElement
  const fichier = champ.files?.[0]
  champ.value = ''
  if (!fichier || !ouverte.value) return
  if (fichier.size > 10 * 1024 * 1024) return emit('notifier', 'Fichier trop lourd (10 Mo maximum).', 'error')
  const donnees = new FormData()
  donnees.append('fichier', fichier)
  donnees.append('typePiece', typePiece.value)
  televersement.value = true
  try {
    pieces.value.push((await api.post(`/api/admin/finances/depenses/${ouverte.value._id}/justificatifs`, donnees)).data)
    const suivante = ouverte.value.pieces.manquantes.find(p => !typesPresents.value.has(p))
    typePiece.value = suivante ?? ''
    rafraichir()
  } catch (err: any) {
    emit('notifier', err.response?.data?.message || 'Téléversement impossible (PDF, JPG ou PNG).', 'error')
  } finally {
    televersement.value = false
  }
}

// Consultation : lien signé et temporaire demandé à l'API (aucune adresse publique)
async function ouvrirPiece(depenseId: string, piece: Justificatif) {
  try {
    const { url } = (await api.get(`/api/admin/finances/depenses/${depenseId}/justificatifs/${piece._id}/lien`)).data
    window.open(url, '_blank', 'noopener')
  } catch (err: any) {
    emit('notifier', err.response?.data?.message || "Impossible d'ouvrir le justificatif", 'error')
  }
}

async function confirmerPaiement() {
  if (!ouverte.value) return
  envoi.value = true
  try {
    const { message } = (await api.patch(`/api/admin/finances/depenses/${ouverte.value._id}/effectuer`, paiement.value)).data
    emit('notifier', message || `« ${ouverte.value.libelle} » marquée effectuée.`, 'success')
    ouverte.value = null
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
  } catch (err: any) {
    emit('notifier', err.response?.data?.message || 'Mise à jour impossible', 'error')
  } finally {
    rafraichir()
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
const champ = 'mt-1 w-full px-3 py-2 rounded-lg border border-creme2 bg-white text-sm font-normal normal-case text-noir'
const etiquette = 'font-bold uppercase text-[10px] text-gris'
</script>

<template>
  <div class="bg-white rounded-2xl border border-creme2 p-4 space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <h2 class="font-bold text-sm mr-auto">Dépenses <span class="text-gris font-normal">({{ totalAffiche }})</span></h2>
      <select v-if="categorie === 'Budget'" v-model="filtreLigne" aria-label="Filtrer par ligne" class="px-3 py-2 rounded-xl border border-creme2 bg-creme text-xs max-w-full">
        <option value="">Toutes les lignes</option>
        <option v-for="l in lignes" :key="l.code" :value="l.code">{{ l.code }} · {{ l.libelle }}</option>
      </select>
      <select v-model="filtreMois" aria-label="Filtrer par mois du projet" class="px-3 py-2 rounded-xl border border-creme2 bg-creme text-xs">
        <option value="">Tous les mois</option>
        <option v-for="m in MOIS" :key="m" :value="m">{{ m }}</option>
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
      <template v-if="categorie === 'Budget'">
        <label :class="etiquette">Ligne budgétaire
          <select v-model="form.referenceLigne" required :class="champ">
            <option value="" disabled>Choisir</option>
            <option v-for="l in lignes" :key="l.code" :value="l.code">{{ l.code }} · {{ l.libelle }}</option>
          </select>
        </label>
        <label :class="etiquette">Sous-ligne (facultatif)<input v-model="form.sousLigne" :class="champ" placeholder="Ex : L5b" /></label>
      </template>
      <template v-else>
        <label :class="etiquette">Type
          <select v-model="form.typeExploitation" :class="champ">
            <option v-for="t in TYPES_EXPLOITATION" :key="t" :value="t">{{ t }}</option>
          </select>
        </label>
        <label :class="etiquette">Financement
          <select v-model="form.sourceFinancement" :class="champ">
            <option value="">À préciser</option>
            <option v-for="s in SOURCES" :key="s" :value="s">{{ s }}</option>
          </select>
        </label>
      </template>
      <label :class="[etiquette, 'sm:col-span-2 lg:col-span-1']">Libellé
        <input v-model="form.libelle" required type="text" :class="champ" />
      </label>
      <label :class="etiquette">Prestataire (facultatif)
        <select v-model="form.partenaireId" :class="champ">
          <option value="">Aucun</option>
          <option v-for="p in prestataires" :key="p._id" :value="p._id">{{ p.nom }} ({{ p.type }})</option>
        </select>
      </label>
      <label :class="etiquette">Prévu (FCFA)<input v-model.number="form.montantPrevuFcfa" type="number" min="0" :class="champ" /></label>
      <label :class="etiquette">ou Prévu (USD)<input v-model.number="form.montantPrevuUsd" type="number" min="0" step="0.01" :class="champ" /></label>
      <label :class="etiquette">N° de pièce (facture)<input v-model="form.numeroPiece" :class="champ" /></label>
      <label :class="etiquette">N° d'autorisation de décaissement<input v-model="form.numeroAutorisation" :class="champ" /></label>
      <label :class="etiquette">Mode de paiement prévu
        <select v-model="form.modePaiement" :class="champ">
          <option value="">À préciser</option>
          <option v-for="m in MODES_PAIEMENT" :key="m" :value="m">{{ m }}</option>
        </select>
      </label>
      <label :class="[etiquette, 'sm:col-span-2 lg:col-span-3']">Commentaire<input v-model="form.commentaire" :class="champ" /></label>
      <p class="sm:col-span-2 lg:col-span-3 text-[11px] text-gris">L'autre devise est calculée avec le taux en vigueur, qui reste ensuite figé sur la dépense.<template v-if="categorie === 'Budget'"> Les pièces exigées dépendent de la catégorie de la ligne.</template></p>
      <button type="submit" :disabled="envoi" class="cursor-pointer sm:col-span-2 lg:col-span-3 px-3 py-2.5 rounded-xl bg-foret text-white font-bold disabled:opacity-50">Enregistrer la dépense prévue</button>
    </form>

    <!-- Liste -->
    <p v-if="isLoading" class="text-center text-gris py-6">Chargement...</p>
    <p v-else-if="!data?.depenses.length" class="text-center text-gris py-6 border border-dashed border-creme2 rounded-xl">Aucune dépense pour ce filtre.</p>
    <div v-defilable="'Dépenses'" v-else class="overflow-x-auto">
      <table class="w-full text-left text-xs border-collapse min-w-190">
        <thead>
          <tr class="text-[10px] uppercase tracking-wider text-gris border-b border-creme2">
            <th class="py-2 pr-2">{{ categorie === 'Budget' ? 'Ligne' : 'Type' }}</th>
            <th class="py-2 pr-2">Libellé</th>
            <th class="py-2 pr-2 text-right">Prévu</th>
            <th class="py-2 pr-2 text-right">Réel</th>
            <th class="py-2 pr-2">Paiement</th>
            <th class="py-2 pr-2">Pièces</th>
            <th class="py-2 pr-2 text-center">Audit</th>
            <th class="py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-creme2">
          <tr v-for="d in data.depenses" :key="d._id" class="align-top">
            <td class="py-2.5 pr-2 font-bold whitespace-nowrap" :title="libelleLigne(d.referenceLigne)">
              {{ categorie === 'Budget' ? d.referenceLigne : d.typeExploitation }}
              <span v-if="d.sousLigne && d.sousLigne !== d.referenceLigne" class="block font-normal text-gris">{{ d.sousLigne }}</span>
              <span v-if="d.categorieAd" class="block font-normal text-[10px] text-gris">cat. {{ d.categorieAd }}</span>
            </td>
            <td class="py-2.5 pr-2 max-w-64">
              {{ d.libelle }}
              <span v-if="d.partenaireId" class="block text-gris">{{ d.partenaireId.nom }}</span>
              <span v-if="d.numeroPiece" class="block text-gris font-mono text-[10px]">Pièce {{ d.numeroPiece }}<template v-if="d.numeroAutorisation"> · aut. {{ d.numeroAutorisation }}</template></span>
              <span v-if="categorie === 'Exploitation' && d.sourceFinancement" class="block text-[10px] text-gris">{{ d.sourceFinancement }}</span>
            </td>
            <td class="py-2.5 pr-2 text-right whitespace-nowrap">{{ formatFCFA(d.montantPrevuFcfa) }}<span class="block text-gris">{{ formatUSD(d.montantPrevuUsd) }}</span></td>
            <td class="py-2.5 pr-2 text-right whitespace-nowrap">
              <template v-if="d.estEffectue">{{ formatFCFA(d.montantReelFcfa) }}<span class="block text-gris">{{ formatUSD(d.montantReelUsd) }}</span></template>
              <span v-else class="text-gris">-</span>
            </td>
            <td class="py-2.5 pr-2 whitespace-nowrap">
              <template v-if="d.estEffectue">
                <span class="inline-flex items-center gap-1 text-green-800 font-semibold"><CheckCircle2 class="w-3.5 h-3.5" /> {{ dateCourte(d.datePaiement) }}</span>
                <span class="block text-gris">{{ d.moisProjet || 'hors convention' }}<template v-if="d.modePaiement"> · {{ d.modePaiement }}</template></span>
                <span v-if="estClos(d)" class="inline-flex items-center gap-1 text-[10px] text-gris"><Lock class="w-3 h-3" /> mois clos</span>
                <span v-if="d.horsPeriode" class="block text-[10px] font-bold text-red-700">hors période</span>
              </template>
              <span v-else class="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-bold text-[10px]">À payer</span>
            </td>
            <td class="py-2.5 pr-2 min-w-36">
              <template v-if="d.pieces.attendues.length">
                <span :class="d.pieces.manquantes.length ? 'text-amber-800' : 'text-green-800'" class="font-bold">{{ d.pieces.presentes.length }}/{{ d.pieces.attendues.length }} exigées</span>
                <span v-if="d.pieces.manquantes.length" class="block text-[10px] text-gris max-w-48" :title="d.pieces.manquantes.join(', ')">Manque : {{ d.pieces.manquantes.join(', ') }}</span>
              </template>
              <span v-else class="text-gris">{{ d.justificatifs.length }} pièce(s)</span>
              <span v-if="d.piecesManquantes" class="block text-[10px] text-amber-800 max-w-48">{{ d.piecesManquantes }}</span>
              <span class="flex flex-wrap gap-1 mt-1">
                <button v-for="(p, i) in d.justificatifs" :key="p._id" type="button" @click="ouvrirPiece(d._id, p)" class="cursor-pointer inline-flex items-center text-savane" :aria-label="`Ouvrir le justificatif ${i + 1} : ${p.typePiece || p.nom}`" :title="p.typePiece || p.nom"><Paperclip class="w-3.5 h-3.5" /></button>
              </span>
              <span v-if="d.urlPieceJointe" class="text-[10px] font-bold text-amber-800" title="Ancien justificatif à adresse publique : à téléverser de nouveau">ancien lien</span>
            </td>
            <td class="py-2.5 pr-2 text-center">
              <input type="checkbox" :checked="d.estValidePourAudit" :disabled="!ecriture || estClos(d)" @change="basculerAudit(d)" class="accent-foret w-4 h-4" :aria-label="`Inclure « ${d.libelle} » dans l'audit`" />
            </td>
            <td class="py-2.5 text-right whitespace-nowrap">
              <template v-if="ecriture && !estClos(d)">
                <button v-if="!d.estEffectue" @click="ouvrir(d)" class="cursor-pointer px-2.5 py-1.5 rounded-lg bg-foret text-white font-bold text-[11px]">Payée</button>
                <button v-else @click="ouvrir(d)" class="cursor-pointer px-2.5 py-1.5 rounded-lg border border-foret text-foret font-bold text-[11px]">Pièces</button>
                <button v-if="!d.estEffectue" @click="supprimer(d)" class="cursor-pointer p-1.5 text-gris hover:text-red-600" :aria-label="`Supprimer « ${d.libelle} »`"><Trash2 class="w-3.5 h-3.5" /></button>
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

    <!-- Fenêtre : pièces justificatives, et paiement pour une dépense à payer -->
    <div v-if="ouverte" class="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" @click.self="ouverte = null">
      <form @submit.prevent="confirmerPaiement" role="dialog" aria-modal="true" aria-labelledby="titre-depense" class="w-full max-w-md max-h-[90vh] overflow-y-auto bg-white rounded-2xl p-5 space-y-4 text-sm">
        <div class="flex items-start justify-between gap-2">
          <div>
            <h3 id="titre-depense" class="font-bold">{{ ouverte.estEffectue ? 'Pièces justificatives' : 'Dépense payée' }}</h3>
            <p class="text-xs text-gris">{{ ouverte.libelle }} · {{ ouverte.estEffectue ? `payé ${formatFCFA(ouverte.montantReelFcfa)}` : `prévu ${formatFCFA(ouverte.montantPrevuFcfa)}` }}</p>
          </div>
          <button type="button" @click="ouverte = null" class="cursor-pointer p-1.5 rounded-lg bg-creme" aria-label="Fermer"><X class="w-4 h-4" /></button>
        </div>

        <template v-if="!ouverte.estEffectue">
          <label class="block text-[10px] font-bold uppercase text-gris">Montant payé (FCFA)
            <input v-model.number="paiement.montantReelFcfa" type="number" min="1" required class="mt-1 w-full px-3 py-2 rounded-lg border border-creme2 bg-creme text-sm text-noir font-normal" />
          </label>
          <div class="grid grid-cols-2 gap-3">
            <label class="block text-[10px] font-bold uppercase text-gris">Date du paiement
              <input v-model="paiement.datePaiement" type="date" required class="mt-1 w-full px-3 py-2 rounded-lg border border-creme2 bg-creme text-sm text-noir font-normal" />
            </label>
            <label class="block text-[10px] font-bold uppercase text-gris">Mode
              <select v-model="paiement.modePaiement" required class="mt-1 w-full px-3 py-2 rounded-lg border border-creme2 bg-creme text-sm text-noir font-normal">
                <option value="" disabled>Choisir</option>
                <option v-for="m in MODES_PAIEMENT" :key="m" :value="m">{{ m }}</option>
              </select>
            </label>
          </div>
          <label class="block text-[10px] font-bold uppercase text-gris">Référence du paiement
            <input v-model="paiement.referencePaiement" :required="paiement.modePaiement === 'Mobile Money'" placeholder="Ex : référence MoMo" class="mt-1 w-full px-3 py-2 rounded-lg border border-creme2 bg-creme text-sm text-noir font-normal" />
          </label>
        </template>

        <div>
          <p class="text-[10px] font-bold uppercase text-gris mb-1">Justificatifs · stockage privé<template v-if="!ouverte.estEffectue"> (au moins un)</template></p>
          <ul v-if="ouverte.pieces.attendues.length" class="mb-2 space-y-0.5 text-xs">
            <li v-for="p in ouverte.pieces.attendues" :key="p" class="flex items-center gap-1.5">
              <CheckCircle2 v-if="typesPresents.has(p)" class="w-3.5 h-3.5 text-green-700" />
              <AlertTriangle v-else class="w-3.5 h-3.5 text-amber-700" />
              <span :class="typesPresents.has(p) ? '' : 'text-amber-900'">{{ p }}</span>
            </li>
          </ul>
          <ul v-if="pieces.length" class="mb-2 space-y-1 text-xs">
            <li v-for="p in pieces" :key="p._id" class="flex items-center gap-2">
              <Paperclip class="w-3.5 h-3.5 text-savane" />
              <button type="button" class="cursor-pointer underline truncate" @click="ouvrirPiece(ouverte._id, p)">{{ p.typePiece || p.nom || 'Justificatif' }}</button>
            </li>
          </ul>
          <label class="block text-[10px] font-bold uppercase text-gris mb-2">Type de la pièce
            <select v-model="typePiece" class="mt-1 w-full px-3 py-2 rounded-lg border border-creme2 bg-creme text-sm text-noir font-normal">
              <option value="">Autre pièce</option>
              <option v-for="t in typesProposes" :key="t" :value="t">{{ t }}{{ typesPresents.has(t) ? ' (déjà jointe)' : '' }}</option>
            </select>
          </label>
          <label class="flex items-center gap-2 px-3 py-3 rounded-xl border border-dashed border-foret/40 bg-creme/60 cursor-pointer text-xs font-semibold">
            <Upload class="w-4 h-4 text-foret" />
            <span>{{ televersement ? 'Envoi en cours...' : 'Choisir un PDF, JPG ou PNG (10 Mo max.)' }}</span>
            <input type="file" accept="application/pdf,image/jpeg,image/png" class="sr-only" @change="joindre" />
          </label>
          <p v-if="ouverte.fichiersAttendus?.length" class="mt-2 text-[10px] text-gris">Fichiers attendus : {{ ouverte.fichiersAttendus.join(' ; ') }}</p>
        </div>
        <button v-if="!ouverte.estEffectue" type="submit" :disabled="envoi || televersement || !pieces.length" class="cursor-pointer w-full px-3 py-2.5 rounded-xl bg-foret text-white text-xs font-bold disabled:opacity-50">
          Marquer comme effectuée
        </button>
        <button v-else type="button" @click="ouverte = null" class="cursor-pointer w-full px-3 py-2.5 rounded-xl border border-creme2 text-xs font-bold">Fermer</button>
      </form>
    </div>
  </div>
</template>
