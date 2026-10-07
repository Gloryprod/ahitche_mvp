<script setup lang="ts">
import { ref, reactive } from 'vue'
import { ShoppingCart, FileText, Info } from 'lucide-vue-next'
import api from '@/stores/api'
import { genererSimulationPDF, fcfaPDF } from '@/services/pdfSimulateurs'

// Prévision d'achats pour N commandes (section Stock, gestionnaires compris) : besoins par produit,
// stock disponible, quantité et coût d'achat estimé. Aucune marge ni prix de vente n'y figure.

interface PrevisionAchats {
  lignes: { produit: string; unite: string; besoin: number; disponible: number; aAcheter: number; prixEstime: number | null; coutEstime: number | null }[]
  coutTotal: number
  produitsARacheter: number
  prixManquants: number
}

const PACKS = [
  { type: 'essentiel', nom: 'AHI Essentiel' },
  { type: 'equilibre', nom: 'AHI Équilibré' },
  { type: 'confort', nom: 'AHI Confort' },
  { type: 'reserve', nom: 'AHI Réserve' },
  { type: 'fraicheur', nom: 'AHI Fraîcheur' },
] as const

const formatFCFA = (n: number | null) => n === null ? 'à renseigner' : `${Math.round(n).toLocaleString('fr-FR')} FCFA`
const formatNombre = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })

const commandesPrevues = reactive<Record<string, number>>({ essentiel: 0, equilibre: 0, confort: 0, reserve: 0, fraicheur: 0 })
const prevision = ref<PrevisionAchats | null>(null)
const erreur = ref('')
const calcul = ref(false)

async function calculer() {
  calcul.value = true
  erreur.value = ''
  try {
    prevision.value = (await api.get('/api/admin/stock/prevision-achats', { params: { ...commandesPrevues } })).data
  } catch (err: any) {
    prevision.value = null
    erreur.value = err.response?.data?.message || 'Calcul impossible'
  } finally {
    calcul.value = false
  }
}

function exporter() {
  const a = prevision.value
  if (!a) return
  genererSimulationPDF("Prévision d'achats", [
    `Commandes prévues : ${PACKS.filter(p => commandesPrevues[p.type]).map(p => `${commandesPrevues[p.type]} ${p.nom}`).join(', ')}`,
    'Prix estimé : prix d\'achat réel moyen du stock, sinon dernier achat, sinon prix catalogue',
  ], [{
    titre: 'Besoins et achats',
    entetes: ['Produit', 'Besoin', 'En stock', 'À acheter', 'Coût estimé'],
    lignes: a.lignes.map(l => [l.produit, `${formatNombre(l.besoin)} ${l.unite}`, formatNombre(l.disponible), formatNombre(l.aAcheter), fcfaPDF(l.coutEstime)]),
    pied: ['Total', '', '', `${a.produitsARacheter} produit(s)`, fcfaPDF(a.coutTotal)],
  }])
}

const champ = 'mt-1 w-full px-3 py-2 rounded-xl border border-creme2 bg-creme text-sm text-noir font-normal'
</script>

<template>
  <div class="space-y-4 animate-fadeIn text-sm text-noir">
    <div class="bg-white p-4 rounded-2xl space-y-2">
      <h1 class="font-display font-bold text-xl flex items-center gap-2"><ShoppingCart class="w-5 h-5 text-foret" /> Prévision d'achats</h1>
      <p class="text-xs text-gris flex items-start gap-1.5"><Info class="w-3.5 h-3.5 shrink-0 mt-0.5" /> Indiquez le nombre de commandes prévues par formule : le calcul donne les quantités à acheter, compte tenu du stock disponible (les lots à compter ne sont pas comptés).</p>
    </div>

    <section class="bg-white rounded-2xl border border-creme2 p-4 space-y-4">
      <form @submit.prevent="calculer" class="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <label v-for="p in PACKS" :key="p.type" class="text-[10px] font-bold uppercase text-gris">{{ p.nom }}
          <input v-model.number="commandesPrevues[p.type]" type="number" min="0" step="1" :class="champ" />
        </label>
        <button type="submit" :disabled="calcul" class="cursor-pointer col-span-2 sm:col-span-5 px-3 py-2.5 rounded-xl bg-foret text-white text-xs font-bold disabled:opacity-50">Calculer les achats</button>
      </form>
      <p v-if="erreur" role="alert" class="text-red-700 text-xs">{{ erreur }}</p>
      <template v-if="prevision">
        <div class="flex flex-wrap items-center gap-3">
          <p class="font-bold">{{ prevision.produitsARacheter }} produit(s) à acheter · {{ formatFCFA(prevision.coutTotal) }}</p>
          <button @click="exporter" class="cursor-pointer ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-foret text-white text-xs font-bold"><FileText class="w-3.5 h-3.5" /> PDF</button>
        </div>
        <p v-if="prevision.prixManquants" class="text-xs text-amber-800">{{ prevision.prixManquants }} produit(s) sans prix : coût total incomplet.</p>
        <div v-defilable="'Besoins et achats'" class="overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse min-w-130">
            <thead><tr class="text-[10px] uppercase tracking-wider text-gris border-b border-creme2">
              <th class="py-2 pr-2">Produit</th><th class="py-2 pr-2 text-right">Besoin</th><th class="py-2 pr-2 text-right">En stock</th><th class="py-2 pr-2 text-right">À acheter</th><th class="py-2 text-right">Coût estimé</th>
            </tr></thead>
            <tbody class="divide-y divide-creme2">
              <tr v-for="l in prevision.lignes" :key="l.produit" :class="!l.aAcheter ? 'text-gris' : ''">
                <td class="py-2 pr-2 font-semibold">{{ l.produit }}</td>
                <td class="py-2 pr-2 text-right whitespace-nowrap">{{ formatNombre(l.besoin) }} {{ l.unite }}</td>
                <td class="py-2 pr-2 text-right">{{ formatNombre(l.disponible) }}</td>
                <td class="py-2 pr-2 text-right font-bold">{{ formatNombre(l.aAcheter) }}</td>
                <td class="py-2 text-right whitespace-nowrap">{{ formatFCFA(l.coutEstime) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </section>
  </div>
</template>
