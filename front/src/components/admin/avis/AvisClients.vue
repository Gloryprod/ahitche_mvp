<script setup lang="ts">
import { ref, computed } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { MessageSquareQuote, CheckCircle2, Ban, EyeOff, Trash2, Info } from 'lucide-vue-next'
import Swal from 'sweetalert2'
import api from '@/stores/api'
import { messageErreur } from '@/services/erreurs'
import { useAuthStore } from '@/stores/auth'
import { peutEcrire } from '@/config/roles'

// Avis clients : rédigés par les clients dans leur espace, affichés sur l'accueil seulement une fois publiés par l'admin.
// Le texte du client ne se modifie pas ici : l'admin publie, refuse (motif visible du client) ou supprime un indésirable.

type Statut = 'À valider' | 'Publié' | 'Refusé'
interface Avis {
  _id: string
  compte: string
  commandesLivrees: number
  prenom: string
  quartier: string
  note: number
  texte: string
  statut: Statut
  motif: string
  decidePar: string
  decideLe: string | null
  creeLe: string
  modifieLe: string
}

const CLASSES_STATUT: Record<Statut, string> = {
  'À valider': 'bg-amber-50 text-amber-800 border border-amber-200',
  'Publié': 'bg-green-50 text-green-800 border border-green-200',
  'Refusé': 'bg-creme2 text-gris',
}

const authStore = useAuthStore()
const ecriture = computed(() => peutEcrire(authStore.role.value, 'avis'))
const queryClient = useQueryClient()

const notification = ref({ text: '', type: '' })
const notifier = (text: string, type: string) => {
  notification.value = { text, type }
  setTimeout(() => notification.value = { text: '', type: '' }, 4000)
}

const filtre = ref<'' | Statut>('À valider')
const { data: avis, isLoading } = useQuery({
  queryKey: ['avis'],
  queryFn: async (): Promise<Avis[]> => (await api.get('/api/admin/avis')).data,
})
const avisFiltres = computed(() => (avis.value ?? []).filter(a => !filtre.value || a.statut === filtre.value))
const nombre = (s: Statut) => (avis.value ?? []).filter(a => a.statut === s).length

const rafraichir = () => queryClient.invalidateQueries({ queryKey: ['avis'] })

async function decider(a: Avis, decision: 'publier' | 'refuser') {
  let motif = ''
  if (decision === 'refuser') {
    const saisie = await Swal.fire({
      title: a.statut === 'Publié' ? 'Retirer du site' : 'Refuser cet avis',
      input: 'text', inputLabel: 'Motif (visible du client)', inputPlaceholder: 'Ex : merci de retirer le numéro de téléphone',
      showCancelButton: true, confirmButtonColor: '#1A5C38', confirmButtonText: a.statut === 'Publié' ? 'Retirer' : 'Refuser', cancelButtonText: 'Annuler',
      inputValidator: (v: string) => (v.trim().length < 3 ? 'Indiquez le motif.' : null)
    })
    if (!saisie.isConfirmed) return
    motif = saisie.value
  }
  try {
    const { message } = (await api.post(`/api/admin/avis/${a._id}/decision`, { decision, motif })).data
    notifier(message, 'success')
    rafraichir()
  } catch (err) {
    notifier(messageErreur(err, 'Décision impossible'), 'error')
  }
}

async function supprimer(a: Avis) {
  const choix = await Swal.fire({
    title: `Supprimer l'avis de ${a.prenom} ?`, text: 'Réservé aux indésirables (publicité, propos injurieux). Le client ne le verra plus dans son espace.',
    icon: 'warning', showCancelButton: true, confirmButtonColor: '#1A5C38', confirmButtonText: 'Supprimer', cancelButtonText: 'Annuler'
  })
  if (!choix.isConfirmed) return
  try {
    await api.delete(`/api/admin/avis/${a._id}`)
    notifier('Avis supprimé.', 'success')
    rafraichir()
  } catch (err) {
    notifier(messageErreur(err, 'Suppression impossible'), 'error')
  }
}

const dateFr = (d?: string | null) => (d ? new Date(d).toLocaleDateString('fr-FR') : '')
</script>

<template>
  <div class="space-y-4 animate-fadeIn text-sm text-noir">
    <div v-if="notification.text" role="status" :class="[notification.type === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-700 border-red-200', 'p-4 rounded-xl border text-xs font-semibold fixed top-4 right-4 left-4 sm:left-auto z-50 max-w-sm']">
      {{ notification.text }}
    </div>

    <div class="bg-white p-4 rounded-2xl space-y-2">
      <h1 class="font-display font-bold text-xl flex items-center gap-2"><MessageSquareQuote class="w-5 h-5 text-foret" /> Avis clients</h1>
      <p class="text-xs text-gris flex items-start gap-1.5"><Info class="w-3.5 h-3.5 shrink-0 mt-0.5" /> Les clients rédigent leur avis dans leur espace. Il n'apparaît sur l'accueil, à côté des témoignages, qu'une fois publié. Le texte ne se modifie pas : en cas de souci, refusez-le avec un motif, le client pourra le corriger.</p>
    </div>

    <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrer les avis">
      <button v-for="s in (['À valider', 'Publié', 'Refusé', ''] as const)" :key="s" @click="filtre = s" :aria-pressed="filtre === s"
        :class="['cursor-pointer px-3 py-1.5 rounded-full text-xs font-bold border', filtre === s ? 'bg-foret text-white border-foret' : 'bg-white text-gris border-creme2']">
        {{ s || 'Tous' }}<template v-if="s"> ({{ nombre(s) }})</template>
      </button>
    </div>

    <p v-if="isLoading" class="text-center text-gris py-6">Chargement...</p>
    <p v-else-if="!avisFiltres.length" class="bg-white rounded-2xl p-6 text-center text-gris text-xs border border-dashed border-creme2">Aucun avis{{ filtre ? ` « ${filtre.toLowerCase()} »` : '' }} pour le moment.</p>
    <article v-for="a in avisFiltres" :key="a._id" class="bg-white rounded-2xl border border-creme2 p-4 text-xs space-y-2">
      <div class="flex items-start justify-between gap-2">
        <div class="flex gap-0.5 text-or" role="img" :aria-label="`Note : ${a.note} sur 5`">
          <svg v-for="n in 5" :key="n" :class="['w-4 h-4', n <= a.note ? 'fill-current' : 'fill-creme2']" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>
        </div>
        <span :class="['shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold', CLASSES_STATUT[a.statut]]">{{ a.statut }}</span>
      </div>
      <blockquote class="text-sm leading-relaxed">«&nbsp;{{ a.texte }}&nbsp;»</blockquote>
      <p class="font-bold text-foret">{{ a.prenom }}<span v-if="a.quartier" class="font-normal text-gris"> · {{ a.quartier }}</span></p>
      <p class="text-gris">
        Compte « {{ a.compte }} » ·
        <span :class="a.commandesLivrees ? 'text-foret font-semibold' : 'text-amber-800 font-semibold'">{{ a.commandesLivrees ? `${a.commandesLivrees} commande${a.commandesLivrees > 1 ? 's' : ''} livrée${a.commandesLivrees > 1 ? 's' : ''}` : 'aucune commande livrée' }}</span>
        · envoyé le {{ dateFr(a.modifieLe) }}
        <template v-if="a.statut !== 'À valider' && a.decidePar"> · {{ a.statut === 'Publié' ? 'publié' : 'refusé' }} par {{ a.decidePar }} le {{ dateFr(a.decideLe) }}</template>
      </p>
      <p v-if="a.statut === 'Refusé' && a.motif" class="text-amber-800">Motif : {{ a.motif }}</p>
      <div v-if="ecriture" class="flex flex-wrap items-center gap-2 pt-1">
        <button v-if="a.statut !== 'Publié'" @click="decider(a, 'publier')" class="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-foret text-white font-bold"><CheckCircle2 class="w-3.5 h-3.5" /> Publier</button>
        <button v-if="a.statut === 'À valider'" @click="decider(a, 'refuser')" class="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-creme2 font-bold"><Ban class="w-3.5 h-3.5" /> Refuser</button>
        <button v-if="a.statut === 'Publié'" @click="decider(a, 'refuser')" class="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-creme2 font-bold"><EyeOff class="w-3.5 h-3.5" /> Retirer du site</button>
        <button @click="supprimer(a)" class="cursor-pointer ml-auto p-1.5 text-gris hover:text-red-600" :aria-label="`Supprimer l'avis de ${a.prenom}`"><Trash2 class="w-3.5 h-3.5" /></button>
      </div>
    </article>
  </div>
</template>
