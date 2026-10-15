<script setup lang="ts">
import { ref } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { Upload, Plus, Trash2, AlertTriangle } from 'lucide-vue-next'
import Swal from 'sweetalert2'
import api from '@/stores/api'
import { messageErreur } from '@/services/erreurs'
import type { LigneBudget } from '@/type'
import ListeDepenses from './ListeDepenses.vue'

// Budget de la convention Next Impact : lignes (import CSV ou saisie), exécution (engagé, justifié), dépenses
const props = defineProps<{ lignes: LigneBudget[]; ecriture: boolean }>()
const emit = defineEmits<{ notifier: [texte: string, type: 'success' | 'error'] }>()
const queryClient = useQueryClient()

const formatFCFA = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`
const formatUSD = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} USD`
const rafraichir = () => queryClient.invalidateQueries({ queryKey: ['finances'] })

// --- Import CSV : code ; libellé ; prévu USD ; prévu FCFA [; catégorie ; passation] ---
const importEnCours = ref(false)
async function importer(evenement: Event) {
  const champ = evenement.target as HTMLInputElement
  const fichier = champ.files?.[0]
  if (!fichier) return
  importEnCours.value = true
  try {
    const response = await api.post('/api/admin/finances/lignes/import', { csv: await fichier.text() })
    const { message, erreurs } = response.data
    if (erreurs.length) {
      await Swal.fire({ title: message, html: `<p style="font-size:13px;text-align:left">${erreurs.map((e: string) => e.replace(/</g, '&lt;')).join('<br>')}</p>`, icon: 'warning', confirmButtonColor: '#1A5C38' })
    } else emit('notifier', message, 'success')
    rafraichir()
  } catch (err) {
    emit('notifier', messageErreur(err, "Import impossible"), 'error')
  } finally {
    importEnCours.value = false
    champ.value = ''
  }
}

// --- Saisie d'une ligne ---
const formOuvert = ref(false)
const ligneVide = () => ({ code: '', libelle: '', montantPrevuUsd: 0, montantPrevuFcfa: 0, categorieAd: '' as '' | 1 | 2, passation: '' })
const ligne = ref(ligneVide())
async function ajouterLigne() {
  try {
    await api.post('/api/admin/finances/lignes', ligne.value)
    emit('notifier', `Ligne ${ligne.value.code} ajoutée.`, 'success')
    ligne.value = ligneVide()
    formOuvert.value = false
    rafraichir()
  } catch (err) {
    emit('notifier', messageErreur(err, "Ajout impossible"), 'error')
  }
}

async function supprimerLigne(l: LigneBudget) {
  const choix = await Swal.fire({ title: `Supprimer la ligne ${l.code} ?`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#1A5C38', confirmButtonText: 'Supprimer', cancelButtonText: 'Annuler' })
  if (!choix.isConfirmed) return
  try {
    await api.delete(`/api/admin/finances/lignes/${l._id}`)
    emit('notifier', `Ligne ${l.code} supprimée.`, 'success')
    rafraichir()
  } catch (err) {
    emit('notifier', messageErreur(err, 'Suppression impossible'), 'error')
  }
}

const couleurExecution = (taux: number) => taux > 100 ? 'bg-red-500' : taux >= 80 ? 'bg-or' : 'bg-savane'
const champ = 'mt-1 w-full px-3 py-2 rounded-lg border border-creme2 bg-white text-sm font-normal normal-case text-noir'
</script>

<template>
  <div class="space-y-4">
    <div class="bg-white rounded-2xl border border-creme2 p-4 space-y-3">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="font-bold text-sm mr-auto">Lignes budgétaires <span class="text-gris font-normal">({{ props.lignes.length }})</span></h2>
        <template v-if="ecriture">
          <label class="cursor-pointer inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-creme2 text-xs font-bold">
            <Upload class="w-3.5 h-3.5" /> {{ importEnCours ? 'Import...' : 'Importer un CSV' }}
            <input type="file" accept=".csv,text/csv" class="sr-only" @change="importer" />
          </label>
          <button @click="formOuvert = !formOuvert" class="cursor-pointer inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-foret text-white text-xs font-bold"><Plus class="w-3.5 h-3.5" /> Ligne</button>
        </template>
      </div>
      <p class="text-[11px] text-gris">CSV attendu (Excel, séparateur « ; ») : <code>code ; libellé ; prévu USD ; prévu FCFA ; catégorie ; passation</code> (les deux dernières colonnes sont facultatives), avec ou sans ligne d'en-tête. Un code déjà présent est mis à jour.</p>

      <form v-if="formOuvert" @submit.prevent="ajouterLigne" class="grid grid-cols-2 lg:grid-cols-6 gap-2 p-3 rounded-xl bg-creme/60 border border-creme2 text-xs">
        <label class="font-bold uppercase text-[10px] text-gris">Code<input v-model="ligne.code" required :class="champ" placeholder="L1" /></label>
        <label class="col-span-2 lg:col-span-2 font-bold uppercase text-[10px] text-gris">Libellé<input v-model="ligne.libelle" required :class="champ" /></label>
        <label class="font-bold uppercase text-[10px] text-gris">Prévu USD<input v-model.number="ligne.montantPrevuUsd" type="number" min="0" step="0.01" :class="champ" /></label>
        <label class="font-bold uppercase text-[10px] text-gris">Prévu FCFA<input v-model.number="ligne.montantPrevuFcfa" type="number" min="0" :class="champ" /></label>
        <label class="font-bold uppercase text-[10px] text-gris">Catégorie
          <select v-model="ligne.categorieAd" :class="champ">
            <option value="">—</option>
            <option :value="1">1 · biens, services</option>
            <option :value="2">2 · consultants</option>
          </select>
        </label>
        <label class="col-span-2 lg:col-span-6 font-bold uppercase text-[10px] text-gris">Mode de passation<input v-model="ligne.passation" :class="champ" placeholder="Ex : Achat direct" /></label>
        <button type="submit" class="cursor-pointer col-span-2 lg:col-span-6 px-3 py-2 rounded-xl bg-foret text-white font-bold">Ajouter la ligne</button>
      </form>

      <p v-if="!props.lignes.length" class="text-center text-gris py-6 border border-dashed border-creme2 rounded-xl text-xs">Aucune ligne : importez le budget de la convention.</p>
      <div v-defilable="'Lignes budgétaires'" v-else class="overflow-x-auto">
        <table class="w-full text-left text-xs border-collapse min-w-180">
          <thead>
            <tr class="text-[10px] uppercase tracking-wider text-gris border-b border-creme2">
              <th class="py-2 pr-2">Ligne</th><th class="py-2 pr-2">Libellé</th>
              <th class="py-2 pr-2 text-right">Prévu</th><th class="py-2 pr-2 text-right">Engagé</th>
              <th class="py-2 pr-2 text-right">Justifié</th><th class="py-2 pr-2 text-right">Reste</th>
              <th class="py-2 pr-2 w-32">Exécution</th><th class="py-2"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-creme2">
            <tr v-for="l in props.lignes" :key="l._id" :class="l.depassementFcfa ? 'bg-red-50/40' : ''">
              <td class="py-2.5 pr-2 font-bold">{{ l.code }}<span v-if="l.categorieAd" class="block text-[10px] font-normal text-gris">cat. {{ l.categorieAd }}</span></td>
              <td class="py-2.5 pr-2">{{ l.libelle }}<span class="block text-gris">{{ l.nbDepenses }} dépense(s)<template v-if="l.passation"> · {{ l.passation }}</template></span></td>
              <td class="py-2.5 pr-2 text-right whitespace-nowrap">{{ formatFCFA(l.montantPrevuFcfa) }}<span class="block text-gris">{{ formatUSD(l.montantPrevuUsd) }}</span></td>
              <td class="py-2.5 pr-2 text-right whitespace-nowrap font-semibold">{{ formatFCFA(l.engageFcfa) }}</td>
              <td class="py-2.5 pr-2 text-right whitespace-nowrap">{{ formatFCFA(l.justifieFcfa) }}<span class="block text-gris">{{ l.tauxJustifie.toLocaleString('fr-FR') }} %</span></td>
              <td class="py-2.5 pr-2 text-right whitespace-nowrap">
                <span v-if="l.depassementFcfa" class="inline-flex items-center gap-1 font-bold text-red-700"><AlertTriangle class="w-3.5 h-3.5" /> −{{ formatFCFA(l.depassementFcfa) }}</span>
                <span v-else>{{ formatFCFA(l.resteFcfa) }}</span>
              </td>
              <td class="py-2.5 pr-2">
                <div class="h-2 rounded-full bg-creme2 overflow-hidden" role="progressbar" :aria-valuenow="l.tauxExecution" aria-valuemin="0" aria-valuemax="100" :aria-label="`Exécution de la ligne ${l.code}`">
                  <div :class="['h-full rounded-full', couleurExecution(l.tauxExecution)]" :style="{ width: `${Math.min(l.tauxExecution, 100)}%` }"></div>
                </div>
                <span class="text-[10px] font-bold">{{ l.tauxExecution.toLocaleString('fr-FR') }} %</span>
              </td>
              <td class="py-2.5 text-right">
                <button v-if="ecriture && !l.nbDepenses" @click="supprimerLigne(l)" class="cursor-pointer p-1.5 text-gris hover:text-red-600" :aria-label="`Supprimer la ligne ${l.code}`"><Trash2 class="w-3.5 h-3.5" /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text-[11px] text-gris">Engagé : dépenses payées (montant réel) et prévues non payées. Justifié : dépenses payées dont toutes les pièces exigées sont jointes. Un dépassement est signalé sans bloquer la saisie.</p>
    </div>

    <ListeDepenses categorie="Budget" :ecriture="ecriture" :lignes="props.lignes" @notifier="(t, type) => emit('notifier', t, type)" />
  </div>
</template>
