<script setup lang="ts">
import { ref, computed } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { Wallet2, Download, FileText } from 'lucide-vue-next'
import api from '@/stores/api'
import type { LigneBudget, SyntheseFinances } from '@/type'
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
  queryFn: async () => (await api.get('/api/admin/finances/taux')).data as { courant: number; historique: { _id: string; tauxUsdFcfa: number; createdAt: string; creePar?: { username: string } }[] },
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
const executionBudget = computed(() => {
  const b = synthese.value?.budget
  return b && b.prevuFcfa ? Math.round((b.reelFcfa / b.prevuFcfa) * 1000) / 10 : 0
})

// --- Taux ---
const nouveauTaux = ref<number | null>(null)
async function enregistrerTaux() {
  try {
    const response = await api.post('/api/admin/finances/taux', { tauxUsdFcfa: nouveauTaux.value })
    notifier(response.data.message, 'success')
    nouveauTaux.value = null
    queryClient.invalidateQueries({ queryKey: ['finances'] })
  } catch (err: any) {
    notifier(err.response?.data?.message || 'Enregistrement impossible', 'error')
  }
}

// --- Exports ---
async function exporterCsv() {
  try {
    const response = await api.get('/api/admin/finances/depenses/export', { responseType: 'blob' })
    const url = URL.createObjectURL(response.data)
    const lien = Object.assign(document.createElement('a'), { href: url, download: `depenses-ahitche-${aujourdhui}.csv` })
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
      <button @click="exporterCsv" class="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-creme2 text-xs font-bold"><Download class="w-3.5 h-3.5" /> Dépenses (CSV)</button>
      <button @click="exporterPdf" :disabled="!synthese" class="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-foret text-white text-xs font-bold disabled:opacity-50"><FileText class="w-3.5 h-3.5" /> Synthèse audit (PDF)</button>
    </div>

    <div class="flex gap-2 overflow-x-auto pb-1" role="tablist">
      <button v-for="o in [{ id: 'budget', label: 'Budget Next Impact' }, { id: 'exploitation', label: 'Exploitation' }, { id: 'taux', label: 'Taux & journal' }]"
        :key="o.id" role="tab" :aria-selected="onglet === o.id" @click="onglet = o.id as any"
        :class="['cursor-pointer px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap border', onglet === o.id ? 'bg-foret text-white border-foret' : 'bg-white text-gris border-creme2']">
        {{ o.label }}
      </button>
    </div>

    <!-- BUDGET -->
    <template v-if="onglet === 'budget'">
      <div v-if="synthese" class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="bg-white rounded-2xl border border-creme2 p-4">
          <p class="text-[10px] uppercase font-bold text-gris">Prévu (convention)</p>
          <p class="text-lg font-bold">{{ formatFCFA(synthese.budget.prevuFcfa) }}</p>
          <p class="text-xs text-gris">{{ formatUSD(synthese.budget.prevuUsd) }}</p>
        </div>
        <div class="bg-white rounded-2xl border border-creme2 p-4">
          <p class="text-[10px] uppercase font-bold text-gris">Réalisé (retenu pour l'audit)</p>
          <p class="text-lg font-bold">{{ formatFCFA(synthese.budget.reelFcfa) }}</p>
          <p class="text-xs text-gris">{{ formatUSD(synthese.budget.reelUsd) }}</p>
        </div>
        <div class="bg-white rounded-2xl border border-creme2 p-4">
          <p class="text-[10px] uppercase font-bold text-gris">Exécution</p>
          <p class="text-lg font-bold">{{ executionBudget.toLocaleString('fr-FR') }} %</p>
          <p class="text-xs text-gris">Taux en vigueur : 1 USD = {{ synthese.taux }} FCFA</p>
        </div>
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
        <p class="text-xs text-gris">Chaque dépense garde le taux en vigueur au moment de sa saisie. Changer le taux ne modifie pas les dépenses existantes.</p>
        <form v-if="ecriture" @submit.prevent="enregistrerTaux" class="flex flex-wrap items-end gap-2">
          <label class="text-[10px] font-bold uppercase text-gris">Nouveau taux<input v-model.number="nouveauTaux" required type="number" min="1" step="0.01" class="mt-1 block w-36 px-3 py-2 rounded-xl border border-creme2 bg-creme text-sm text-noir font-normal" /></label>
          <button type="submit" class="cursor-pointer px-3 py-2 rounded-xl bg-foret text-white text-xs font-bold">Enregistrer</button>
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
