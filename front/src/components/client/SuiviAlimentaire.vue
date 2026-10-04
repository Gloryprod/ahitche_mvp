<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { Salad, Trash2, Edit3 } from 'lucide-vue-next'
import Swal from 'sweetalert2'
import { useToast } from 'vue-toastification'
import api from '@/stores/api'

// Suivi alimentaire du client : questionnaire (données non sensibles), recommandations, menus types.
// Aucune donnée de santé n'est demandée en v1 (autorisation APDP préalable, voir docs/conception-menu-admin.md).

interface Profil {
  foyer: Record<string, number>
  objectifs: string[]
  platsAimes: string
  alimentsNonAimes: string
  prochainPoint: string | null
}
interface Menu { _id: string; titre: string; conseil: string; jours: { jour: string; dejeuner: string; diner: string }[] }

const LIBELLES_TRANCHES: Record<string, string> = { '0-5': '0 à 5 ans', '6-12': '6 à 12 ans', '13-17': '13 à 17 ans', '18-59': '18 à 59 ans', '60+': '60 ans et plus' }

const toast = useToast()
const chargement = ref(true)
const profil = ref<Profil | null>(null)
const recommandations = ref<{ type: string; contenu: string; date: string }[]>([])
const menus = ref<Menu[]>([])
const objectifsPossibles = ref<string[]>([])
const tranches = ref<string[]>([])
const enEdition = ref(false)
const envoi = ref(false)
const menuOuvert = ref<string | null>(null)

const form = reactive({ foyer: {} as Record<string, number>, objectifs: [] as string[], platsAimes: '', alimentsNonAimes: '', consentement: false })

async function charger() {
  chargement.value = true
  try {
    const { data } = await api.get('/api/auth/nutrition')
    profil.value = data.profil
    recommandations.value = data.recommandations
    menus.value = data.menus
    objectifsPossibles.value = data.objectifsPossibles
    tranches.value = data.tranches
  } catch {
    // Section secondaire : en cas d'erreur, le reste de l'espace client reste utilisable
  } finally {
    chargement.value = false
  }
}
onMounted(charger)

function ouvrirQuestionnaire() {
  form.foyer = Object.fromEntries(tranches.value.map(t => [t, profil.value?.foyer?.[t] ?? 0]))
  form.objectifs = [...(profil.value?.objectifs ?? [])]
  form.platsAimes = profil.value?.platsAimes ?? ''
  form.alimentsNonAimes = profil.value?.alimentsNonAimes ?? ''
  form.consentement = false
  enEdition.value = true
}

async function enregistrer() {
  envoi.value = true
  try {
    const { data } = await api.put('/api/auth/nutrition', form)
    toast.success(data.message)
    enEdition.value = false
    await charger()
  } catch (err: any) {
    toast.error(err.response?.data?.message || "Impossible d'enregistrer le questionnaire.")
  } finally {
    envoi.value = false
  }
}

async function supprimer() {
  const choix = await Swal.fire({
    title: 'Supprimer vos réponses ?',
    text: 'Votre questionnaire et l\'historique de votre suivi alimentaire seront effacés.',
    icon: 'warning', showCancelButton: true, confirmButtonColor: '#1A5C38',
    confirmButtonText: 'Oui, supprimer', cancelButtonText: 'Annuler', customClass: { popup: 'rounded-2xl font-body' }
  })
  if (!choix.isConfirmed) return
  try {
    const { data } = await api.delete('/api/auth/nutrition')
    toast.success(data.message)
    await charger()
  } catch {
    toast.error('Suppression impossible pour le moment.')
  }
}

const personnes = computed(() => Object.values(profil.value?.foyer ?? {}).reduce((s, n) => s + n, 0))
const dateFr = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
</script>

<template>
  <section class="bg-white rounded-2xl p-6 border border-creme2 shadow-sm space-y-5" aria-labelledby="titre-suivi">
    <div class="flex items-center gap-3">
      <div class="p-2 bg-gray-50 rounded-xl border border-gray-100"><Salad class="w-5 h-5 text-foret" /></div>
      <div>
        <h2 id="titre-suivi" class="font-display font-bold text-xl">Mon suivi alimentaire</h2>
        <p class="text-xs text-gris">Gratuit, avec notre nutritionniste</p>
      </div>
    </div>

    <p v-if="chargement" class="text-sm text-gris">Chargement...</p>

    <!-- Questionnaire -->
    <form v-else-if="enEdition" @submit.prevent="enregistrer" class="space-y-4 text-sm">
      <fieldset>
        <legend class="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Votre foyer (nombre de personnes)</legend>
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <label v-for="t in tranches" :key="t" class="text-xs text-gris">{{ LIBELLES_TRANCHES[t] }}
            <input v-model.number="form.foyer[t]" type="number" min="0" max="20" class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm text-noir" />
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend class="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Ce que vous souhaitez</legend>
        <div class="flex flex-wrap gap-2">
          <label v-for="o in objectifsPossibles" :key="o" :class="['cursor-pointer px-3 py-2 rounded-full border text-xs font-semibold', form.objectifs.includes(o) ? 'bg-foret text-white border-foret' : 'border-gray-200 text-gris']">
            <input v-model="form.objectifs" :value="o" type="checkbox" class="sr-only" />{{ o }}
          </label>
        </div>
      </fieldset>
      <label class="block text-xs font-bold uppercase tracking-wider text-gray-500">Plats que vous aimez
        <textarea v-model="form.platsAimes" rows="2" maxlength="500" placeholder="Ex : sauce arachide, amiwo, pâte de maïs…" class="mt-1 w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-normal normal-case text-noir resize-none"></textarea>
      </label>
      <label class="block text-xs font-bold uppercase tracking-wider text-gray-500">Aliments que vous n'aimez pas
        <textarea v-model="form.alimentsNonAimes" rows="2" maxlength="500" placeholder="Ex : gombo, poisson fumé…" class="mt-1 w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-normal normal-case text-noir resize-none"></textarea>
      </label>
      <p class="text-xs text-gris bg-creme rounded-xl p-3">
        N'indiquez ici aucune information de santé (maladie, allergie, traitement) : pour ces sujets, parlez-en directement avec notre nutritionniste.
      </p>
      <label class="flex items-start gap-2 text-xs cursor-pointer">
        <input v-model="form.consentement" type="checkbox" required class="accent-foret w-4 h-4 mt-0.5 shrink-0" />
        <span>J'accepte qu'Ahitché utilise ces réponses pour me proposer des menus et des conseils adaptés. Je peux les modifier ou les supprimer à tout moment depuis mon espace.</span>
      </label>
      <div class="flex gap-3">
        <button type="submit" :disabled="envoi || !form.consentement" class="cursor-pointer flex-1 bg-foret text-white text-sm font-bold px-4 py-3 rounded-xl disabled:opacity-50">{{ envoi ? 'Enregistrement...' : 'Enregistrer' }}</button>
        <button type="button" @click="enEdition = false" class="cursor-pointer px-4 py-3 border border-gray-200 rounded-xl text-sm font-semibold">Annuler</button>
      </div>
    </form>

    <!-- Pas encore de profil -->
    <div v-else-if="!profil" class="rounded-xl border border-dashed border-gray-200 p-5 text-center space-y-3">
      <p class="text-sm text-gris">Répondez à quelques questions sur votre foyer : notre nutritionniste vous propose des menus et des conseils adaptés à votre formule.</p>
      <button @click="ouvrirQuestionnaire" class="cursor-pointer px-5 py-3 rounded-xl bg-foret text-white text-sm font-bold">Remplir le questionnaire</button>
    </div>

    <!-- Profil, recommandations, menus -->
    <template v-else>
      <div class="rounded-xl bg-creme/60 p-4 text-sm space-y-1">
        <p><strong>{{ personnes }} personne(s)</strong> dans le foyer<span v-if="profil.objectifs.length"> · {{ profil.objectifs.join(', ') }}</span></p>
        <p v-if="profil.prochainPoint" class="text-xs text-gris">Prochain point avec la nutritionniste : vers le {{ dateFr(profil.prochainPoint) }}</p>
        <div class="flex flex-wrap gap-3 pt-2">
          <button @click="ouvrirQuestionnaire" class="cursor-pointer inline-flex items-center gap-1 text-xs font-semibold text-foret"><Edit3 class="w-3.5 h-3.5" /> Modifier mes réponses</button>
          <button @click="supprimer" class="cursor-pointer inline-flex items-center gap-1 text-xs font-semibold text-red-700"><Trash2 class="w-3.5 h-3.5" /> Supprimer mes réponses</button>
        </div>
      </div>

      <div v-if="recommandations.length" class="space-y-2">
        <h3 class="font-bold text-sm">Conseils de votre nutritionniste</h3>
        <article v-for="(r, i) in recommandations" :key="i" class="rounded-xl border border-creme2 p-3 text-sm">
          <p class="text-[11px] text-gris mb-1">{{ r.type }} · {{ dateFr(r.date) }}</p>
          <p class="whitespace-pre-line">{{ r.contenu }}</p>
        </article>
      </div>

      <div v-if="menus.length" class="space-y-2">
        <h3 class="font-bold text-sm">Idées de menus pour votre formule</h3>
        <article v-for="m in menus" :key="m._id" class="rounded-xl border border-creme2">
          <button @click="menuOuvert = menuOuvert === m._id ? null : m._id" :aria-expanded="menuOuvert === m._id" class="cursor-pointer w-full text-left px-4 py-3 font-semibold text-sm flex justify-between">
            {{ m.titre }} <span aria-hidden="true">{{ menuOuvert === m._id ? '−' : '+' }}</span>
          </button>
          <div v-if="menuOuvert === m._id" class="px-4 pb-4 text-xs space-y-1.5">
            <p v-for="j in m.jours.filter(j => j.dejeuner || j.diner)" :key="j.jour"><strong>{{ j.jour }}</strong> : {{ j.dejeuner || '-' }} / {{ j.diner || '-' }}</p>
            <p v-if="m.conseil" class="text-gris italic pt-1">{{ m.conseil }}</p>
          </div>
        </article>
      </div>
    </template>
  </section>
</template>
