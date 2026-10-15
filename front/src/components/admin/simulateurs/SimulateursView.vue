<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { useQuery, useQueries, useQueryClient } from '@tanstack/vue-query'
import { Sliders, FileText, Info } from 'lucide-vue-next'
import api from '@/stores/api'
import { messageErreur } from '@/services/erreurs'
import { useAuthStore } from '@/stores/auth'
import { peutLire, peutEcrire } from '@/config/roles'
import { genererSimulationPDF, fcfaPDF } from '@/services/pdfSimulateurs'

// Simulateurs en lecture seule : coût et marge d'un pack, seuil de rentabilité (la prévision d'achats est dans le Stock).
// Aucun prix n'est appliqué ici : le prix de vente se fixe dans « Formules ».
// Les réglages (charges, objectifs, coefficient, marge cible) sont enregistrés côté serveur (onglet Paramètres).

interface Referentiel { coutReel: number; prixConseille: number | null }
interface SimulationPack {
  formule: { nom: string; slug: string; prixVente: number | null }
  lignes: { produit: string; unite: string; quantite: number; prixCatalogue: number | null; coutCatalogue: number | null; prixAchatReel: number | null; coutReel: number | null }[]
  produitsSansAchat: number
  prixManquants: number
  frais: { livraison: number; emballage: number; commission: number }
  totaux: { coutCatalogue: number; coutReel: number; frais: number; margeCatalogue: number | null; margeReelle: number | null; tauxMargeCatalogue: number | null; tauxMargeReelle: number | null }
  methode: { coefficient: number | null; margeCiblePct: number | null; catalogue: Referentiel | null; achatsReels: Referentiel | null }
}
interface Parametres {
  chargesFixesMensuellesFcfa: number | null
  objectifCaMensuelFcfa: number | null
  repartition: { essentiel: number | null; equilibre: number | null; confort: number | null }
  emballageParCommandeFcfa: number | null
  commissionMobileMoneyPct: number | null
  livraisonMoyenneFcfa: number | null
  objectifClients: number | null
  debutObjectif: string | null
  finObjectif: string | null
  parts: { emballage: number | null; transformation: number | null; logistique: number | null; pertes: number | null }
  margeCiblePct: number | null
  coefficient: number | null
}

const PACKS = [
  { type: 'essentiel', nom: 'AHI Essentiel' },
  { type: 'equilibre', nom: 'AHI Équilibré' },
  { type: 'confort', nom: 'AHI Confort' },
  { type: 'reserve', nom: 'AHI Réserve' },
  { type: 'fraicheur', nom: 'AHI Fraîcheur' },
] as const
// Réserve et Fraîcheur ouvrent après le lancement
const PACKS_OUVERTS = PACKS.slice(0, 3) as { type: 'essentiel' | 'equilibre' | 'confort'; nom: string }[]

interface Seuil {
  incomplet: string // Raison pour laquelle le calcul n'est pas possible ; vide sinon
  prixMoyen: number
  margeMoyenne: number
  commandesSeuil: number | null // null : charges à renseigner ; -1 : marge moyenne négative
  caSeuil: number | null
  commandesObjectif: number | null
  resultatObjectif: number | null
  detail: { nom: string; part: number; prix: number; marge: number }[]
}
const seuilIncomplet = (incomplet: string): Seuil => ({ incomplet, prixMoyen: 0, margeMoyenne: 0, commandesSeuil: null, caSeuil: null, commandesObjectif: null, resultatObjectif: null, detail: [] })

const authStore = useAuthStore()
const queryClient = useQueryClient()
const lireParametres = computed(() => peutLire(authStore.role.value, 'parametres'))
const ecrireParametres = computed(() => peutEcrire(authStore.role.value, 'parametres'))

const onglet = ref<'pack' | 'seuil' | 'parametres'>('pack')
const formatFCFA = (n: number | null) => n === null ? 'à renseigner' : `${Math.round(n).toLocaleString('fr-FR')} FCFA`
const formatNombre = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
const formatPourcent = (n: number | null) => n === null ? '—' : `${n.toLocaleString('fr-FR')} %`

// --- Paramètres enregistrés (vides tant qu'ils ne sont pas renseignés) ---
const { data: parametres } = useQuery({
  queryKey: ['parametres'],
  queryFn: async (): Promise<Parametres> => (await api.get('/api/admin/parametres')).data,
  enabled: lireParametres,
})

// Frais par commande : repris des paramètres ; vide = 0 dans le calcul, signalé « à renseigner »
const frais = reactive({ livraison: null as number | null, emballage: null as number | null, commission: null as number | null })
const repartition = reactive<Record<string, number | null>>({ essentiel: null, equilibre: null, confort: null }) // en % des commandes
const chargesFixes = ref<number | null>(null) // FCFA par mois
const objectifCa = ref<number | null>(null) // FCFA par mois
watch(parametres, (p) => {
  if (!p) return
  frais.livraison = p.livraisonMoyenneFcfa
  frais.emballage = p.emballageParCommandeFcfa
  frais.commission = p.commissionMobileMoneyPct
  Object.assign(repartition, p.repartition)
  chargesFixes.value = p.chargesFixesMensuellesFcfa
  objectifCa.value = p.objectifCaMensuelFcfa
}, { immediate: true })
const paramsFrais = computed(() => ({ livraison: frais.livraison ?? 0, emballage: frais.emballage ?? 0, commission: frais.commission ?? 0 }))

// --- (a) Coût et marge d'un pack ---
const packChoisi = ref<typeof PACKS[number]['type']>('essentiel')
const { data: simulation, isLoading: chargementPack, error: erreurPack } = useQuery({
  queryKey: ['simulateur', 'pack', packChoisi, paramsFrais],
  queryFn: async (): Promise<SimulationPack> => (await api.get(`/api/admin/simulateurs/pack/${packChoisi.value}`, { params: paramsFrais.value })).data,
})

function exporterPack() {
  const s = simulation.value
  if (!s) return
  const m = s.methode
  genererSimulationPDF(`Coût et marge ${s.formule.nom}`, [
    `Prix de vente : ${fcfaPDF(s.formule.prixVente)}`,
    `Frais : livraison ${fcfaPDF(s.frais.livraison)}, emballage ${fcfaPDF(s.frais.emballage)}, commission Mobile Money ${fcfaPDF(s.frais.commission)}`,
    `Méthode du référentiel : coefficient ${m.coefficient ?? 'à renseigner'}, marge cible ${m.margeCiblePct ?? 'à renseigner'} % ; prix conseillé ${fcfaPDF(m.catalogue?.prixConseille ?? null)} (catalogue), ${fcfaPDF(m.achatsReels?.prixConseille ?? null)} (achats réels)`,
  ], [{
    titre: 'Composition',
    entetes: ['Produit', 'Quantité', 'Coût catalogue', 'Coût réel'],
    lignes: s.lignes.map(l => [l.produit, `${formatNombre(l.quantite)} ${l.unite}`, fcfaPDF(l.coutCatalogue), fcfaPDF(l.coutReel) + (l.prixAchatReel === null ? ' *' : '')]),
    pied: ['Marge', '', `${fcfaPDF(s.totaux.margeCatalogue)} (${formatPourcent(s.totaux.tauxMargeCatalogue)})`, `${fcfaPDF(s.totaux.margeReelle)} (${formatPourcent(s.totaux.tauxMargeReelle)})`],
  }])
}

// --- (c) Seuil de rentabilité et objectif de chiffre d'affaires ---
// Marge réelle unitaire de chaque formule ouverte, avec les mêmes frais
const simulationsOuvertes = useQueries({
  queries: computed(() => PACKS_OUVERTS.map(p => ({
    queryKey: ['simulateur', 'pack', p.type, paramsFrais.value],
    queryFn: async (): Promise<SimulationPack> => (await api.get(`/api/admin/simulateurs/pack/${p.type}`, { params: paramsFrais.value })).data,
    enabled: onglet.value === 'seuil',
  }))),
})

const seuil = computed((): Seuil | null => {
  const sims = simulationsOuvertes.value.map(q => q.data)
  if (sims.some(s => !s)) return null
  if (sims.some(s => s!.formule.prixVente === null || s!.totaux.margeReelle === null)) return seuilIncomplet('Une formule ouverte n\'a pas de prix.')
  const totalPart = PACKS_OUVERTS.reduce((s, p) => s + (repartition[p.type] ?? 0), 0)
  if (!totalPart) return seuilIncomplet('Renseignez la répartition des commandes.')
  const poids = PACKS_OUVERTS.map(p => (repartition[p.type] ?? 0) / totalPart)
  const prixMoyen = sims.reduce((s, sim, i) => s + sim!.formule.prixVente! * poids[i]!, 0)
  const margeMoyenne = sims.reduce((s, sim, i) => s + sim!.totaux.margeReelle! * poids[i]!, 0)
  const commandesSeuil = chargesFixes.value === null ? null : margeMoyenne > 0 ? Math.ceil(chargesFixes.value / margeMoyenne) : -1
  const commandesObjectif = objectifCa.value === null || prixMoyen <= 0 ? null : Math.ceil(objectifCa.value / prixMoyen)
  return {
    incomplet: '',
    prixMoyen, margeMoyenne, commandesSeuil,
    caSeuil: commandesSeuil !== null && commandesSeuil >= 0 ? commandesSeuil * prixMoyen : null,
    commandesObjectif,
    resultatObjectif: commandesObjectif === null || chargesFixes.value === null ? null : commandesObjectif * margeMoyenne - chargesFixes.value,
    detail: PACKS_OUVERTS.map((p, i) => ({ nom: p.nom, part: Math.round(poids[i]! * 100), prix: sims[i]!.formule.prixVente!, marge: sims[i]!.totaux.margeReelle! }))
  }
})

function exporterSeuil() {
  const s = seuil.value
  if (!s || s.incomplet) return
  genererSimulationPDF('Seuil de rentabilité', [
    `Charges fixes mensuelles : ${fcfaPDF(chargesFixes.value)}`,
    `Objectif de chiffre d'affaires mensuel : ${fcfaPDF(objectifCa.value)}`,
    `Frais par commande : livraison ${fcfaPDF(paramsFrais.value.livraison)}, emballage ${fcfaPDF(paramsFrais.value.emballage)}, commission ${frais.commission ?? 'à renseigner'} %`,
  ], [{
    titre: 'Répartition et marge par formule (coût réel)',
    entetes: ['Formule', 'Part des commandes', 'Prix de vente', 'Marge unitaire'],
    lignes: s.detail.map(d => [d.nom, `${d.part} %`, fcfaPDF(d.prix), fcfaPDF(d.marge)]),
  }, {
    titre: 'Résultat',
    entetes: ['Indicateur', 'Valeur'],
    lignes: [
      ['Commandes par mois pour couvrir les charges', s.commandesSeuil === null ? 'Charges à renseigner' : s.commandesSeuil < 0 ? 'Marge moyenne négative' : s.commandesSeuil],
      ['Chiffre d\'affaires au seuil', fcfaPDF(s.caSeuil)],
      ['Commandes pour atteindre l\'objectif', s.commandesObjectif ?? 'Objectif à renseigner'],
      ['Résultat mensuel à l\'objectif', fcfaPDF(s.resultatObjectif)],
    ],
  }])
}

// --- (d) Paramètres : enregistrés côté serveur, journalisés ---
const formParams = ref<Parametres | null>(null)
watch(parametres, (p) => { if (p) formParams.value = JSON.parse(JSON.stringify({ ...p, debutObjectif: p.debutObjectif?.slice(0, 10) ?? '', finObjectif: p.finObjectif?.slice(0, 10) ?? '' })) }, { immediate: true })
const messageParams = ref({ texte: '', type: '' })
const coefficientSaisi = computed(() => {
  const p = formParams.value?.parts
  if (!p) return null
  const v = [p.emballage, p.transformation, p.logistique, p.pertes]
  if (v.some(x => x === null || (x as unknown) === '')) return null
  return Math.round((1 + v.reduce((s: number, x) => s + Number(x), 0) / 100) * 10000) / 10000
})
async function enregistrerParametres() {
  if (!formParams.value) return
  try {
    const { message } = (await api.put('/api/admin/parametres', formParams.value)).data
    messageParams.value = { texte: message, type: 'success' }
    queryClient.invalidateQueries({ queryKey: ['parametres'] })
    queryClient.invalidateQueries({ queryKey: ['simulateur'] })
  } catch (err) {
    messageParams.value = { texte: messageErreur(err, 'Enregistrement impossible'), type: 'error' }
  }
}

const ONGLETS = computed(() => [
  { id: 'pack', label: 'Coût et marge d\'un pack' },
  { id: 'seuil', label: 'Seuil de rentabilité' },
  ...(lireParametres.value ? [{ id: 'parametres', label: 'Paramètres' }] : []),
])
const champ = 'mt-1 w-full px-3 py-2 rounded-xl border border-creme2 bg-creme text-sm text-noir font-normal'
const etiquette = 'text-[10px] font-bold uppercase text-gris'
</script>

<template>
  <div class="space-y-4 animate-fadeIn text-sm text-noir">
    <div class="bg-white p-4 rounded-2xl space-y-2">
      <h1 class="font-display font-bold text-xl flex items-center gap-2"><Sliders class="w-5 h-5 text-foret" /> Simulateurs</h1>
      <p class="text-xs text-gris flex items-start gap-1.5"><Info class="w-3.5 h-3.5 shrink-0 mt-0.5" /> Outils de calcul uniquement : aucun prix n'est modifié. Le prix de vente se fixe dans « Formules » ; les réglages, dans l'onglet « Paramètres ».</p>
    </div>

    <!-- Frais communs -->
    <div v-if="onglet !== 'parametres'" class="bg-white rounded-2xl border border-creme2 p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
      <label :class="etiquette">Livraison (FCFA / commande)<input v-model.number="frais.livraison" type="number" min="0" step="100" placeholder="à renseigner" :class="champ" /></label>
      <label :class="etiquette">Emballage en plus du coefficient (FCFA)<input v-model.number="frais.emballage" type="number" min="0" step="50" placeholder="à renseigner" :class="champ" /></label>
      <label :class="etiquette">Commission Mobile Money (%)<input v-model.number="frais.commission" type="number" min="0" max="100" step="0.1" placeholder="à renseigner" :class="champ" /></label>
    </div>

    <div v-onglets class="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Simulateurs">
      <button v-for="o in ONGLETS" :key="o.id" role="tab" :aria-selected="onglet === o.id" @click="onglet = o.id as any"
        :class="['cursor-pointer px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap border', onglet === o.id ? 'bg-foret text-white border-foret' : 'bg-white text-gris border-creme2']">
        {{ o.label }}
      </button>
    </div>

    <!-- (a) PACK -->
    <section v-if="onglet === 'pack'" class="bg-white rounded-2xl border border-creme2 p-4 space-y-4">
      <div class="flex flex-wrap items-end gap-3">
        <label :class="etiquette">Formule
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
          <div :class="['rounded-xl p-3', (simulation.totaux.margeReelle ?? 0) >= 0 ? 'bg-foret text-white' : 'bg-red-50 text-red-800']"><p class="text-[10px] uppercase font-bold opacity-80">Marge (coût réel)</p><p class="font-bold">{{ formatFCFA(simulation.totaux.margeReelle) }}</p><p class="text-xs opacity-80">{{ formatPourcent(simulation.totaux.tauxMargeReelle) }}</p></div>
        </div>

        <!-- Méthode du référentiel : matières × coefficient, puis ÷ (1 − marge cible) -->
        <div class="rounded-xl border border-creme2 p-3 space-y-2 text-xs">
          <p class="font-bold">Méthode du référentiel
            <span class="font-normal text-gris">· coefficient {{ simulation.methode.coefficient?.toLocaleString('fr-FR') ?? 'à renseigner' }} · marge cible {{ formatPourcent(simulation.methode.margeCiblePct) }}</span>
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div v-for="(r, cle) in { catalogue: simulation.methode.catalogue, achatsReels: simulation.methode.achatsReels }" :key="cle" class="rounded-lg bg-creme p-2.5">
              <p class="text-[10px] uppercase font-bold text-gris">{{ cle === 'catalogue' ? 'Matières au prix du catalogue' : 'Matières au prix d\'achat réel' }}</p>
              <template v-if="r">
                <p>Coût réel : <strong>{{ formatFCFA(r.coutReel) }}</strong></p>
                <p>Prix conseillé : <strong>{{ formatFCFA(r.prixConseille) }}</strong>
                  <span v-if="r.prixConseille !== null && simulation.formule.prixVente !== null" :class="simulation.formule.prixVente >= r.prixConseille ? 'text-green-800' : 'text-red-700'">
                    ({{ simulation.formule.prixVente >= r.prixConseille ? '+' : '' }}{{ formatFCFA(simulation.formule.prixVente - r.prixConseille) }} au prix de vente)
                  </span>
                </p>
              </template>
              <p v-else class="text-gris">Parts du coefficient à renseigner (Paramètres).</p>
            </div>
          </div>
        </div>

        <p v-if="simulation.prixManquants" class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5">{{ simulation.prixManquants }} produit(s) sans prix au catalogue : coût incomplet.</p>
        <p v-if="simulation.produitsSansAchat" class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5">* {{ simulation.produitsSansAchat }} produit(s) sans achat enregistré : leur coût réel reprend le prix catalogue.</p>
        <p v-if="!simulation.lignes.length" class="text-xs text-gris text-center py-4 border border-dashed border-creme2 rounded-xl">Aucun produit dans la composition : complétez le catalogue (Produits).</p>
        <div v-defilable="'Composition et coûts du pack'" v-else class="overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse min-w-130">
            <thead><tr class="text-[10px] uppercase tracking-wider text-gris border-b border-creme2">
              <th class="py-2 pr-2">Produit</th><th class="py-2 pr-2 text-right">Quantité</th><th class="py-2 pr-2 text-right">Coût catalogue</th><th class="py-2 text-right">Coût réel</th>
            </tr></thead>
            <tbody class="divide-y divide-creme2">
              <tr v-for="l in simulation.lignes" :key="l.produit">
                <td class="py-2 pr-2 font-semibold">{{ l.produit }}</td>
                <td class="py-2 pr-2 text-right whitespace-nowrap">{{ formatNombre(l.quantite) }} {{ l.unite }}</td>
                <td class="py-2 pr-2 text-right whitespace-nowrap">{{ formatFCFA(l.coutCatalogue) }}<span v-if="l.prixCatalogue !== null" class="block text-gris">{{ formatFCFA(l.prixCatalogue) }} / {{ l.unite }}</span></td>
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

    <!-- (c) SEUIL -->
    <section v-if="onglet === 'seuil'" class="bg-white rounded-2xl border border-creme2 p-4 space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label :class="etiquette">Charges fixes (FCFA / mois)<input v-model.number="chargesFixes" type="number" min="0" step="10000" placeholder="à renseigner" :class="champ" /></label>
        <label :class="etiquette">Objectif de chiffre d'affaires (FCFA / mois)<input v-model.number="objectifCa" type="number" min="0" step="50000" placeholder="à renseigner" :class="champ" /></label>
      </div>
      <fieldset class="grid grid-cols-3 gap-3">
        <legend class="text-[10px] font-bold uppercase text-gris mb-1">Répartition des commandes (%)</legend>
        <label v-for="p in PACKS_OUVERTS" :key="p.type" :class="etiquette">{{ p.nom }}
          <input v-model.number="repartition[p.type]" type="number" min="0" max="100" placeholder="—" :class="champ" />
        </label>
      </fieldset>
      <p v-if="!seuil" class="text-gris text-center py-4">Calcul des marges par formule...</p>
      <p v-else-if="seuil.incomplet" class="text-xs text-amber-800 text-center py-4">{{ seuil.incomplet }}</p>
      <template v-else>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div class="rounded-xl bg-creme p-3"><p class="text-[10px] uppercase font-bold text-gris">Prix moyen</p><p class="font-bold">{{ formatFCFA(seuil.prixMoyen) }}</p></div>
          <div class="rounded-xl bg-creme p-3"><p class="text-[10px] uppercase font-bold text-gris">Marge moyenne</p><p class="font-bold">{{ formatFCFA(seuil.margeMoyenne) }}</p></div>
          <div class="rounded-xl bg-foret text-white p-3"><p class="text-[10px] uppercase font-bold opacity-80">Seuil (commandes / mois)</p>
            <p class="font-bold">{{ seuil.commandesSeuil === null ? 'Charges à renseigner' : seuil.commandesSeuil < 0 ? 'Inatteignable' : seuil.commandesSeuil }}</p>
            <p v-if="seuil.caSeuil != null" class="text-xs opacity-80">soit {{ formatFCFA(seuil.caSeuil) }}</p></div>
          <div class="rounded-xl bg-creme p-3"><p class="text-[10px] uppercase font-bold text-gris">Objectif</p>
            <p class="font-bold">{{ seuil.commandesObjectif === null ? 'à renseigner' : `${seuil.commandesObjectif} commandes` }}</p>
            <p v-if="seuil.resultatObjectif != null" :class="['text-xs', seuil.resultatObjectif >= 0 ? 'text-green-800' : 'text-red-700']">résultat {{ formatFCFA(seuil.resultatObjectif) }}</p></div>
        </div>
        <p v-if="seuil.commandesSeuil !== null && seuil.commandesSeuil < 0" class="text-xs text-red-700">La marge moyenne est négative : aucun volume ne couvre les charges avec ces prix et ces frais.</p>
        <button @click="exporterSeuil" class="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-foret text-white text-xs font-bold"><FileText class="w-3.5 h-3.5" /> PDF</button>
      </template>
    </section>

    <!-- (d) PARAMÈTRES -->
    <section v-if="onglet === 'parametres' && formParams" class="bg-white rounded-2xl border border-creme2 p-4 space-y-4">
      <p class="text-xs text-gris">Vide = à renseigner. Chaque modification est inscrite au journal (Finances, « Taux & journal »).</p>
      <form @submit.prevent="enregistrerParametres" class="space-y-4">
        <fieldset :disabled="!ecrireParametres" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <legend class="text-xs font-bold mb-2">Méthode du référentiel (coefficient {{ coefficientSaisi?.toLocaleString('fr-FR') ?? 'à renseigner' }})</legend>
          <label :class="etiquette">Part emballage (%)<input v-model.number="formParams.parts.emballage" type="number" min="0" max="100" step="0.1" :class="champ" /></label>
          <label :class="etiquette">Part transformation (%)<input v-model.number="formParams.parts.transformation" type="number" min="0" max="100" step="0.1" :class="champ" /></label>
          <label :class="etiquette">Part logistique (%)<input v-model.number="formParams.parts.logistique" type="number" min="0" max="100" step="0.1" :class="champ" /></label>
          <label :class="etiquette">Part pertes (%)<input v-model.number="formParams.parts.pertes" type="number" min="0" max="100" step="0.1" :class="champ" /></label>
          <label :class="etiquette">Marge cible (%)<input v-model.number="formParams.margeCiblePct" type="number" min="0" max="95" step="0.5" :class="champ" /></label>
        </fieldset>
        <fieldset :disabled="!ecrireParametres" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <legend class="text-xs font-bold mb-2">Frais par commande</legend>
          <label :class="etiquette">Livraison moyenne (FCFA)<input v-model.number="formParams.livraisonMoyenneFcfa" type="number" min="0" :class="champ" /></label>
          <label :class="etiquette">Emballage en plus (FCFA)<input v-model.number="formParams.emballageParCommandeFcfa" type="number" min="0" :class="champ" /></label>
          <label :class="etiquette">Commission Mobile Money (%)<input v-model.number="formParams.commissionMobileMoneyPct" type="number" min="0" max="100" step="0.1" :class="champ" /></label>
        </fieldset>
        <fieldset :disabled="!ecrireParametres" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <legend class="text-xs font-bold mb-2">Objectifs et charges</legend>
          <label :class="etiquette">Charges fixes (FCFA / mois)<input v-model.number="formParams.chargesFixesMensuellesFcfa" type="number" min="0" :class="champ" /></label>
          <label :class="etiquette">Objectif de CA (FCFA / mois)<input v-model.number="formParams.objectifCaMensuelFcfa" type="number" min="0" :class="champ" /></label>
          <label :class="etiquette">Objectif de clients<input v-model.number="formParams.objectifClients" type="number" min="0" :class="champ" /></label>
          <label :class="etiquette">Début de l'objectif<input v-model="formParams.debutObjectif" type="date" :class="champ" /></label>
          <label :class="etiquette">Fin de l'objectif<input v-model="formParams.finObjectif" type="date" :class="champ" /></label>
          <label v-for="p in PACKS_OUVERTS" :key="p.type" :class="etiquette">Part {{ p.nom }} (%)<input v-model.number="formParams.repartition[p.type]" type="number" min="0" max="100" :class="champ" /></label>
        </fieldset>
        <p v-if="messageParams.texte" role="status" :class="messageParams.type === 'success' ? 'text-green-800' : 'text-red-700'" class="text-xs font-semibold">{{ messageParams.texte }}</p>
        <button v-if="ecrireParametres" type="submit" class="cursor-pointer px-4 py-2.5 rounded-xl bg-foret text-white text-xs font-bold">Enregistrer les paramètres</button>
      </form>
    </section>
  </div>
</template>
