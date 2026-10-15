<script setup lang="ts">
import { ref, reactive, computed, onMounted, nextTick } from 'vue'
import { MessageSquareQuote, Edit3, Trash2 } from 'lucide-vue-next'
import Swal from 'sweetalert2'
import { useToast } from 'vue-toastification'
import api from '@/stores/api'
import { messageErreur } from '@/services/erreurs'
import { useAuthStore } from '@/stores/auth'

// Avis du client sur Ahitché : affiché sur l'accueil (« Ce que disent nos clients ») après validation de l'admin.
// Un avis par client ; toute modification repasse par la validation ; suppression à tout moment.

type Statut = 'À valider' | 'Publié' | 'Refusé'
interface Avis { prenom: string; quartier: string; note: number; texte: string; statut: Statut; motif: string }

const TEXTE_MIN = 15
const TEXTE_MAX = 600
const ETATS: Record<Statut, { libelle: string; classes: string }> = {
  'À valider': { libelle: 'En attente de validation', classes: 'bg-amber-50 text-amber-800 border border-amber-200' },
  'Publié': { libelle: 'Publié sur le site', classes: 'bg-green-50 text-green-800 border border-green-200' },
  'Refusé': { libelle: 'Non publié', classes: 'bg-creme2 text-noir' },
}

const authStore = useAuthStore()
const toast = useToast()
const chargement = ref(true)
const avis = ref<Avis | null>(null)
const enEdition = ref(false)
const envoi = ref(false)

const form = reactive({ prenom: '', quartier: '', note: 0, texte: '', consentement: false })
const longueur = computed(() => form.texte.trim().length)

async function charger() {
  chargement.value = true
  try {
    avis.value = (await api.get('/api/auth/avis')).data.avis
  } catch {
    // Section secondaire : en cas d'erreur, le reste de l'espace client reste utilisable
  } finally {
    chargement.value = false
  }
}
// Lien « Donnez votre avis » de l'accueil (/dashboard/user#mon-avis) : la section s'affiche à l'écran
onMounted(async () => {
  await charger()
  if (location.hash === '#mon-avis') {
    await nextTick()
    document.getElementById('mon-avis')?.scrollIntoView({ block: 'start' })
  }
})

function ouvrir() {
  form.prenom = avis.value?.prenom ?? ''
  form.quartier = avis.value?.quartier ?? authStore.user.value?.quartier ?? ''
  form.note = avis.value?.note ?? 0
  form.texte = avis.value?.texte ?? ''
  form.consentement = false
  enEdition.value = true
}

async function envoyer() {
  if (!form.note) return toast.error('Choisissez une note de 1 à 5 étoiles.')
  envoi.value = true
  try {
    const { data } = await api.put('/api/auth/avis', form)
    toast.success(data.message)
    avis.value = data.avis
    enEdition.value = false
  } catch (err) {
    toast.error(messageErreur(err, "Impossible d'envoyer votre avis."))
  } finally {
    envoi.value = false
  }
}

async function supprimer() {
  const choix = await Swal.fire({
    title: 'Supprimer votre avis ?',
    text: avis.value?.statut === 'Publié' ? 'Il sera retiré du site.' : '',
    icon: 'warning', showCancelButton: true, confirmButtonColor: '#1A5C38',
    confirmButtonText: 'Oui, supprimer', cancelButtonText: 'Annuler', customClass: { popup: 'rounded-2xl font-body' }
  })
  if (!choix.isConfirmed) return
  try {
    const { data } = await api.delete('/api/auth/avis')
    toast.success(data.message)
    avis.value = null
  } catch {
    toast.error('Suppression impossible pour le moment.')
  }
}

const champ = 'mt-1 w-full px-4 py-2.5 border border-creme2 rounded-xl text-sm font-normal normal-case text-noir'
</script>

<template>
  <section id="mon-avis" class="bg-white rounded-2xl p-6 border border-creme2 shadow-sm space-y-5" aria-labelledby="titre-avis">
    <div class="flex items-center gap-3">
      <div class="p-2 bg-creme rounded-xl border border-creme2"><MessageSquareQuote class="w-5 h-5 text-foret" /></div>
      <div>
        <h2 id="titre-avis" class="font-display font-bold text-xl">Mon avis</h2>
        <p class="text-xs text-gris">Publié sur notre site après validation</p>
      </div>
    </div>

    <p v-if="chargement" class="text-sm text-gris">Chargement...</p>

    <!-- Rédaction ou modification -->
    <form v-else-if="enEdition" @submit.prevent="envoyer" class="space-y-4 text-sm">
      <p v-if="avis?.statut === 'Publié'" class="text-xs p-3 rounded-xl bg-amber-50 text-amber-900">
        Votre avis est publié : une fois modifié, il quitte le site jusqu'à sa nouvelle validation.
      </p>
      <fieldset>
        <legend class="text-xs font-bold uppercase tracking-wider text-gris mb-2">Votre note</legend>
        <div class="flex gap-1">
          <label v-for="n in 5" :key="n" class="cursor-pointer p-1 rounded-lg has-focus-visible:outline-2 has-focus-visible:outline-foret">
            <input v-model="form.note" :value="n" type="radio" name="note" class="sr-only" />
            <span class="sr-only">{{ n }} étoile{{ n > 1 ? 's' : '' }} sur 5</span>
            <svg :class="['w-8 h-8 transition-colors', n <= form.note ? 'fill-or' : 'fill-creme2']" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>
          </label>
        </div>
      </fieldset>
      <label class="block text-xs font-bold uppercase tracking-wider text-gris">Votre avis
        <textarea v-model="form.texte" required rows="4" :minlength="TEXTE_MIN" :maxlength="TEXTE_MAX" placeholder="Ex : produits frais, livraison à l'heure, ce que la formule change pour votre foyer…" :class="[champ, 'resize-none']"></textarea>
        <span :class="['block text-right text-[11px] font-normal normal-case tracking-normal mt-1', longueur < TEXTE_MIN ? 'text-gris' : 'text-foret']">{{ longueur }} / {{ TEXTE_MAX }}</span>
      </label>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label class="block text-xs font-bold uppercase tracking-wider text-gris">Prénom affiché
          <input v-model="form.prenom" required maxlength="40" autocomplete="given-name" placeholder="Ex : Nadine" :class="champ" />
        </label>
        <label class="block text-xs font-bold uppercase tracking-wider text-gris">Quartier (facultatif)
          <input v-model="form.quartier" maxlength="60" placeholder="Ex : Fidjrossè" :class="champ" />
        </label>
      </div>
      <label class="flex items-start gap-2 text-xs cursor-pointer">
        <input v-model="form.consentement" type="checkbox" required class="accent-foret w-4 h-4 mt-0.5 shrink-0" />
        <span>J'accepte qu'Ahitché publie sur son site mon prénom, mon quartier, ma note et mon avis, après validation. Je peux le modifier ou le supprimer à tout moment depuis mon espace.</span>
      </label>
      <div class="flex gap-3">
        <button type="submit" :disabled="envoi || !form.consentement" class="cursor-pointer flex-1 bg-foret text-white text-sm font-bold px-4 py-3 rounded-xl disabled:opacity-50">{{ envoi ? 'Envoi...' : 'Envoyer mon avis' }}</button>
        <button type="button" @click="enEdition = false" class="cursor-pointer px-4 py-3 border border-creme2 rounded-xl text-sm font-semibold">Annuler</button>
      </div>
    </form>

    <!-- Pas encore d'avis -->
    <div v-else-if="!avis" class="rounded-xl border border-dashed border-creme2 p-5 text-center space-y-3">
      <p class="text-sm text-gris">Votre expérience aide d'autres familles à nous faire confiance. Donnez votre avis : il apparaîtra sur notre site, à côté de ceux de nos clients.</p>
      <button @click="ouvrir" class="cursor-pointer px-5 py-3 rounded-xl bg-foret text-white text-sm font-bold">Donner mon avis</button>
    </div>

    <!-- Avis envoyé : état de la validation -->
    <template v-else>
      <figure class="rounded-xl bg-creme/60 p-4 text-sm space-y-2">
        <div class="flex items-center justify-between gap-2">
          <div class="flex gap-0.5" role="img" :aria-label="`Note : ${avis.note} sur 5`">
            <svg v-for="n in 5" :key="n" :class="['w-4 h-4', n <= avis.note ? 'fill-or' : 'fill-creme2']" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>
          </div>
          <span :class="['px-2.5 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap', ETATS[avis.statut].classes]">{{ ETATS[avis.statut].libelle }}</span>
        </div>
        <blockquote class="text-noir leading-relaxed">«&nbsp;{{ avis.texte }}&nbsp;»</blockquote>
        <figcaption class="text-xs text-gris">{{ avis.prenom }}<template v-if="avis.quartier"> · {{ avis.quartier }}</template></figcaption>
      </figure>
      <p v-if="avis.statut === 'Refusé' && avis.motif" class="text-xs p-3 rounded-xl bg-creme text-noir">
        <strong>Pourquoi il n'est pas publié :</strong> {{ avis.motif }} Vous pouvez le modifier et l'envoyer de nouveau.
      </p>
      <div class="flex flex-wrap gap-3">
        <button @click="ouvrir" class="cursor-pointer inline-flex items-center gap-1 text-xs font-semibold text-foret"><Edit3 class="w-3.5 h-3.5" /> Modifier mon avis</button>
        <button @click="supprimer" class="cursor-pointer inline-flex items-center gap-1 text-xs font-semibold text-red-700"><Trash2 class="w-3.5 h-3.5" /> Supprimer mon avis</button>
      </div>
    </template>
  </section>
</template>
