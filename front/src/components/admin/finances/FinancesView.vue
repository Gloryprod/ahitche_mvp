<script setup lang="ts">
import { ref, computed } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { Wallet2, Download, FileText, AlertTriangle, Lock, LockOpen } from 'lucide-vue-next'
import Swal from 'sweetalert2'
import api from '@/stores/api'
import type { ClotureMois, LigneBudget, SyntheseFinances } from '@/type'
import { useAuthStore } from '@/stores/auth'
import { peutEcrire } from '@/config/roles'
import { genererSynthesePDF } from '@/services/pdfFinances'
import OngletBudget from './OngletBudget.vue'
import ListeDepenses from './ListeDepenses.vue'

const authStore = useAuthStore()
const ecriture = computed(() => peutEcrire(authStore.role.value, 'finances'))
const queryClient = useQueryClient()

const onglet = ref<'budget' | 'exploitation' | 'taux'>('budget')
const notification = ref({ text: '', type: '' })
const notifier = (text: string, type: string) => {
  notification.value = { text, type }
  setTimeout(() => notification.value = { text: '', type: '' }, 4000)
}

// Période de l'exploitation : le mois en cours par défaut (heure de Cotonou)
const aujourdhui = new Date(Date.now() + 3600 * 1000).toISOString().slice(0, 10)
const du = ref(`${aujourdhui.slice(0, 7)}-01`)
const au = ref(aujourdhui)

const { data: lignes } = useQuery({
  queryKey: ['finances', 'lignes'],
  queryFn: async (): Promise<LigneBudget[]> => (await api.get('/api/admin/finances/lignes')).data,
})
const { data: synthese, isLoading } = useQuery({
  queryKey: ['finances', 'synthese', du, au],
  queryFn: async (): Promise<SyntheseFinances> => (await api.get('/api/admin/finances/synthese', { params: { du: du.value, au: au.value } })).data,
})
const { data: taux } = useQuery({
  queryKey: ['finances', 'taux'],
  queryFn: async () => (await api.get('/api/admin/finances/taux')).data as { courant: number; convention: number; historique: { _id: string; tauxUsdFcfa: number; createdAt: string; creePar?: { username: string } }[] },
  enabled: computed(() => onglet.value === 'taux'),
})
const pageJournal = ref(1)
const { data: journal } = useQuery({
  queryKey: ['finances', 'journal', pageJournal],
  queryFn: async () => (await api.get('/api/admin/finances/journal', { params: { page: pageJournal.value } })).data as { entrees: { _id: string; createdAt: string; action: string; entite: string; resume: string; utilisateur?: { username: string }; role: string }[]; hasMore: boolean },
  enabled: computed(() => onglet.value === 'taux'),
})

const formatFCFA = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`
const formatUSD = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} USD`
const dateHeure = (d: string) => new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

const depensesPeriode = computed(() => {
  const d = synthese.value?.exploitation.depenses
  if (!d) return { achats: 0, autres: 0 }
  return {
    achats: d['Achat stock'].paye + d['Achat stock'].aPayer,
    autres: (['Livraison', 'Compensation', 'Autre'] as const).reduce((s, t) => s + d[t].paye + d[t].aPayer, 0)
  }
})
const tauxJustifie = computed(() => {
  const b = synthese.value?.budget
  return b && b.prevuFcfa ? Math.round((b.justifieFcfa / b.prevuFcfa) * 1000) / 10 : 0
})

// --- Mois du projet (du 26 au 25) et clôture mensuelle ---
const estAdmin = computed(() => authStore.role.value === 'admin')
const { data: clotures } = useQuery({
  queryKey: ['finances', 'clotures'],
  queryFn: async (): Promise<ClotureMois[]> => (await api.get('/api/admin/finances/clotures')).data,
  enabled: computed(() => onglet.value === 'budget'),
})
const dateFr = (jour: string) => new Date(`${jour}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
async function changerCloture(c: ClotureMois) {
  let motif = ''
  if (c.close) {
    const saisie = await Swal.fire({ title: `Rouvrir ${c.mois} ?`, input: 'text', inputLabel: 'Motif de la réouverture (tracé dans le journal)', showCancelButton: true, confirmButtonColor: '#1A5C38', confirmButtonText: 'Rouvrir', cancelButtonText: 'Annuler', inputValidator: (v: string) => (v.trim().length < 3 ? 'Indiquez le motif.' : null) })
    if (!saisie.isConfirmed) return
    motif = saisie.value
  } else {
    const choix = await Swal.fire({ title: `Clore ${c.mois} ?`, text: `Les dépenses du ${dateFr(c.du)} au ${dateFr(c.au)} ne se modifieront plus sans réouverture.`, icon: 'question', showCancelButton: true, confirmButtonColor: '#1A5C38', confirmButtonText: 'Clore', cancelButtonText: 'Annuler' })
    if (!choix.isConfirmed) return
  }
  try {
    const { message } = (await api.post(`/api/admin/finances/clotures/${c.mois}`, { action: c.close ? 'rouvrir' : 'cloturer', motif })).data
    notifier(message, 'success')
    queryClient.invalidateQueries({ queryKey: ['finances'] })
    queryClient.invalidateQueries({ queryKey: ['depenses'] })
  } catch (err: any) {
    notifier(err.response?.data?.message || 'Action impossible', 'error')
  }
}

// --- Taux ---
const nouveauTaux = ref<number | null>(null)
async function enregistrerTaux(valeur: number | null = nouveauTaux.value) {
  try {
    const response = await api.post('/api/admin/finances/taux', { tauxUsdFcfa: valeur })
    notifier(response.data.message, 'success')
    nouveauTaux.value = null
    queryClient.invalidateQueries({ queryKey: ['finances'] })
  } catch (err: any) {
    notifier(err.response?.data?.message || 'Enregistrement impossible', 'error')
  }
}

// --- Exports : dépenses et registres obligatoires, pour un mois du projet ou toute la convention ---
const moisExport = ref('')
const EXPORTS = [
  { chemin: 'depenses/export', nom: 'depenses-ahitche', libelle: 'Dépenses' },
  { chemin: 'registres/caisse', nom: 'livre-de-caisse', libelle: 'Livre de caisse' },
  { chemin: 'registres/factures', nom: 'registre-des-factures', libelle: 'Registre des factures' },
  { chemin: 'registres/achats', nom: 'registre-des-achats', libelle: 'Registre des achats' },
]
async function exporterCsv(e: typeof EXPORTS[number]) {
  try {
    const response = await api.get(`/api/admin/finances/${e.chemin}`, { responseType: 'blob', params: { mois: moisExport.value || undefined } })
    const url = URL.createObjectURL(response.data)
    const lien = Object.assign(document.createElement('a'), { href: url, download: `${e.nom}${moisExport.value ? `-${moisExport.value}` : ''}-${aujourdhui}.csv` })
    lien.click()
    URL.revokeObjectURL(url)
  } catch {
    notifier("Export impossible", 'error')
  }
}
const exporterPdf = () => synthese.value && genererSynthesePDF(lignes.value ?? [], synthese.value)
</script>

<template>
  <div class="space-y-4 animate-fadeIn text-sm text-noir">
    <div v-if="notification.text" role="status" :class="[notification.type === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-700 border-red-200', 'p-4 rounded-xl border text-xs font-semibold fixed top-4 right-4 left-4 sm:left-auto z-50 max-w-sm']">
      {{ notification.text }}
    </div>

    <div class="bg-white p-4 rounded-2xl flex flex-wrap items-center gap-3">
      <h1 class="font-display font-bold text-xl flex items-center gap-2 mr-auto"><Wallet2 class="w-5 h-5 text-foret" /> Finances</h1>
      <button @click="exporterPdf" :disabled="!synthese" class="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-foret text-white text-xs font-bold disabled:opacity-50"><FileText class="w-3.5 h-3.5" /> Synthèse audit (PDF)</button>
    </div>

    <div v-onglets class="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Sections des finances">
      <button v-for="o in [{ id: 'budget', label: 'Budget Next Impact' }, { id: 'exploitation', label: 'Exploitation' }, { id: 'taux', label: 'Taux & journal' }]"
        :key="o.id" role="tab" :aria-selected="onglet === o.id" @click="onglet = o.id as any"
        :class="['cursor-pointer px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap border', onglet === o.id ? 'bg-foret text-white border-foret' : 'bg-white text-gris border-creme2']">
        {{ o.label }}
      </button>
    </div>

    <!-- EXPORTS CSV -->
    <div class="bg-white p-4 rounded-2xl flex flex-wrap items-center gap-2">
      <label class="text-[10px] font-bold uppercase text-gris mr-1">Exports CSV
        <select v-model="moisExport" class="ml-1 px-3 py-2 rounded-xl border border-creme2 bg-creme text-xs text-noir font-normal normal-case">
          <option value="">Toute la période</option>
          <option v-for="m in ['M1', 'M2', 'M3', 'M4', 'M5', 'M6']" :key="m" :value="m">{{ m }} (du 26 au 25)</option>
        </select>
      </label>
      <button v-for="e in EXPORTS" :key="e.chemin" @click="exporterCsv(e)" class="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-creme2 text-xs font-bold"><Download class="w-3.5 h-3.5" /> {{ e.libelle }}</button>
    </div>

    <!-- BUDGET -->
    <template v-if="onglet === 'budget'">
      <div v-if="synthese" class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="bg-white rounded-2xl border border-creme2 p-4">
          <p class="text-[10px] uppercase font-bold text-gris">Prévu (convention)</p>
          <p class="text-lg font-bold">{{ formatFCFA(synthese.budget.prevuFcfa) }}</p>
          <p class="text-xs text-gris">{{ formatUSD(synthese.budget.prevuUsd) }}</p>
        </div>
        <div class="bg-white rounded-2xl border border-creme2 p-4">
          <p class="text-[10px] uppercase font-bold text-gris">Engagé</p>
          <p class="text-lg font-bold">{{ formatFCFA(synthese.budget.engageFcfa) }}</p>
          <p class="text-xs text-gris">Absorption : {{ synthese.budget.absorption.toLocaleString('fr-FR') }} %</p>
        </div>
        <div class="bg-white rounded-2xl border border-creme2 p-4">
          <p class="text-[10px] uppercase font-bold text-gris">Justifié (audit)</p>
          <p class="text-lg font-bold">{{ formatFCFA(synthese.budget.justifieFcfa) }}</p>
          <p class="text-xs text-gris">{{ tauxJustifie.toLocaleString('fr-FR') }} % du prévu</p>
        </div>
        <div class="bg-foret text-white rounded-2xl p-4">
          <p class="text-[10px] uppercase font-bold text-white/80">Solde de la subvention</p>
          <p class="text-lg font-bold">{{ formatFCFA(synthese.budget.soldeFcfa) }}</p>
          <p class="text-xs text-white/80">1 USD = {{ synthese.taux }} FCFA</p>
        </div>
      </div>

      <ul v-if="synthese?.budget.alertes.length" class="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-1 text-xs text-red-800" aria-label="Alertes du budget">
        <li v-for="a in synthese.budget.alertes" :key="a.message" class="flex items-start gap-2"><AlertTriangle class="w-3.5 h-3.5 mt-0.5 shrink-0" /> {{ a.message }}</li>
        <li class="text-[11px] text-red-700/80 pl-5">Alerte sans blocage : régularisation à voir avec l'opérateur de la subvention.</li>
      </ul>

      <div v-if="clotures" class="bg-white rounded-2xl border border-creme2 p-4 space-y-3">
        <h2 class="font-bold text-sm">Mois du projet <span class="font-normal text-gris">(du 26 au 25 ; fin officielle de la convention à confirmer)</span></h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <div v-for="c in clotures" :key="c.mois" class="rounded-xl border border-creme2 p-3 text-xs space-y-1" :class="c.close ? 'bg-creme' : ''">
            <p class="font-bold flex items-center gap-1">{{ c.mois }} <Lock v-if="c.close" class="w-3 h-3 text-gris" /></p>
            <p class="text-gris">{{ dateFr(c.du) }} → {{ dateFr(c.au) }}</p>
            <p class="font-semibold">{{ formatFCFA(c.engageFcfa) }}</p>
            <p class="text-gris">{{ c.nbDepenses }} dépense(s)</p>
            <button v-if="ecriture && (!c.close || estAdmin)" @click="changerCloture(c)" class="cursor-pointer inline-flex items-center gap-1 mt-1 px-2 py-1 rounded-lg border border-creme2 font-bold text-[10px]">
              <component :is="c.close ? LockOpen : Lock" class="w-3 h-3" /> {{ c.close ? 'Rouvrir' : 'Clore' }}
            </button>
          </div>
        </div>
        <p v-if="synthese?.budget.sansMois" class="text-[11px] text-amber-800">{{ formatFCFA(synthese.budget.sansMois) }} payés sans mois du projet (avant le début de la convention).</p>
      </div>
      <OngletBudget :lignes="lignes ?? []" :ecriture="ecriture" @notifier="notifier" />
    </template>

    <!-- EXPLOITATION -->
    <template v-if="onglet === 'exploitation'">
      <div class="bg-white rounded-2xl border border-creme2 p-4 flex flex-wrap items-end gap-3">
        <label class="text-[10px] font-bold uppercase text-gris">Du<input v-model="du" type="date" class="mt-1 block px-3 py-2 rounded-xl border border-creme2 bg-creme text-sm text-noir font-normal" /></label>
        <label class="text-[10px] font-bold uppercase text-gris">Au<input v-model="au" type="date" class="mt-1 block px-3 py-2 rounded-xl border border-creme2 bg-creme text-sm text-noir font-normal" /></label>
      </div>
      <p v-if="isLoading" class="text-center text-gris py-6">Calcul de la synthèse...</p>
      <div v-else-if="synthese" class="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div class="bg-white rounded-2xl border border-creme2 p-4">
          <p class="text-[10px] uppercase font-bold text-gris">Encaissé</p>
          <p class="text-base font-bold text-green-800">{{ formatFCFA(synthese.exploitation.encaissements.total) }}</p>
          <p class="text-xs text-gris">{{ synthese.exploitation.encaissements.nombreLivraisons }} livraison(s)</p>
        </div>
        <div class="bg-white rounded-2xl border border-creme2 p-4">
          <p class="text-[10px] uppercase font-bold text-gris">Achats de stock</p>
          <p class="text-base font-bold">{{ formatFCFA(depensesPeriode.achats) }}</p>
          <p class="text-xs text-gris">dont {{ formatFCFA(synthese.exploitation.depenses['Achat stock'].aPayer) }} à payer</p>
        </div>
        <div class="bg-white rounded-2xl border border-creme2 p-4">
          <p class="text-[10px] uppercase font-bold text-gris">Courses livreurs</p>
          <p class="text-base font-bold">{{ formatFCFA(synthese.exploitation.coutLivraison) }}</p>
          <p class="text-xs text-gris">{{ synthese.exploitation.livraisonsEnRetard }} en retard</p>
        </div>
        <div class="bg-white rounded-2xl border border-creme2 p-4">
          <p class="text-[10px] uppercase font-bold text-gris">Autres dépenses</p>
          <p class="text-base font-bold">{{ formatFCFA(depensesPeriode.autres) }}</p>
        </div>
        <div class="col-span-2 lg:col-span-1 bg-foret text-white rounded-2xl p-4">
          <p class="text-[10px] uppercase font-bold text-white/80">Marge de la période</p>
          <p class="text-base font-bold">{{ formatFCFA(synthese.exploitation.marge) }}</p>
        </div>
      </div>
      <ListeDepenses categorie="Exploitation" :ecriture="ecriture" @notifier="notifier" />
    </template>

    <!-- TAUX & JOURNAL -->
    <template v-if="onglet === 'taux'">
      <div class="bg-white rounded-2xl border border-creme2 p-4 space-y-3">
        <h2 class="font-bold text-sm">Taux USD/FCFA : 1 USD = {{ taux?.courant ?? '…' }} FCFA</h2>
        <p class="text-xs text-gris">Taux de la convention de subvention Next Impact : {{ taux?.convention ?? '…' }} FCFA. Chaque dépense garde le taux en vigueur au moment de sa saisie : changer le taux ne modifie pas les dépenses existantes.</p>
        <form v-if="ecriture" @submit.prevent="enregistrerTaux()" class="flex flex-wrap items-end gap-2">
          <label class="text-[10px] font-bold uppercase text-gris">Nouveau taux<input v-model.number="nouveauTaux" required type="number" min="1" step="0.01" class="mt-1 block w-36 px-3 py-2 rounded-xl border border-creme2 bg-creme text-sm text-noir font-normal" /></label>
          <button type="submit" class="cursor-pointer px-3 py-2 rounded-xl bg-foret text-white text-xs font-bold">Enregistrer</button>
          <button v-if="taux && taux.courant !== taux.convention" type="button" @click="enregistrerTaux(taux.convention)" class="cursor-pointer px-3 py-2 rounded-xl border border-foret text-foret text-xs font-bold">
            Revenir à {{ taux.convention }} (convention)
          </button>
        </form>
        <ul class="text-xs divide-y divide-creme2">
          <li v-for="t in taux?.historique" :key="t._id" class="py-2 flex justify-between gap-2">
            <span>1 USD = <strong>{{ t.tauxUsdFcfa }}</strong> FCFA</span>
            <span class="text-gris">{{ dateHeure(t.createdAt) }} · {{ t.creePar?.username }}</span>
          </li>
        </ul>
      </div>

      <div class="bg-white rounded-2xl border border-creme2 p-4 space-y-2">
        <h2 class="font-bold text-sm">Journal des modifications</h2>
        <p class="text-xs text-gris">Qui a modifié quoi, et quand : finances et prix des formules.</p>
        <ul class="text-xs divide-y divide-creme2">
          <li v-for="e in journal?.entrees" :key="e._id" class="py-2.5">
            <p><span class="font-bold">{{ e.action }}</span> · {{ e.resume }}</p>
            <p class="text-gris">{{ dateHeure(e.createdAt) }} · {{ e.utilisateur?.username }} ({{ e.role }})</p>
          </li>
        </ul>
        <div v-if="journal && (pageJournal > 1 || journal.hasMore)" class="flex justify-between text-xs pt-1">
          <button :disabled="pageJournal === 1" @click="pageJournal--" class="px-3 py-1.5 rounded-lg border border-creme2 disabled:opacity-50">← Plus récents</button>
          <button :disabled="!journal.hasMore" @click="pageJournal++" class="px-3 py-1.5 rounded-lg border border-creme2 disabled:opacity-50">Plus anciens →</button>
        </div>
      </div>
    </template>
  </div>
</template>
