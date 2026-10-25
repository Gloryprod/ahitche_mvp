<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { useToast } from 'vue-toastification'
import Swal from 'sweetalert2'
import { Copy, Check, Crown, Power, RotateCcw, UserX } from 'lucide-vue-next'
import api from '@/stores/api'
import { messageErreur } from '@/services/erreurs'
import { useAuthStore } from '@/stores/auth'
import { peutEcrire } from '@/config/roles'
import { FORMAT_CODE, PLAFOND_MAX, LIBELLE_CODE_MAX, MOTIF_RETRAIT } from '@/config/vip'

// Codes VIP : un client qui saisit un code dans son espace devient VIP (achats libres au prix VIP), sans fin, jusqu'au
// retrait du statut ici. Code personnel : 1 client ; partagé : plusieurs clients jusqu'au plafond. Désactiver un code
// bloque les nouvelles utilisations, les comptes déjà VIP le restent.
// Section « vip » : écriture admin, lecture coordinateur (le serveur fait foi et journalise tout).

interface Utilisation { userId: string; client: string; telephone: string; date: string }
interface CodeVip {
  _id: string
  code: string
  type: 'personnel' | 'partage'
  plafond: number
  libelle: string
  actif: boolean
  utilisees: number
  restantes: number
  utilisations: Utilisation[]
  creePar: string
  creeLe: string
}
interface CompteVip {
  _id: string
  username: string
  telephone: string
  quartier: string
  vip: { actif: boolean; depuis: string | null; code: string; typeCode: string; libelleCode: string; retireLe: string | null; retirePar: string }
}

const auth = useAuthStore()
const toast = useToast()
const queryClient = useQueryClient()
const ecriture = computed(() => peutEcrire(auth.role.value, 'vip'))

const onglet = ref<'codes' | 'comptes'>('codes')

const { data: codes, isLoading: chargementCodes, isError: erreurCodes } = useQuery({
  queryKey: ['vip', 'codes'],
  queryFn: async () => (await api.get('/api/admin/vip/codes')).data.codes as CodeVip[],
})
const { data: comptes, isLoading: chargementComptes, isError: erreurComptes } = useQuery({
  queryKey: ['vip', 'comptes'],
  queryFn: async () => (await api.get('/api/admin/vip/comptes')).data.comptes as CompteVip[],
})
const comptesActifs = computed(() => (comptes.value ?? []).filter(c => c.vip.actif))
const comptesRetires = computed(() => (comptes.value ?? []).filter(c => !c.vip.actif))

const dateFr = (d: string | null) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '')
const libelleType = (type: string) => (type === 'partage' ? 'Partagé' : type === 'personnel' ? 'Personnel' : '')

// --- Création d'un code (admin) ---
const nouveau = reactive({ type: 'personnel' as 'personnel' | 'partage', plafond: 10 as number | string, libelle: '', code: '' })
const creation = ref(false)
const erreurCreation = ref('')
const dernierCree = ref<CodeVip | null>(null)

async function creer() {
  erreurCreation.value = ''
  creation.value = true
  try {
    const corps = {
      type: nouveau.type,
      ...(nouveau.type === 'partage' ? { plafond: Number(nouveau.plafond) } : {}),
      libelle: nouveau.libelle.trim(),
      code: nouveau.code.trim().toUpperCase(), // Vide : le serveur en crée un au hasard
    }
    const { data } = await api.post('/api/admin/vip/codes', corps)
    dernierCree.value = data.code
    toast.success(data.message)
    nouveau.libelle = ''
    nouveau.code = ''
    queryClient.invalidateQueries({ queryKey: ['vip', 'codes'] })
  } catch (err) {
    erreurCreation.value = messageErreur(err, 'Création impossible.')
  } finally {
    creation.value = false
  }
}

// --- Copie d'un code ---
const copie = ref('') // Code qui vient d'être copié (« Copié » pendant 2 s)
let minuterieCopie: number | undefined
async function copier(code: string, event: MouseEvent) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Presse-papiers indisponible')
    await navigator.clipboard.writeText(code)
    copie.value = code
    window.clearTimeout(minuterieCopie)
    minuterieCopie = window.setTimeout(() => { copie.value = '' }, 2000)
    toast.success(`Code ${code} copié.`)
  } catch {
    // Copie refusée (navigateur ancien, autorisation) : le code est sélectionné pour une copie à la main
    const element = (event.currentTarget as HTMLElement | null)?.closest('[data-code]')?.querySelector('code')
    if (element) {
      const selection = window.getSelection()
      const plage = document.createRange()
      plage.selectNodeContents(element)
      selection?.removeAllRanges()
      selection?.addRange(plage)
    }
    toast.info('Copie automatique impossible : le code est sélectionné, copiez-le (Ctrl+C ou appui long).')
  }
}

// --- Désactivation et réactivation (admin) ---
async function basculerCode(c: CodeVip) {
  if (c.actif) {
    const choix = await Swal.fire({
      title: `Désactiver le code ${c.code} ?`,
      text: 'Plus personne ne pourra l’utiliser. Les comptes déjà VIP le restent. Vous pourrez le réactiver.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Désactiver',
      cancelButtonText: 'Annuler',
      confirmButtonColor: 'var(--color-foret)',
      cancelButtonColor: 'var(--color-gris)',
      customClass: { popup: 'rounded-2xl font-body' },
    })
    if (!choix.isConfirmed) return
  }
  try {
    const { data } = await api.patch(`/api/admin/vip/codes/${c._id}`, { actif: !c.actif })
    toast.success(data.message)
    queryClient.invalidateQueries({ queryKey: ['vip', 'codes'] })
  } catch (err) {
    toast.error(messageErreur(err, 'Action impossible.'))
  }
}

// --- Retrait du statut VIP (admin) : motif facultatif, gardé dans le journal ---
async function retirerStatut(compte: CompteVip) {
  const choix = await Swal.fire({
    title: `Retirer le statut VIP de ${compte.username} ?`,
    text: 'Le client ne pourra plus passer d’achat libre. Ses commandes restent. Il pourra redevenir VIP avec un nouveau code.',
    icon: 'warning',
    input: 'textarea',
    inputLabel: 'Motif (facultatif, gardé dans le journal)',
    inputPlaceholder: 'Ex. fin de l’opération rentrée',
    inputAttributes: { maxlength: String(MOTIF_RETRAIT.max), 'aria-label': 'Motif du retrait (facultatif)' },
    showCancelButton: true,
    confirmButtonText: 'Retirer le statut VIP',
    cancelButtonText: 'Annuler',
    confirmButtonColor: 'var(--color-foret)',
    cancelButtonColor: 'var(--color-gris)',
    customClass: { popup: 'rounded-2xl font-body' },
  })
  if (!choix.isConfirmed) return
  try {
    const motif = typeof choix.value === 'string' ? choix.value.trim() : ''
    const { data } = await api.post(`/api/admin/vip/comptes/${compte._id}/retrait`, motif ? { motif } : {})
    toast.success(data.message)
    queryClient.invalidateQueries({ queryKey: ['vip'] })
  } catch (err) {
    toast.error(messageErreur(err, 'Retrait impossible.'))
  }
}

const champ = 'mt-1 w-full min-h-11 px-3 py-2 rounded-xl border border-creme2 bg-creme text-sm text-noir font-normal'
const boutonOnglet = (actif: boolean) => [
  'cursor-pointer min-h-11 px-4 rounded-full text-xs font-bold whitespace-nowrap border',
  actif ? 'bg-foret text-white border-foret' : 'bg-white text-gris border-creme2',
]
</script>

<template>
  <div class="space-y-5 text-sm text-gris">
    <!-- En-tête -->
    <div class="bg-white p-4 rounded-2xl">
      <h1 class="font-display font-bold text-xl text-noir flex items-center gap-2"><Crown class="w-5 h-5 text-or-deep" aria-hidden="true" /> Codes VIP</h1>
      <p class="text-xs mt-1">
        Un client qui saisit un code dans son espace devient VIP : il commande au détail, au prix VIP (champ « Prix VIP » des Produits).
        Le statut reste jusqu'à son retrait.
        <template v-if="!ecriture"> Lecture seule.</template>
      </p>
    </div>

    <!-- Onglets -->
    <div v-onglets class="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Codes et comptes VIP">
      <button id="onglet-codes" type="button" role="tab" :aria-selected="onglet === 'codes'" aria-controls="panneau-codes" :class="boutonOnglet(onglet === 'codes')" @click="onglet = 'codes'">
        Codes ({{ codes?.length ?? 0 }})
      </button>
      <button id="onglet-comptes" type="button" role="tab" :aria-selected="onglet === 'comptes'" aria-controls="panneau-comptes" :class="boutonOnglet(onglet === 'comptes')" @click="onglet = 'comptes'">
        Comptes VIP ({{ comptesActifs.length }})
      </button>
    </div>

    <!-- CODES -->
    <section v-show="onglet === 'codes'" id="panneau-codes" role="tabpanel" aria-labelledby="onglet-codes" class="space-y-4">
      <!-- Création (admin) -->
      <form v-if="ecriture" @submit.prevent="creer" class="bg-white rounded-2xl p-4 space-y-3" aria-labelledby="titre-creation">
        <h2 id="titre-creation" class="font-bold text-noir">Créer un code</h2>
        <fieldset class="flex flex-col sm:flex-row gap-2">
          <legend class="sr-only">Type de code</legend>
          <label class="flex-1 flex items-start gap-2 p-3 rounded-xl border cursor-pointer min-h-11" :class="nouveau.type === 'personnel' ? 'border-foret bg-foret/5' : 'border-creme2'">
            <input v-model="nouveau.type" type="radio" value="personnel" name="type-code" class="mt-0.5 w-4 h-4 accent-foret" />
            <span><strong class="text-noir">Personnel</strong><span class="block text-xs">Un seul client</span></span>
          </label>
          <label class="flex-1 flex items-start gap-2 p-3 rounded-xl border cursor-pointer min-h-11" :class="nouveau.type === 'partage' ? 'border-foret bg-foret/5' : 'border-creme2'">
            <input v-model="nouveau.type" type="radio" value="partage" name="type-code" class="mt-0.5 w-4 h-4 accent-foret" />
            <span><strong class="text-noir">Partagé</strong><span class="block text-xs">Plusieurs clients, jusqu'au plafond</span></span>
          </label>
        </fieldset>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label v-if="nouveau.type === 'partage'" class="block text-xs font-bold text-noir">Plafond (clients) *
            <input v-model="nouveau.plafond" type="number" required min="1" :max="PLAFOND_MAX" step="1" inputmode="numeric" :class="champ" />
          </label>
          <label class="block text-xs font-bold text-noir">Libellé
            <input v-model="nouveau.libelle" :maxlength="LIBELLE_CODE_MAX" :class="champ" placeholder="Ex. Mme Adjovi, opération rentrée" />
          </label>
          <label class="block text-xs font-bold text-noir">Code
            <input
              v-model="nouveau.code" maxlength="30" :pattern="FORMAT_CODE" autocomplete="off" autocapitalize="characters" spellcheck="false"
              :class="[champ, 'uppercase font-mono placeholder:normal-case placeholder:font-body']" placeholder="Vide : créé au hasard" aria-describedby="aide-code"
              title="4 à 30 caractères : lettres, chiffres et tirets"
            />
          </label>
        </div>
        <p id="aide-code" class="text-xs">Code vide : Ahitché en crée un, facile à taper (ex. AHI-VIP-7K2Q4M). Sinon 4 à 30 caractères : lettres, chiffres et tirets.</p>
        <p v-if="erreurCreation" role="alert" class="p-3 rounded-xl bg-red-50 text-red-800 text-xs font-semibold">{{ erreurCreation }}</p>
        <div class="flex flex-col sm:flex-row sm:items-center gap-3">
          <button type="submit" :disabled="creation" class="cursor-pointer min-h-11 px-5 rounded-xl bg-foret text-white font-bold text-xs hover:bg-savane disabled:opacity-60">
            {{ creation ? 'Création…' : 'Créer le code' }}
          </button>
          <!-- Code qui vient d'être créé : à transmettre au client -->
          <div v-if="dernierCree" data-code role="status" class="flex flex-wrap items-center gap-2 p-2 pl-3 rounded-xl bg-or/15 text-noir text-xs">
            <span>Code créé :</span>
            <code class="font-mono font-bold text-sm select-all">{{ dernierCree.code }}</code>
            <button type="button" @click="copier(dernierCree.code, $event)" class="cursor-pointer inline-flex items-center gap-1 min-h-10 px-3 rounded-lg bg-white border border-creme2 font-bold text-foret">
              <Check v-if="copie === dernierCree.code" class="w-4 h-4" aria-hidden="true" /><Copy v-else class="w-4 h-4" aria-hidden="true" />
              {{ copie === dernierCree.code ? 'Copié' : 'Copier' }}
            </button>
          </div>
        </div>
      </form>

      <p v-if="chargementCodes" class="bg-white rounded-2xl p-6 text-center">Chargement des codes…</p>
      <p v-else-if="erreurCodes" class="bg-red-50 text-red-700 rounded-2xl p-6 text-center">Les codes n'ont pas pu être chargés.</p>
      <p v-else-if="!codes?.length" class="bg-white rounded-2xl p-6 text-center">Aucun code pour le moment.</p>
      <ul v-else class="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <li v-for="c in codes" :key="c._id" data-code class="bg-white rounded-2xl p-4 space-y-3" :class="{ 'opacity-75': !c.actif }">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2 min-w-0">
              <code class="font-mono font-bold text-base text-noir break-all select-all">{{ c.code }}</code>
              <button type="button" @click="copier(c.code, $event)" class="cursor-pointer inline-flex items-center gap-1 min-h-10 px-3 rounded-lg border border-creme2 text-xs font-bold text-foret hover:bg-creme" :aria-label="`Copier le code ${c.code}`">
                <Check v-if="copie === c.code" class="w-4 h-4" aria-hidden="true" /><Copy v-else class="w-4 h-4" aria-hidden="true" />
                {{ copie === c.code ? 'Copié' : 'Copier' }}
              </button>
            </div>
            <div class="flex flex-wrap gap-1.5">
              <span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-creme2 text-noir">{{ libelleType(c.type) }}</span>
              <span v-if="!c.actif" class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-creme2 text-gris">Désactivé</span>
              <span v-else-if="!c.restantes" class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-or/25 text-noir">Épuisé</span>
              <span v-else class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-foret/10 text-foret">Actif</span>
            </div>
          </div>
          <p v-if="c.libelle" class="text-noir font-semibold">{{ c.libelle }}</p>

          <div>
            <p class="text-xs"><strong class="text-noir">{{ c.utilisees }} / {{ c.plafond }}</strong> utilisation(s)<template v-if="c.actif && c.restantes"> · {{ c.restantes }} restante(s)</template></p>
            <div class="mt-1 h-1.5 rounded-full bg-creme2 overflow-hidden" aria-hidden="true">
              <div class="h-full rounded-full bg-savane" :style="{ width: `${Math.min(100, Math.round((c.utilisees / c.plafond) * 100))}%` }"></div>
            </div>
          </div>

          <details v-if="c.utilisations.length" class="text-xs">
            <summary class="cursor-pointer min-h-10 flex items-center font-bold text-foret">Clients qui l'ont utilisé ({{ c.utilisations.length }})</summary>
            <ul class="mt-1 divide-y divide-creme2">
              <li v-for="u in c.utilisations" :key="`${u.userId}-${u.date}`" class="py-1.5 flex flex-wrap justify-between gap-x-3">
                <span class="text-noir font-semibold">{{ u.client }}<template v-if="u.telephone"> · {{ u.telephone }}</template></span>
                <span>{{ dateFr(u.date) }}</span>
              </li>
            </ul>
          </details>
          <p v-else class="text-xs">Pas encore utilisé.</p>

          <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-creme2">
            <p class="text-[11px]">Créé le {{ dateFr(c.creeLe) }}<template v-if="c.creePar"> par {{ c.creePar }}</template></p>
            <button v-if="ecriture" type="button" @click="basculerCode(c)" class="cursor-pointer inline-flex items-center gap-1.5 min-h-10 px-3 rounded-xl text-xs font-bold" :class="c.actif ? 'bg-creme text-gris hover:bg-creme2' : 'bg-foret/10 text-foret hover:bg-foret/20'">
              <Power v-if="c.actif" class="w-4 h-4" aria-hidden="true" /><RotateCcw v-else class="w-4 h-4" aria-hidden="true" />
              {{ c.actif ? 'Désactiver' : 'Réactiver' }}
            </button>
          </div>
        </li>
      </ul>
    </section>

    <!-- COMPTES VIP -->
    <section v-show="onglet === 'comptes'" id="panneau-comptes" role="tabpanel" aria-labelledby="onglet-comptes" class="space-y-4">
      <p v-if="chargementComptes" class="bg-white rounded-2xl p-6 text-center">Chargement des comptes…</p>
      <p v-else-if="erreurComptes" class="bg-red-50 text-red-700 rounded-2xl p-6 text-center">Les comptes n'ont pas pu être chargés.</p>
      <template v-else>
        <p v-if="!comptesActifs.length" class="bg-white rounded-2xl p-6 text-center">Aucun compte VIP pour le moment.</p>
        <ul v-else class="bg-white rounded-2xl divide-y divide-creme2" aria-label="Comptes VIP">
          <li v-for="compte in comptesActifs" :key="compte._id" class="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div class="flex-1 min-w-0 space-y-0.5">
              <p class="font-bold text-noir flex flex-wrap items-center gap-2">{{ compte.username }} <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-or text-noir">VIP</span></p>
              <p class="text-xs"><template v-if="compte.telephone">{{ compte.telephone }}</template><template v-if="compte.telephone && compte.quartier"> · </template>{{ compte.quartier }}</p>
              <p class="text-xs">
                VIP depuis le {{ dateFr(compte.vip.depuis) }}<template v-if="compte.vip.code"> · code <code class="font-mono text-noir">{{ compte.vip.code }}</code> ({{ libelleType(compte.vip.typeCode).toLowerCase() }}<template v-if="compte.vip.libelleCode"> · {{ compte.vip.libelleCode }}</template>)</template>
              </p>
            </div>
            <button v-if="ecriture" type="button" @click="retirerStatut(compte)" class="cursor-pointer shrink-0 inline-flex items-center justify-center gap-1.5 min-h-11 px-4 rounded-xl border border-red-200 text-red-700 text-xs font-bold hover:bg-red-50">
              <UserX class="w-4 h-4" aria-hidden="true" /> Retirer le statut VIP
            </button>
          </li>
        </ul>

        <details v-if="comptesRetires.length" class="bg-white rounded-2xl p-4">
          <summary class="cursor-pointer min-h-10 flex items-center font-bold text-noir">Statut retiré ({{ comptesRetires.length }})</summary>
          <ul class="mt-2 divide-y divide-creme2">
            <li v-for="compte in comptesRetires" :key="compte._id" class="py-2 text-xs space-y-0.5">
              <p class="font-bold text-noir text-sm">{{ compte.username }}</p>
              <p>VIP du {{ dateFr(compte.vip.depuis) }} au {{ dateFr(compte.vip.retireLe) }}<template v-if="compte.vip.retirePar"> · retiré par {{ compte.vip.retirePar }}</template></p>
            </li>
          </ul>
        </details>
      </template>
    </section>
  </div>
</template>
