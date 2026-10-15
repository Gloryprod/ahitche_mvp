<script setup lang="ts">
import { ref, computed, reactive, watch } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { ChevronLeft, ChevronRight, Phone, MapPin, FileText, MessageCircle, Truck } from 'lucide-vue-next'
import api from '@/stores/api'
import { messageErreur } from '@/services/erreurs'
import type { CommandeTerrain, Prestataire, ZoneLivraison } from '@/type'
import { useAuthStore } from '@/stores/auth'
import { peutEcrire } from '@/config/roles'
import { ETAPE_SUIVANTE, HORAIRES_CRENEAUX, classeStatut, type StatutCommande } from '@/config/commandes'
import { useChangementStatut } from '@/composables/useChangementStatut'
import { genererPreparationPDF, genererTourneePDF, messageTournee } from '@/services/pdfLogistique'

const authStore = useAuthStore()
const ecriture = computed(() => peutEcrire(authStore.role.value, 'logistique'))
const queryClient = useQueryClient()
const { changerVers } = useChangementStatut()

const PERIODES = ['Matin', 'Après-midi'] as const
// Rang du créneau (matin avant après-midi) ; un créneau vide passe en premier
const rangPeriode = (periode: string | null) => (PERIODES as readonly (string | null)[]).indexOf(periode)
const LIBELLE_ACTION: Partial<Record<StatutCommande, string>> = {
  'Confirmée': 'Commencer la préparation',
  'En préparation': 'Partir en livraison',
  'En livraison': 'Livrée : saisir le paiement',
  'Échec': 'Remettre en planification',
}

// --- Jour affiché (heure de Cotonou) ---
const aujourdhui = () => new Date(Date.now() + 3600 * 1000).toISOString().slice(0, 10)
const jour = ref(aujourdhui())
const decalerJour = (jours: number) => {
  const d = new Date(`${jour.value}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + jours)
  jour.value = d.toISOString().slice(0, 10)
}
const jourLisible = computed(() => new Date(`${jour.value}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }))

const onglet = ref<'tournees' | 'planifier' | 'zones'>('tournees')
const notification = ref({ text: '', type: '' })
const showNotification = (text: string, type: string) => {
  notification.value = { text, type }
  setTimeout(() => notification.value = { text: '', type: '' }, 4000)
}

// --- Données ---
interface Planning {
  date: string
  duJour: CommandeTerrain[]
  aPlanifier: CommandeTerrain[]
  aConfirmer: number
}

const { data, isLoading, isError, error } = useQuery({
  queryKey: ['logistique', jour],
  queryFn: async ({ queryKey }): Promise<Planning> => (await api.get('/api/admin/logistique', { params: { date: queryKey[1] } })).data,
})

const { data: livreurs } = useQuery({
  queryKey: ['prestataires', 'livreurs-actifs'],
  queryFn: async (): Promise<Prestataire[]> =>
    (await api.get('/api/admin/prestataires', { params: { type: 'Livreur', actif: 'true', limit: 200 } })).data.prestataires,
})

const { data: zones } = useQuery({
  queryKey: ['zones-admin'],
  queryFn: async (): Promise<ZoneLivraison[]> => (await api.get('/api/admin/zones')).data,
  enabled: computed(() => onglet.value === 'zones'),
})

const rafraichir = () => queryClient.invalidateQueries({ queryKey: ['logistique'] })

// --- Tournées : par créneau, puis par livreur ; zone prioritaire d'abord ---
const ordreArret = (a: CommandeTerrain, b: CommandeTerrain) =>
  Number(b.zone?.prioritaire ?? false) - Number(a.zone?.prioritaire ?? false)
  || (a.zone?.nom ?? '~').localeCompare(b.zone?.nom ?? '~', 'fr', { numeric: true })
  || a.client.quartier.localeCompare(b.client.quartier, 'fr')

const tournees = computed(() => PERIODES.map(periode => {
  const commandes = (data.value?.duJour ?? []).filter(c => c.creneau?.periode === periode).sort(ordreArret)
  const parLivreur = new Map<string, { livreur: CommandeTerrain['livreur']; commandes: CommandeTerrain[] }>()
  for (const c of commandes) {
    const cle = c.livreur?._id ?? 'sans-livreur'
    if (!parLivreur.has(cle)) parLivreur.set(cle, { livreur: c.livreur, commandes: [] })
    parLivreur.get(cle)!.commandes.push(c)
  }
  return { periode, total: commandes.length, groupes: [...parLivreur.values()] }
}).filter(t => t.total > 0))

// Tournée complète d'un livreur sur la journée (les deux créneaux), hors livraisons terminées
const tourneeDuLivreur = (livreurId: string) => (data.value?.duJour ?? [])
  .filter(c => c.livreur?._id === livreurId && !['Livrée', 'Annulée'].includes(c.statut))
  .sort((a, b) => rangPeriode(a.creneau.periode) - rangPeriode(b.creneau.periode) || ordreArret(a, b))

const aPreparer = computed(() => (data.value?.duJour ?? []).filter(c => !['Livrée', 'Annulée', 'Échec'].includes(c.statut)))

// --- Actions sur les commandes ---
const enCours = ref<string | null>(null)

async function changer(c: CommandeTerrain, statut: StatutCommande) {
  enCours.value = c.id
  try {
    const message = await changerVers(c, statut)
    if (message) {
      showNotification(message, 'success')
      rafraichir()
    }
  } catch (err) {
    showNotification(messageErreur(err, 'Impossible de modifier le statut'), 'error')
  } finally {
    enCours.value = null
  }
}

// --- Planification ---
const planifs = reactive<Record<string, { date: string; periode: string; livreurId: string }>>({})
watch([() => data.value?.aPlanifier, livreurs], () => {
  for (const c of data.value?.aPlanifier ?? []) {
    planifs[c.id] ??= { date: jour.value, periode: 'Matin', livreurId: livreurs.value?.[0]?._id ?? '' }
    if (!planifs[c.id]!.livreurId && livreurs.value?.length) planifs[c.id]!.livreurId = livreurs.value[0]!._id
  }
}, { immediate: true })

async function planifier(c: CommandeTerrain) {
  enCours.value = c.id
  try {
    const response = await api.patch(`/api/admin/logistique/commandes/${c.id}/planification`, planifs[c.id])
    showNotification(response.data.message, 'success')
    rafraichir()
  } catch (err) {
    showNotification(messageErreur(err, 'Planification impossible'), 'error')
  } finally {
    enCours.value = null
  }
}

// --- Documents et WhatsApp ---
const lienWhatsApp = (telephone: string, texte: string) => `https://wa.me/${telephone.replace(/\D/g, '')}?text=${encodeURIComponent(texte)}`

// --- Zones ---
const brouillonsZones = reactive<Record<string, { tarifCourse: number; prioritaire: boolean; actif: boolean }>>({})
watch(zones, (liste) => {
  for (const z of liste ?? []) brouillonsZones[z.code] = { tarifCourse: z.tarifCourse, prioritaire: z.prioritaire, actif: z.actif }
}, { immediate: true })

async function enregistrerZone(z: ZoneLivraison) {
  try {
    await api.put(`/api/admin/zones/${z.code}`, brouillonsZones[z.code])
    showNotification(`${z.nom} enregistrée.`, 'success')
    queryClient.invalidateQueries({ queryKey: ['zones-admin'] })
  } catch (err) {
    showNotification(messageErreur(err, 'Enregistrement impossible'), 'error')
  }
}

const formatFCFA = (n: number) => `${n.toLocaleString('fr-FR')} FCFA`
</script>

<template>
  <div class="space-y-4 animate-fadeIn text-sm text-noir">

    <div v-if="notification.text" role="status" :class="[notification.type === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-700 border-red-200', 'p-4 rounded-xl border text-xs font-semibold fixed top-4 right-4 left-4 sm:left-auto z-50 max-w-sm']">
      {{ notification.text }}
    </div>

    <!-- En-tête : jour affiché -->
    <div class="bg-white p-4 rounded-2xl space-y-3">
      <div class="flex items-center justify-between gap-3">
        <h1 class="font-display font-bold text-xl flex items-center gap-2"><Truck class="w-5 h-5 text-foret" /> Logistique</h1>
        <button v-if="aPreparer.length" @click="genererPreparationPDF(jour, aPreparer)" class="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-foret text-white text-xs font-bold">
          <FileText class="w-3.5 h-3.5" /> Préparation
        </button>
      </div>
      <div class="flex items-center gap-2">
        <button @click="decalerJour(-1)" class="cursor-pointer p-2.5 rounded-xl border border-creme2" aria-label="Jour précédent"><ChevronLeft class="w-4 h-4" /></button>
        <label class="flex-1">
          <span class="sr-only">Jour affiché</span>
          <input v-model="jour" type="date" class="w-full px-3 py-2 rounded-xl border border-creme2 bg-creme text-sm font-semibold text-center" />
        </label>
        <button @click="decalerJour(1)" class="cursor-pointer p-2.5 rounded-xl border border-creme2" aria-label="Jour suivant"><ChevronRight class="w-4 h-4" /></button>
      </div>
      <p class="text-xs text-gris text-center first-letter:uppercase">{{ jourLisible }}</p>
    </div>

    <!-- Onglets -->
    <div v-onglets class="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Vues de la logistique">
      <button v-for="o in [
          { id: 'tournees', label: `Tournées (${data?.duJour.length ?? 0})` },
          { id: 'planifier', label: `À planifier (${data?.aPlanifier.length ?? 0})` },
          { id: 'zones', label: 'Zones' }
        ]" :key="o.id" role="tab" :aria-selected="onglet === o.id" @click="onglet = o.id as any"
        :class="['cursor-pointer px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap border', onglet === o.id ? 'bg-foret text-white border-foret' : 'bg-white text-gris border-creme2']">
        {{ o.label }}
      </button>
    </div>

    <div v-if="isLoading" class="bg-white rounded-2xl p-8 text-center">Chargement du planning...</div>
    <div v-else-if="isError" class="p-4 bg-red-50 text-red-700 rounded-xl border border-red-100">
      Erreur : {{ (error as any)?.response?.data?.message || error?.message }}
    </div>

    <template v-else-if="data">
      <!-- Alertes -->
      <RouterLink v-if="data.aConfirmer" to="/dashboard/admin/commandes" class="block p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold">
        {{ data.aConfirmer }} commande(s) en attente de confirmation dans « Commandes » →
      </RouterLink>

      <!-- TOURNÉES DU JOUR -->
      <section v-if="onglet === 'tournees'" class="space-y-5">
        <p v-if="!tournees.length" class="bg-white rounded-2xl p-8 text-center text-gris border border-dashed border-creme2">
          Aucune livraison planifiée ce jour.
        </p>

        <div v-for="t in tournees" :key="t.periode" class="space-y-3">
          <h2 class="font-display font-bold text-lg">{{ t.periode }} <span class="text-gris text-sm font-body">({{ HORAIRES_CRENEAUX[t.periode] }})</span> <span class="text-gris text-sm font-body">· {{ t.total }} livraison(s)</span></h2>

          <div v-for="g in t.groupes" :key="g.livreur?._id ?? 'sans'" class="bg-white rounded-2xl border border-creme2 overflow-hidden">
            <div class="flex items-center justify-between gap-2 px-4 py-3 bg-creme/60 border-b border-creme2">
              <p class="font-bold text-sm">{{ g.livreur?.nom ?? 'Sans livreur' }}</p>
              <div v-if="g.livreur && tourneeDuLivreur(g.livreur._id).length" class="flex items-center gap-1.5">
                <button @click="genererTourneePDF(jour, g.livreur, tourneeDuLivreur(g.livreur._id))" class="cursor-pointer p-2 rounded-lg border border-creme2 bg-white" :aria-label="`Feuille de tournée de ${g.livreur.nom}`">
                  <FileText class="w-4 h-4" />
                </button>
                <a v-if="g.livreur.telephone" :href="lienWhatsApp(g.livreur.telephone, messageTournee(jour, g.livreur, tourneeDuLivreur(g.livreur._id)))" target="_blank" rel="noopener" class="p-2 rounded-lg border border-creme2 bg-white text-savane" :aria-label="`Envoyer la tournée à ${g.livreur.nom} sur WhatsApp`">
                  <MessageCircle class="w-4 h-4" />
                </a>
              </div>
            </div>

            <article v-for="c in g.commandes" :key="c.id" class="p-4 border-b border-creme2 last:border-b-0 space-y-2">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <p class="font-bold">{{ c.client.nom }} <span class="text-gris font-normal text-xs">· {{ c.reference }}</span></p>
                  <p class="text-xs text-gris">{{ c.client.quartier }}<span v-if="c.zone"> · {{ c.zone.nom }}</span><span v-else> · hors zone</span></p>
                </div>
                <span :class="[classeStatut(c.statut), 'px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap']">{{ c.statut }}</span>
              </div>
              <p v-if="c.client.adresse" class="text-xs">{{ c.client.adresse }}</p>
              <p class="text-xs"><strong>{{ c.formule }}</strong> · {{ formatFCFA(c.total) }} ({{ c.modePaiement }})</p>

              <div class="flex flex-wrap gap-2 pt-1">
                <a v-if="c.client.telephone" :href="`tel:${c.client.telephone}`" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-creme2 text-xs font-semibold"><Phone class="w-3.5 h-3.5" /> Appeler</a>
                <a v-if="c.client.lienLocalisation" :href="c.client.lienLocalisation" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-creme2 text-xs font-semibold"><MapPin class="w-3.5 h-3.5" /> Localisation</a>
                <template v-if="ecriture">
                  <button v-if="ETAPE_SUIVANTE[c.statut]" :disabled="enCours === c.id" @click="changer(c, ETAPE_SUIVANTE[c.statut]!)" class="cursor-pointer flex-1 min-w-40 px-3 py-2 rounded-xl bg-foret text-white text-xs font-bold disabled:opacity-50">
                    {{ LIBELLE_ACTION[c.statut] }}
                  </button>
                  <button v-if="c.statut === 'En livraison'" :disabled="enCours === c.id" @click="changer(c, 'Échec')" class="cursor-pointer px-3 py-2 rounded-xl border border-red-200 text-red-700 text-xs font-bold">Échec</button>
                </template>
              </div>
            </article>
          </div>
        </div>
      </section>

      <!-- À PLANIFIER -->
      <section v-if="onglet === 'planifier'" class="space-y-3">
        <p v-if="!data.aPlanifier.length" class="bg-white rounded-2xl p-8 text-center text-gris border border-dashed border-creme2">
          Rien à planifier : toutes les commandes confirmées ont un créneau.
        </p>
        <p v-if="data.aPlanifier.length && !livreurs?.length" class="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
          Aucun livreur actif : ajoutez-en un dans « Prestataires ».
        </p>

        <article v-for="c in data.aPlanifier" :key="c.id" class="bg-white rounded-2xl border border-creme2 p-4 space-y-3">
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="font-bold">{{ c.client.nom }} <span class="text-gris font-normal text-xs">· {{ c.reference }}</span></p>
              <p class="text-xs text-gris">{{ c.client.quartier || 'Adresse non renseignée' }}<span v-if="c.zone"> · {{ c.zone.nom }}, {{ c.zone.commune }}</span></p>
              <p class="text-xs">{{ c.formule }} · {{ c.produits.length }} produit(s)</p>
            </div>
            <span :class="[classeStatut(c.statut), 'px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap']">{{ c.statut }}</span>
          </div>

          <button v-if="c.statut === 'Échec' && ecriture" :disabled="enCours === c.id" @click="changer(c, 'Confirmée')" class="cursor-pointer w-full px-3 py-2.5 rounded-xl bg-foret text-white text-xs font-bold disabled:opacity-50">
            Remettre en planification
          </button>

          <form v-else-if="ecriture && planifs[c.id]" @submit.prevent="planifier(c)" class="grid grid-cols-2 gap-2">
            <label class="col-span-2 sm:col-span-1 text-[10px] font-bold uppercase text-gris">
              Jour
              <input v-model="planifs[c.id]!.date" type="date" required class="mt-1 w-full px-3 py-2 rounded-xl border border-creme2 bg-creme text-sm text-noir font-normal normal-case" />
            </label>
            <label class="col-span-2 sm:col-span-1 text-[10px] font-bold uppercase text-gris">
              Créneau
              <select v-model="planifs[c.id]!.periode" class="mt-1 w-full px-3 py-2 rounded-xl border border-creme2 bg-creme text-sm text-noir font-normal normal-case">
                <option v-for="p in PERIODES" :key="p" :value="p">{{ p }} ({{ HORAIRES_CRENEAUX[p] }})</option>
              </select>
            </label>
            <label class="col-span-2 text-[10px] font-bold uppercase text-gris">
              Livreur
              <select v-model="planifs[c.id]!.livreurId" required class="mt-1 w-full px-3 py-2 rounded-xl border border-creme2 bg-creme text-sm text-noir font-normal normal-case">
                <option value="" disabled>Choisir un livreur</option>
                <option v-for="l in livreurs" :key="l._id" :value="l._id">{{ l.nom }}{{ l.quartier ? ` (${l.quartier})` : '' }}</option>
              </select>
            </label>
            <button type="submit" :disabled="enCours === c.id" class="cursor-pointer col-span-2 px-3 py-2.5 rounded-xl bg-foret text-white text-xs font-bold disabled:opacity-50">Planifier</button>
          </form>
        </article>
      </section>

      <!-- ZONES -->
      <section v-if="onglet === 'zones'" class="space-y-3">
        <p class="text-xs text-gris">Le tarif de course est la rémunération du livreur pour une livraison dans la zone ; il sert aussi de coût de livraison dans les finances. La livraison reste gratuite pour le client.</p>
        <article v-for="z in zones" :key="z.code" :class="['bg-white rounded-2xl border border-creme2 p-4', !brouillonsZones[z.code]?.actif ? 'opacity-60' : '']">
          <div class="flex items-center justify-between gap-2">
            <div>
              <p class="font-bold">{{ z.nom }}</p>
              <p class="text-xs text-gris">{{ z.commune }} · {{ z.quartiers.length }} quartiers</p>
            </div>
            <span v-if="z.prioritaire" class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-or/20">Prioritaire</span>
          </div>
          <form v-if="brouillonsZones[z.code]" @submit.prevent="enregistrerZone(z)" class="mt-3 flex flex-wrap items-end gap-3">
            <label class="text-[10px] font-bold uppercase text-gris">
              Tarif de course (FCFA)
              <input v-model.number="brouillonsZones[z.code]!.tarifCourse" :disabled="!ecriture" type="number" min="0" step="100" class="mt-1 block w-32 px-3 py-2 rounded-xl border border-creme2 bg-creme text-sm text-noir font-normal" />
            </label>
            <label class="flex items-center gap-1.5 text-xs font-semibold py-2"><input v-model="brouillonsZones[z.code]!.prioritaire" :disabled="!ecriture" type="checkbox" class="accent-foret w-4 h-4" /> Prioritaire</label>
            <label class="flex items-center gap-1.5 text-xs font-semibold py-2"><input v-model="brouillonsZones[z.code]!.actif" :disabled="!ecriture" type="checkbox" class="accent-foret w-4 h-4" /> Desservie</label>
            <button v-if="ecriture" type="submit" class="cursor-pointer ml-auto px-3 py-2 rounded-xl bg-foret text-white text-xs font-bold">Enregistrer</button>
          </form>
        </article>
      </section>
    </template>
  </div>
</template>
