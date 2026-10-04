<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useQuery, useQueries } from '@tanstack/vue-query'
import { Sliders, FileText, Info } from 'lucide-vue-next'
import api from '@/stores/api'
import { genererSimulationPDF, fcfaPDF } from '@/services/pdfSimulateurs'

// Simulateurs en lecture seule : coût et marge d'un pack, prévision d'achats, seuil de rentabilité.
// Aucun prix n'est appliqué ici : le prix de vente se fixe dans « Formules ».

interface SimulationPack {
  formule: { nom: string; slug: string; prixVente: number }
  lignes: { produit: string; unite: string; quantite: number; prixCatalogue: number; coutCatalogue: number; prixAchatReel: number | null; coutReel: number }[]
  produitsSansAchat: number
  frais: { livraison: number; emballage: number; commission: number }
  totaux: { coutCatalogue: number; coutReel: number; frais: number; margeCatalogue: number; margeReelle: number; tauxMargeCatalogue: number; tauxMargeReelle: number }
}
interface SimulationAchats {
  lignes: { produit: string; unite: string; besoin: number; disponible: number; aAcheter: number; prixEstime: number; coutEstime: number }[]
  coutTotal: number
  produitsARacheter: number
}

const PACKS = [
  { type: 'essentiel', nom: 'AHI Essentiel' },
  { type: 'equilibre', nom: 'AHI Équilibré' },
  { type: 'confort', nom: 'AHI Confort' },
  { type: 'reserve', nom: 'AHI Réserve' },
  { type: 'fraicheur', nom: 'AHI Fraîcheur' },
] as const
const PACKS_OUVERTS = PACKS.slice(0, 3) // Réserve et Fraîcheur ouvrent après le lancement

const onglet = ref<'pack' | 'achats' | 'seuil'>('pack')
const formatFCFA = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`
const formatNombre = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
const formatPourcent = (n: number) => `${n.toLocaleString('fr-FR')} %`

// Frais paramétrables, à 0 par défaut (question 14) : partagés par les trois simulateurs
const frais = reactive({ livraison: 0, emballage: 0, commission: 0 })

// --- (a) Coût et marge d'un pack ---
const packChoisi = ref<typeof PACKS[number]['type']>('essentiel')
const { data: simulation, isLoading: chargementPack, error: erreurPack } = useQuery({
  queryKey: ['simulateur', 'pack', packChoisi, () => ({ ...frais })],
  queryFn: async (): Promise<SimulationPack> => (await api.get(`/api/admin/simulateurs/pack/${packChoisi.value}`, { params: { ...frais } })).data,
})

function exporterPack() {
  const s = simulation.value
  if (!s) return
  genererSimulationPDF(`Coût et marge ${s.formule.nom}`, [
    `Prix de vente : ${fcfaPDF(s.formule.prixVente)}`,
    `Frais : livraison ${fcfaPDF(s.frais.livraison)}, emballage ${fcfaPDF(s.frais.emballage)}, commission Mobile Money ${fcfaPDF(s.frais.commission)}`,
  ], [{
    titre: 'Composition',
    entetes: ['Produit', 'Quantité', 'Coût catalogue', 'Coût réel'],
    lignes: s.lignes.map(l => [l.produit, `${formatNombre(l.quantite)} ${l.unite}`, fcfaPDF(l.coutCatalogue), fcfaPDF(l.coutReel) + (l.prixAchatReel === null ? ' *' : '')]),
    pied: ['Marge', '', `${fcfaPDF(s.totaux.margeCatalogue)} (${s.totaux.tauxMargeCatalogue} %)`, `${fcfaPDF(s.totaux.margeReelle)} (${s.totaux.tauxMargeReelle} %)`],
  }])
}

// --- (b) Prévision d'achats pour N commandes ---
const commandesPrevues = reactive<Record<string, number>>({ essentiel: 0, equilibre: 0, confort: 0, reserve: 0, fraicheur: 0 })
const achats = ref<SimulationAchats | null>(null)
const erreurAchats = ref('')
const calculAchats = ref(false)

async function simulerAchats() {
  calculAchats.value = true
  erreurAchats.value = ''
  try {
    achats.value = (await api.post('/api/admin/simulateurs/achats', { quantites: commandesPrevues })).data
  } catch (err: any) {
    achats.value = null
    erreurAchats.value = err.response?.data?.message || 'Simulation impossible'
  } finally {
    calculAchats.value = false
  }
}

function exporterAchats() {
  const a = achats.value
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

// --- (c) Seuil de rentabilité et objectif de chiffre d'affaires ---
// Marge réelle unitaire de chaque formule ouverte, avec les mêmes frais
const simulationsOuvertes = useQueries({
  queries: computed(() => PACKS_OUVERTS.map(p => ({
    queryKey: ['simulateur', 'pack', p.type, { ...frais }],
    queryFn: async (): Promise<SimulationPack> => (await api.get(`/api/admin/simulateurs/pack/${p.type}`, { params: { ...frais } })).data,
    enabled: onglet.value === 'seuil',
  }))),
})
const repartition = reactive<Record<string, number>>({ essentiel: 30, equilibre: 50, confort: 20 }) // en % des commandes
const chargesFixes = ref(300000) // FCFA par mois
const objectifCa = ref(2000000) // FCFA par mois

const seuil = computed(() => {
  const sims = simulationsOuvertes.value.map(q => q.data)
  if (sims.some(s => !s)) return null
  const totalPart = PACKS_OUVERTS.reduce((s, p) => s + (repartition[p.type] || 0), 0)
  if (!totalPart) return null
  const poids = PACKS_OUVERTS.map(p => (repartition[p.type] || 0) / totalPart)
  const prixMoyen = sims.reduce((s, sim, i) => s + sim!.formule.prixVente * poids[i]!, 0)
  const margeMoyenne = sims.reduce((s, sim, i) => s + sim!.totaux.margeReelle * poids[i]!, 0)
  const commandesSeuil = margeMoyenne > 0 ? Math.ceil(chargesFixes.value / margeMoyenne) : null
  const commandesObjectif = prixMoyen > 0 ? Math.ceil(objectifCa.value / prixMoyen) : 0
  return {
    prixMoyen, margeMoyenne, commandesSeuil,
    caSeuil: commandesSeuil !== null ? commandesSeuil * prixMoyen : null,
    commandesObjectif,
    resultatObjectif: commandesObjectif * margeMoyenne - chargesFixes.value,
    detail: PACKS_OUVERTS.map((p, i) => ({ nom: p.nom, part: Math.round(poids[i]! * 100), prix: sims[i]!.formule.prixVente, marge: sims[i]!.totaux.margeReelle }))
  }
})

function exporterSeuil() {
  const s = seuil.value
  if (!s) return
  genererSimulationPDF('Seuil de rentabilité', [
    `Charges fixes mensuelles : ${fcfaPDF(chargesFixes.value)}`,
    `Objectif de chiffre d'affaires mensuel : ${fcfaPDF(objectifCa.value)}`,
    `Frais par commande : livraison ${fcfaPDF(frais.livraison)}, emballage ${fcfaPDF(frais.emballage)}, commission ${frais.commission} %`,
  ], [{
    titre: 'Répartition et marge par formule (coût réel)',
    entetes: ['Formule', 'Part des commandes', 'Prix de vente', 'Marge unitaire'],
    lignes: s.detail.map(d => [d.nom, `${d.part} %`, fcfaPDF(d.prix), fcfaPDF(d.marge)]),
  }, {
    titre: 'Résultat',
    entetes: ['Indicateur', 'Valeur'],
    lignes: [
      ['Commandes par mois pour couvrir les charges', s.commandesSeuil ?? 'Marge moyenne négative'],
      ['Chiffre d\'affaires au seuil', s.caSeuil !== null ? fcfaPDF(s.caSeuil) : '-'],
      ['Commandes pour atteindre l\'objectif', s.commandesObjectif],
      ['Résultat mensuel à l\'objectif', fcfaPDF(s.resultatObjectif)],
    ],
  }])
}
</script>

<template>
  <div class="space-y-4 animate-fadeIn text-sm text-noir">
    <div class="bg-white p-4 rounded-2xl space-y-2">
      <h1 class="font-display font-bold text-xl flex items-center gap-2"><Sliders class="w-5 h-5 text-foret" /> Simulateurs</h1>
      <p class="text-xs text-gris flex items-start gap-1.5"><Info class="w-3.5 h-3.5 shrink-0 mt-0.5" /> Outils de calcul uniquement : rien n'est enregistré et aucun prix n'est modifié. Le prix de vente se fixe dans « Formules ».</p>
    </div>

    <!-- Frais communs -->
    <div class="bg-white rounded-2xl border border-creme2 p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
      <label class="text-[10px] font-bold uppercase text-gris">Livraison (FCFA / commande)<input v-model.number="frais.livraison" type="number" min="0" step="100" class="mt-1 w-full px-3 py-2 rounded-xl border border-creme2 bg-creme text-sm text-noir font-normal" /></label>
      <label class="text-[10px] font-bold uppercase text-gris">Emballage (FCFA / commande)<input v-model.number="frais.emballage" type="number" min="0" step="50" class="mt-1 w-full px-3 py-2 rounded-xl border border-creme2 bg-creme text-sm text-noir font-normal" /></label>
      <label class="text-[10px] font-bold uppercase text-gris">Commission Mobile Money (%)<input v-model.number="frais.commission" type="number" min="0" max="100" step="0.1" class="mt-1 w-full px-3 py-2 rounded-xl border border-creme2 bg-creme text-sm text-noir font-normal" /></label>
    </div>

    <div class="flex gap-2 overflow-x-auto pb-1" role="tablist">
      <button v-for="o in [{ id: 'pack', label: 'Coût et marge d\'un pack' }, { id: 'achats', label: 'Prévision d\'achats' }, { id: 'seuil', label: 'Seuil de rentabilité' }]"
        :key="o.id" role="tab" :aria-selected="onglet === o.id" @click="onglet = o.id as any"
        :class="['cursor-pointer px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap border', onglet === o.id ? 'bg-foret text-white border-foret' : 'bg-white text-gris border-creme2']">
        {{ o.label }}
      </button>
    </div>

    <!-- (a) PACK -->
    <section v-if="onglet === 'pack'" class="bg-white rounded-2xl border border-creme2 p-4 space-y-4">
      <div class="flex flex-wrap items-end gap-3">
        <label class="text-[10px] font-bold uppercase text-gris">Formule
          <select v-model="packChoisi" class="mt-1 block px-3 py-2 rounded-xl border border-creme2 bg-creme text-sm text-noir font-normal normal-case">
            <option v-for="p in PACKS" :key="p.type" :value="p.type">{{ p.nom }}</option>
          </select>
        </label>
        <button @click="exporterPack" :disabled="!simulation" class="cursor-pointer ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-foret text-white text-xs font-bold disabled:opacity-50"><FileText class="w-3.5 h-3.5" /> PDF</button>
      </div>
      <p v-if="chargementPack" class="text-gris text-center py-4">Calcul...</p>
      <p v-else-if="erreurPack" class="text-red-700 text-xs">{{ (erreurPack as any)?.response?.data?.message || 'Simulation impossible' }}</p>
      <template v-else-if="simulation">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div class="rounded-xl bg-creme p-3"><p class="text-[10px] uppercase font-bold text-gris">Prix de vente</p><p class="font-bold">{{ formatFCFA(simulation.formule.prixVente) }}</p></div>
          <div class="rounded-xl bg-creme p-3"><p class="text-[10px] uppercase font-bold text-gris">Frais</p><p class="font-bold">{{ formatFCFA(simulation.totaux.frais) }}</p></div>
          <div class="rounded-xl bg-creme p-3"><p class="text-[10px] uppercase font-bold text-gris">Marge (catalogue)</p><p class="font-bold">{{ formatFCFA(simulation.totaux.margeCatalogue) }}</p><p class="text-xs text-gris">{{ formatPourcent(simulation.totaux.tauxMargeCatalogue) }}</p></div>
          <div :class="['rounded-xl p-3', simulation.totaux.margeReelle >= 0 ? 'bg-foret text-white' : 'bg-red-50 text-red-800']"><p class="text-[10px] uppercase font-bold opacity-80">Marge (coût réel)</p><p class="font-bold">{{ formatFCFA(simulation.totaux.margeReelle) }}</p><p class="text-xs opacity-80">{{ formatPourcent(simulation.totaux.tauxMargeReelle) }}</p></div>
        </div>
        <p v-if="simulation.produitsSansAchat" class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5">* {{ simulation.produitsSansAchat }} produit(s) sans achat enregistré : leur coût réel reprend le prix catalogue.</p>
        <p v-if="!simulation.lignes.length" class="text-xs text-gris text-center py-4 border border-dashed border-creme2 rounded-xl">Aucun produit dans la composition : complétez le catalogue (Produits, Règles de composition).</p>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse min-w-130">
            <thead><tr class="text-[10px] uppercase tracking-wider text-gris border-b border-creme2">
              <th class="py-2 pr-2">Produit</th><th class="py-2 pr-2 text-right">Quantité</th><th class="py-2 pr-2 text-right">Coût catalogue</th><th class="py-2 text-right">Coût réel</th>
            </tr></thead>
            <tbody class="divide-y divide-creme2">
              <tr v-for="l in simulation.lignes" :key="l.produit">
                <td class="py-2 pr-2 font-semibold">{{ l.produit }}</td>
                <td class="py-2 pr-2 text-right whitespace-nowrap">{{ formatNombre(l.quantite) }} {{ l.unite }}</td>
                <td class="py-2 pr-2 text-right whitespace-nowrap">{{ formatFCFA(l.coutCatalogue) }}<span class="block text-gris">{{ formatFCFA(l.prixCatalogue) }} / {{ l.unite }}</span></td>
                <td class="py-2 text-right whitespace-nowrap">{{ formatFCFA(l.coutReel) }}<span v-if="l.prixAchatReel !== null" class="block text-gris">{{ formatFCFA(l.prixAchatReel) }} / {{ l.unite }}</span><span v-else class="block text-amber-700">*</span></td>
              </tr>
            </tbody>
            <tfoot><tr class="font-bold border-t border-creme2">
              <td class="py-2 pr-2" colspan="2">Total produits</td>
              <td class="py-2 pr-2 text-right">{{ formatFCFA(simulation.totaux.coutCatalogue) }}</td>
              <td class="py-2 text-right">{{ formatFCFA(simulation.totaux.coutReel) }}</td>
            </tr></tfoot>
          </table>
        </div>
      </template>
    </section>

    <!-- (b) ACHATS -->
    <section v-if="onglet === 'achats'" class="bg-white rounded-2xl border border-creme2 p-4 space-y-4">
      <form @submit.prevent="simulerAchats" class="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <label v-for="p in PACKS" :key="p.type" class="text-[10px] font-bold uppercase text-gris">{{ p.nom }}
          <input v-model.number="commandesPrevues[p.type]" type="number" min="0" step="1" class="mt-1 w-full px-3 py-2 rounded-xl border border-creme2 bg-creme text-sm text-noir font-normal" />
        </label>
        <button type="submit" :disabled="calculAchats" class="cursor-pointer col-span-2 sm:col-span-5 px-3 py-2.5 rounded-xl bg-foret text-white text-xs font-bold disabled:opacity-50">Calculer les achats</button>
      </form>
      <p v-if="erreurAchats" class="text-red-700 text-xs">{{ erreurAchats }}</p>
      <template v-if="achats">
        <div class="flex flex-wrap items-center gap-3">
          <p class="font-bold">{{ achats.produitsARacheter }} produit(s) à acheter · {{ formatFCFA(achats.coutTotal) }}</p>
          <button @click="exporterAchats" class="cursor-pointer ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-foret text-white text-xs font-bold"><FileText class="w-3.5 h-3.5" /> PDF</button>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse min-w-130">
            <thead><tr class="text-[10px] uppercase tracking-wider text-gris border-b border-creme2">
              <th class="py-2 pr-2">Produit</th><th class="py-2 pr-2 text-right">Besoin</th><th class="py-2 pr-2 text-right">En stock</th><th class="py-2 pr-2 text-right">À acheter</th><th class="py-2 text-right">Coût estimé</th>
            </tr></thead>
            <tbody class="divide-y divide-creme2">
              <tr v-for="l in achats.lignes" :key="l.produit" :class="!l.aAcheter ? 'text-gris' : ''">
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

    <!-- (c) SEUIL -->
    <section v-if="onglet === 'seuil'" class="bg-white rounded-2xl border border-creme2 p-4 space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label class="text-[10px] font-bold uppercase text-gris">Charges fixes (FCFA / mois)<input v-model.number="chargesFixes" type="number" min="0" step="10000" class="mt-1 w-full px-3 py-2 rounded-xl border border-creme2 bg-creme text-sm text-noir font-normal" /></label>
        <label class="text-[10px] font-bold uppercase text-gris">Objectif de chiffre d'affaires (FCFA / mois)<input v-model.number="objectifCa" type="number" min="0" step="50000" class="mt-1 w-full px-3 py-2 rounded-xl border border-creme2 bg-creme text-sm text-noir font-normal" /></label>
      </div>
      <fieldset class="grid grid-cols-3 gap-3">
        <legend class="text-[10px] font-bold uppercase text-gris mb-1">Répartition des commandes (%)</legend>
        <label v-for="p in PACKS_OUVERTS" :key="p.type" class="text-[10px] font-bold uppercase text-gris">{{ p.nom }}
          <input v-model.number="repartition[p.type]" type="number" min="0" max="100" class="mt-1 w-full px-3 py-2 rounded-xl border border-creme2 bg-creme text-sm text-noir font-normal" />
        </label>
      </fieldset>
      <p v-if="!seuil" class="text-gris text-center py-4">Calcul des marges par formule...</p>
      <template v-else>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div class="rounded-xl bg-creme p-3"><p class="text-[10px] uppercase font-bold text-gris">Prix moyen</p><p class="font-bold">{{ formatFCFA(seuil.prixMoyen) }}</p></div>
          <div class="rounded-xl bg-creme p-3"><p class="text-[10px] uppercase font-bold text-gris">Marge moyenne</p><p class="font-bold">{{ formatFCFA(seuil.margeMoyenne) }}</p></div>
          <div class="rounded-xl bg-foret text-white p-3"><p class="text-[10px] uppercase font-bold opacity-80">Seuil (commandes / mois)</p><p class="font-bold">{{ seuil.commandesSeuil ?? 'Inatteignable' }}</p><p v-if="seuil.caSeuil !== null" class="text-xs opacity-80">soit {{ formatFCFA(seuil.caSeuil) }}</p></div>
          <div class="rounded-xl bg-creme p-3"><p class="text-[10px] uppercase font-bold text-gris">Objectif</p><p class="font-bold">{{ seuil.commandesObjectif }} commandes</p><p :class="['text-xs', seuil.resultatObjectif >= 0 ? 'text-green-800' : 'text-red-700']">résultat {{ formatFCFA(seuil.resultatObjectif) }}</p></div>
        </div>
        <p v-if="seuil.commandesSeuil === null" class="text-xs text-red-700">La marge moyenne est négative : aucun volume ne couvre les charges avec ces prix et ces frais.</p>
        <button @click="exporterSeuil" class="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-foret text-white text-xs font-bold"><FileText class="w-3.5 h-3.5" /> PDF</button>
      </template>
    </section>
  </div>
</template>
