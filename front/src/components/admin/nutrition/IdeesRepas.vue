<script setup lang="ts">
import { ref, computed } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { UtensilsCrossed, Plus, Trash2, Edit2, CheckCircle2, Undo2, Info } from 'lucide-vue-next'
import Swal from 'sweetalert2'
import api from '@/stores/api'
import { useAuthStore } from '@/stores/auth'
import { peutEcrire } from '@/config/roles'

// Idées de repas par formule (D-18) : rédigées par l'équipe (gestionnaire, nutritionniste), sans conseil de santé,
// publiées seulement après validation du porteur (admin). Toute modification retire la publication.

type Statut = 'Brouillon' | 'À valider' | 'Publié'
interface Idee {
  _id?: string
  formuleSlug: string
  titre: string
  jours: { jour: string; dejeuner: string; diner: string }[]
  conseil: string
  statut: Statut
  remarque?: string
  auteur?: { username: string }
  validePar?: { username: string } | null
  valideLe?: string | null
}

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const FORMULES = [
  { slug: 'ahi-essentiel', nom: 'AHI Essentiel' }, { slug: 'ahi-equilibre', nom: 'AHI Équilibré' }, { slug: 'ahi-confort', nom: 'AHI Confort' },
  { slug: 'ahi-reserve', nom: 'AHI Réserve' }, { slug: 'ahi-fraicheur', nom: 'AHI Fraîcheur' },
]
const MENTION = "Ces conseils ne remplacent pas l'avis d'un professionnel de santé."
const CLASSES_STATUT: Record<Statut, string> = {
  'Brouillon': 'bg-creme2 text-gris',
  'À valider': 'bg-amber-50 text-amber-800 border border-amber-200',
  'Publié': 'bg-green-50 text-green-800 border border-green-200',
}

const authStore = useAuthStore()
const ecriture = computed(() => peutEcrire(authStore.role.value, 'repas'))
const estAdmin = computed(() => authStore.role.value === 'admin')
const queryClient = useQueryClient()

const notification = ref({ text: '', type: '' })
const notifier = (text: string, type: string) => {
  notification.value = { text, type }
  setTimeout(() => notification.value = { text: '', type: '' }, 4000)
}

const filtre = ref<'' | Statut>('')
const { data: idees, isLoading } = useQuery({
  queryKey: ['repas'],
  queryFn: async (): Promise<(Idee & { _id: string })[]> => (await api.get('/api/admin/repas')).data,
})
const ideesFiltrees = computed(() => (idees.value ?? []).filter(i => !filtre.value || i.statut === filtre.value))
const aValider = computed(() => (idees.value ?? []).filter(i => i.statut === 'À valider').length)

const vide = (): Idee => ({ formuleSlug: 'ahi-essentiel', titre: '', jours: JOURS.map(jour => ({ jour, dejeuner: '', diner: '' })), conseil: '', statut: 'Brouillon' })
const edition = ref<Idee | null>(null)
const editer = (i?: Idee) => {
  edition.value = i ? { ...i, jours: JOURS.map(jour => ({ jour, dejeuner: '', diner: '', ...i.jours.find(j => j.jour === jour) })) } : vide()
}

const rafraichir = () => queryClient.invalidateQueries({ queryKey: ['repas'] })

async function enregistrer(statut: 'Brouillon' | 'À valider') {
  if (!edition.value) return
  const { _id, formuleSlug, titre, jours, conseil } = edition.value
  try {
    if (_id) await api.put(`/api/admin/repas/${_id}`, { formuleSlug, titre, jours, conseil, statut })
    else await api.post('/api/admin/repas', { formuleSlug, titre, jours, conseil, statut })
    notifier(statut === 'À valider' ? 'Idée envoyée pour validation.' : 'Brouillon enregistré.', 'success')
    edition.value = null
    rafraichir()
  } catch (err: any) {
    notifier(err.response?.data?.message || 'Enregistrement impossible', 'error')
  }
}

async function decider(i: Idee & { _id: string }, decision: 'publier' | 'renvoyer') {
  let remarque = ''
  if (decision === 'renvoyer') {
    const saisie = await Swal.fire({ title: 'Renvoyer en brouillon', input: 'text', inputLabel: 'Ce qu\'il faut revoir', showCancelButton: true, confirmButtonColor: '#1A5C38', confirmButtonText: 'Renvoyer', cancelButtonText: 'Annuler', inputValidator: (v: string) => (v.trim().length < 3 ? 'Indiquez ce qu\'il faut revoir.' : null) })
    if (!saisie.isConfirmed) return
    remarque = saisie.value
  }
  try {
    const { message } = (await api.post(`/api/admin/repas/${i._id}/decision`, { decision, remarque })).data
    notifier(message, 'success')
    rafraichir()
  } catch (err: any) {
    notifier(err.response?.data?.message || 'Décision impossible', 'error')
  }
}

async function supprimer(i: Idee & { _id: string }) {
  const choix = await Swal.fire({ title: `Supprimer « ${i.titre} » ?`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#1A5C38', confirmButtonText: 'Supprimer', cancelButtonText: 'Annuler' })
  if (!choix.isConfirmed) return
  try {
    await api.delete(`/api/admin/repas/${i._id}`)
    notifier('Idée de repas supprimée.', 'success')
    rafraichir()
  } catch (err: any) {
    notifier(err.response?.data?.message || 'Suppression impossible', 'error')
  }
}

const nomFormule = (slug: string) => FORMULES.find(f => f.slug === slug)?.nom ?? slug
const dateFr = (d?: string | null) => (d ? new Date(d).toLocaleDateString('fr-FR') : '')
const champ = 'mt-1 w-full px-3 py-2 rounded-lg border border-creme2 bg-creme text-sm font-normal normal-case text-noir'
</script>

<template>
  <div class="space-y-4 animate-fadeIn text-sm text-noir">
    <div v-if="notification.text" role="status" :class="[notification.type === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-700 border-red-200', 'p-4 rounded-xl border text-xs font-semibold fixed top-4 right-4 left-4 sm:left-auto z-50 max-w-sm']">
      {{ notification.text }}
    </div>

    <div class="bg-white p-4 rounded-2xl space-y-2">
      <h1 class="font-display font-bold text-xl flex items-center gap-2"><UtensilsCrossed class="w-5 h-5 text-foret" /> Idées de repas</h1>
      <p class="text-xs text-gris flex items-start gap-1.5"><Info class="w-3.5 h-3.5 shrink-0 mt-0.5" /> Idées de repas avec les produits des formules, sans conseil de santé. Une idée n'est visible des clients qu'une fois publiée par l'admin, avec la mention : « {{ MENTION }} »</p>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <button v-for="s in (['', 'Brouillon', 'À valider', 'Publié'] as const)" :key="s" @click="filtre = s"
        :class="['cursor-pointer px-3 py-1.5 rounded-full text-xs font-bold border', filtre === s ? 'bg-foret text-white border-foret' : 'bg-white text-gris border-creme2']">
        {{ s || 'Toutes' }}<template v-if="s === 'À valider' && aValider"> ({{ aValider }})</template>
      </button>
      <button v-if="ecriture && !edition" @click="editer()" class="cursor-pointer ml-auto inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-foret text-white text-xs font-bold"><Plus class="w-3.5 h-3.5" /> Nouvelle idée</button>
    </div>

    <form v-if="edition" @submit.prevent="enregistrer('À valider')" class="bg-white rounded-2xl border border-creme2 p-4 space-y-3 text-xs">
      <p v-if="edition.statut === 'Publié'" class="p-2 rounded-lg bg-amber-50 text-amber-900">Cette idée est publiée : la modifier la retire des espaces clients jusqu'à une nouvelle validation.</p>
      <p v-if="edition.remarque" class="p-2 rounded-lg bg-creme text-noir">À revoir : {{ edition.remarque }}</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label class="font-bold uppercase text-[10px] text-gris">Formule
          <select v-model="edition.formuleSlug" :class="champ">
            <option v-for="f in FORMULES" :key="f.slug" :value="f.slug">{{ f.nom }}</option>
          </select>
        </label>
        <label class="font-bold uppercase text-[10px] text-gris">Titre
          <input v-model="edition.titre" required maxlength="120" placeholder="Ex : Semaine variée à petit budget" :class="champ" />
        </label>
      </div>
      <div class="space-y-2">
        <p class="font-bold uppercase text-[10px] text-gris">Repas de la semaine</p>
        <div v-for="j in edition.jours" :key="j.jour" class="grid grid-cols-1 sm:grid-cols-[6rem_1fr_1fr] gap-2 items-center">
          <span class="font-semibold">{{ j.jour }}</span>
          <input v-model="j.dejeuner" maxlength="200" :placeholder="`Déjeuner du ${j.jour.toLowerCase()}`" :aria-label="`Déjeuner du ${j.jour.toLowerCase()}`" class="px-3 py-2 rounded-lg border border-creme2 bg-creme text-sm" />
          <input v-model="j.diner" maxlength="200" :placeholder="`Dîner du ${j.jour.toLowerCase()}`" :aria-label="`Dîner du ${j.jour.toLowerCase()}`" class="px-3 py-2 rounded-lg border border-creme2 bg-creme text-sm" />
        </div>
      </div>
      <label class="block font-bold uppercase text-[10px] text-gris">Astuce de préparation (facultatif, sans conseil de santé)
        <textarea v-model="edition.conseil" rows="2" maxlength="500" :class="[champ, 'resize-none']"></textarea>
      </label>
      <div class="flex flex-wrap gap-2">
        <button type="submit" class="cursor-pointer flex-1 px-3 py-2.5 rounded-xl bg-foret text-white font-bold">Envoyer pour validation</button>
        <button type="button" @click="enregistrer('Brouillon')" class="cursor-pointer px-3 py-2.5 rounded-xl border border-foret text-foret font-bold">Garder en brouillon</button>
        <button type="button" @click="edition = null" class="cursor-pointer px-3 py-2.5 rounded-xl border border-creme2 font-semibold">Annuler</button>
      </div>
    </form>

    <p v-if="isLoading" class="text-center text-gris py-6">Chargement...</p>
    <p v-else-if="!ideesFiltrees.length && !edition" class="bg-white rounded-2xl p-6 text-center text-gris text-xs border border-dashed border-creme2">Aucune idée de repas{{ filtre ? ` « ${filtre.toLowerCase()} »` : '' }} pour le moment.</p>
    <article v-for="i in ideesFiltrees" :key="i._id" class="bg-white rounded-2xl border border-creme2 p-4 text-xs space-y-1.5">
      <div class="flex items-start justify-between gap-2">
        <div>
          <p class="font-bold text-sm">{{ i.titre }}</p>
          <p class="text-gris">{{ nomFormule(i.formuleSlug) }}<template v-if="i.auteur"> · {{ i.auteur.username }}</template><template v-if="i.statut === 'Publié' && i.validePar"> · publiée par {{ i.validePar.username }} le {{ dateFr(i.valideLe) }}</template></p>
        </div>
        <span :class="['shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold', CLASSES_STATUT[i.statut]]">{{ i.statut }}</span>
      </div>
      <p v-if="i.remarque && i.statut === 'Brouillon'" class="text-amber-800">À revoir : {{ i.remarque }}</p>
      <p v-for="j in i.jours.filter(j => j.dejeuner || j.diner)" :key="j.jour"><strong>{{ j.jour }}</strong> : {{ j.dejeuner || '-' }} / {{ j.diner || '-' }}</p>
      <p v-if="i.conseil" class="text-gris italic">{{ i.conseil }}</p>
      <div class="flex flex-wrap gap-2 pt-1">
        <template v-if="estAdmin && i.statut !== 'Publié'">
          <button @click="decider(i, 'publier')" class="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-foret text-white font-bold"><CheckCircle2 class="w-3.5 h-3.5" /> Publier</button>
          <button v-if="i.statut === 'À valider'" @click="decider(i, 'renvoyer')" class="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-creme2 font-bold"><Undo2 class="w-3.5 h-3.5" /> Renvoyer</button>
        </template>
        <template v-if="ecriture">
          <button @click="editer(i)" class="cursor-pointer p-1.5 text-gris hover:text-savane" :aria-label="`Modifier ${i.titre}`"><Edit2 class="w-3.5 h-3.5" /></button>
          <button v-if="i.statut !== 'Publié' || estAdmin" @click="supprimer(i)" class="cursor-pointer p-1.5 text-gris hover:text-red-600" :aria-label="`Supprimer ${i.titre}`"><Trash2 class="w-3.5 h-3.5" /></button>
        </template>
      </div>
    </article>
  </div>
</template>
