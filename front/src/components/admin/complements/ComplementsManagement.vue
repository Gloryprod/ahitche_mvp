<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { useToast } from 'vue-toastification'
import Swal from 'sweetalert2'
import { Plus, Pencil, EyeOff, Eye, Trash2, X, ImagePlus, Loader2, ExternalLink } from 'lucide-vue-next'
import api from '@/stores/api'
import { messageErreur } from '@/services/erreurs'
import { useAuthStore } from '@/stores/auth'
import { peutEcrire } from '@/config/roles'
import { reduireImage, photoOptimisee } from '@/services/images'
import CarteComplement from '@/components/complements/CarteComplement.vue'

// Compléments de la semaine : les produits « extra » du catalogue affichés sur l'accueil (« Disponible cette semaine »).
// Le prix saisi ici est celui du catalogue : c'est aussi celui que le serveur applique aux extras des commandes.

interface Complement {
  _id: string
  reference: string | null
  name: string
  unit: string
  priceUnit: number | null
  statut: 'disponible' | 'indisponible'
  description: string
  photo: string
  cetteSemaine: boolean
}

const auth = useAuthStore()
const toast = useToast()
const queryClient = useQueryClient()
const modifiable = computed(() => peutEcrire(auth.role.value, 'complements'))
const estAdmin = computed(() => auth.role.value === 'admin') // Suppression du catalogue : admin seulement

const { data, isLoading, isError } = useQuery({
  queryKey: ['complements'],
  queryFn: async () => (await api.get('/api/admin/complements')).data.complements as Complement[],
})
const recharger = () => queryClient.invalidateQueries({ queryKey: ['complements'] })

// Affiché sur le site = coché « cette semaine », disponible et avec un prix (même règle que le serveur)
const visibleSurLeSite = (c: Complement) => c.cetteSemaine && c.statut === 'disponible' && (c.priceUnit ?? 0) > 0
const deLaSemaine = computed(() => (data.value ?? []).filter(c => c.cetteSemaine))
const autres = computed(() => (data.value ?? []).filter(c => !c.cetteSemaine))

function raisonMasque(c: Complement): string {
  if (c.statut !== 'disponible') return 'Indisponible : non affiché sur le site'
  if (!((c.priceUnit ?? 0) > 0)) return 'Sans prix : non affiché sur le site'
  return ''
}

// --- Formulaire (ajout et modification) ---
const UNITES = ['unité', 'kg', '500 g', 'lot', 'pack', 'litre', 'botte', 'douzaine']
const formulaireVide = () => ({ _id: '', name: '', priceUnit: '' as string | number, unit: 'unité', description: '', photo: '', cetteSemaine: true, disponible: true })
const form = ref(formulaireVide())
const ouvert = ref(false)
const enregistrement = ref(false)
const televersement = ref(false)
const champNom = ref<HTMLInputElement | null>(null)

async function ouvrir(c?: Complement) {
  form.value = c
    ? { _id: c._id, name: c.name, priceUnit: c.priceUnit ?? '', unit: c.unit, description: c.description || '', photo: c.photo || '', cetteSemaine: c.cetteSemaine, disponible: c.statut === 'disponible' }
    : formulaireVide()
  ouvert.value = true
  await nextTick()
  champNom.value?.focus()
}
const fermer = () => { if (!enregistrement.value && !televersement.value) ouvert.value = false }

async function choisirPhoto(event: Event) {
  const input = event.target as HTMLInputElement
  const fichier = input.files?.[0]
  input.value = '' // Permet de reprendre le même fichier après une erreur
  if (!fichier) return
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(fichier.type)) {
    toast.error('Photo au format JPEG, PNG ou WebP.')
    return
  }
  televersement.value = true
  try {
    const image = await reduireImage(fichier)
    const donnees = new FormData()
    donnees.append('photo', image, image.type === 'image/webp' ? 'photo.webp' : fichier.name)
    form.value.photo = (await api.post('/api/admin/complements/photo', donnees)).data.url
  } catch (err) {
    toast.error(messageErreur(err, "La photo n'a pas pu être envoyée. Réessayez."))
  } finally {
    televersement.value = false
  }
}

async function enregistrer() {
  enregistrement.value = true
  try {
    const { _id, ...fiche } = form.value
    if (_id) await api.put(`/api/admin/complements/${_id}`, fiche)
    else await api.post('/api/admin/complements', fiche)
    toast.success(_id ? 'Produit modifié.' : 'Produit ajouté.')
    ouvert.value = false
    recharger()
  } catch (err) {
    toast.error(messageErreur(err, "L'enregistrement a échoué."))
  } finally {
    enregistrement.value = false
  }
}

// --- Actions sur une carte ---
async function basculerSemaine(c: Complement) {
  try {
    await api.patch(`/api/admin/complements/${c._id}`, { cetteSemaine: !c.cetteSemaine })
    toast.success(c.cetteSemaine ? `${c.name} retiré de la semaine (il reste au catalogue).` : `${c.name} affiché cette semaine.`)
    recharger()
  } catch (err) {
    toast.error(messageErreur(err, 'Action impossible.'))
  }
}

async function supprimerDuCatalogue(c: Complement) {
  const choix = await Swal.fire({
    title: `Supprimer « ${c.name} » du catalogue ?`,
    text: 'Le produit disparaît du site et des commandes. Pour seulement le cacher cette semaine, utilisez « Retirer de la semaine ».',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Supprimer du catalogue',
    cancelButtonText: 'Annuler',
    confirmButtonColor: '#B91C1C',
    cancelButtonColor: '#1A5C38',
    customClass: { popup: 'rounded-2xl font-body' },
  })
  if (!choix.isConfirmed) return
  try {
    await api.delete(`/api/admin/products/${c._id}`)
    toast.success(`${c.name} supprimé du catalogue.`)
    recharger()
  } catch (err) {
    toast.error(messageErreur(err, 'Suppression impossible.'))
  }
}

const champ = 'mt-1 w-full min-h-11 px-3 py-2 rounded-xl border border-creme2 bg-creme text-sm text-noir font-normal'
const boutonCarte = 'cursor-pointer inline-flex items-center justify-center gap-1.5 min-h-10 px-3 rounded-xl text-xs font-bold transition-colors'
</script>

<template>
  <div class="space-y-6 text-sm text-gris">
    <!-- En-tête -->
    <div class="bg-white p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="font-display font-bold text-xl text-noir">Compléments de la semaine</h1>
        <p class="text-xs mt-1">Les produits de la section « Disponible cette semaine » de l'accueil. Le prix est celui du catalogue, appliqué aussi aux commandes.</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <a href="/#variables" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 min-h-11 px-4 rounded-xl border border-creme2 text-foret font-bold text-xs">
          <ExternalLink class="w-4 h-4" aria-hidden="true" /> Voir sur le site
        </a>
        <button v-if="modifiable" type="button" @click="ouvrir()" class="cursor-pointer inline-flex items-center gap-1.5 min-h-11 px-4 rounded-xl bg-foret text-white font-bold text-xs hover:bg-savane">
          <Plus class="w-4 h-4" aria-hidden="true" /> Ajouter un produit
        </button>
      </div>
    </div>

    <p v-if="isLoading" class="bg-white rounded-2xl p-6 text-center">Chargement des compléments…</p>
    <p v-else-if="isError" class="bg-red-50 text-red-700 rounded-2xl p-6 text-center">Les compléments n'ont pas pu être chargés.</p>

    <template v-else>
      <!-- Affichés cette semaine -->
      <section class="space-y-3" aria-labelledby="titre-semaine">
        <h2 id="titre-semaine" class="font-bold text-noir">Affichés cette semaine ({{ deLaSemaine.length }})</h2>
        <p v-if="!deLaSemaine.length" class="bg-white rounded-2xl p-5">
          Aucun produit affiché : le site invite les clients à demander les compléments sur WhatsApp.
          <template v-if="modifiable"> Ajoutez un produit ou choisissez-en un plus bas.</template>
        </p>
        <ul v-else class="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <li v-for="c in deLaSemaine" :key="c._id">
            <CarteComplement :nom="c.name" :prix="c.priceUnit" :unite="c.unit" :description="c.description" :photo="c.photo">
              <p v-if="!visibleSurLeSite(c)" class="text-xs font-bold text-red-700 bg-red-50 rounded-lg px-2 py-1">{{ raisonMasque(c) }}</p>
              <p v-if="!c.photo" class="text-xs text-gris">Pas encore de photo</p>
              <div v-if="modifiable" class="flex flex-wrap gap-2 pt-2 border-t border-creme2">
                <button type="button" @click="ouvrir(c)" :class="[boutonCarte, 'bg-creme text-foret hover:bg-creme2']" :aria-label="`Modifier ${c.name}`">
                  <Pencil class="w-3.5 h-3.5" aria-hidden="true" /> Modifier
                </button>
                <button type="button" @click="basculerSemaine(c)" :class="[boutonCarte, 'bg-creme text-gris hover:bg-creme2']" :aria-label="`Retirer ${c.name} de la semaine`">
                  <EyeOff class="w-3.5 h-3.5" aria-hidden="true" /> Retirer de la semaine
                </button>
                <button v-if="estAdmin" type="button" @click="supprimerDuCatalogue(c)" :class="[boutonCarte, 'text-red-700 hover:bg-red-50 ml-auto']" :aria-label="`Supprimer ${c.name} du catalogue`" title="Supprimer du catalogue">
                  <Trash2 class="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </CarteComplement>
          </li>
        </ul>
      </section>

      <!-- Le reste des compléments du catalogue, à remettre en un clic -->
      <section v-if="autres.length" class="space-y-3" aria-labelledby="titre-autres">
        <h2 id="titre-autres" class="font-bold text-noir">Autres compléments du catalogue ({{ autres.length }})</h2>
        <ul class="bg-white rounded-2xl divide-y divide-creme2">
          <li v-for="c in autres" :key="c._id" class="flex flex-wrap items-center gap-3 p-3">
            <img v-if="c.photo" :src="photoOptimisee(c.photo, 48, 48)" alt="" width="48" height="48" loading="lazy" class="w-12 h-12 rounded-xl object-cover" />
            <span v-else class="w-12 h-12 rounded-xl bg-foret/10 text-foret font-display font-bold flex items-center justify-center" aria-hidden="true">{{ c.name.charAt(0).toUpperCase() }}</span>
            <div class="flex-1 min-w-[8rem]">
              <p class="font-bold text-noir">{{ c.name }}</p>
              <p class="text-xs">{{ c.priceUnit ? `${c.priceUnit.toLocaleString('fr-FR')} FCFA / ${c.unit}` : 'Prix à renseigner' }}<template v-if="c.statut !== 'disponible'"> · indisponible</template></p>
            </div>
            <div v-if="modifiable" class="flex flex-wrap gap-2">
              <button type="button" @click="basculerSemaine(c)" :class="[boutonCarte, 'bg-foret/10 text-foret hover:bg-foret/20']" :aria-label="`Afficher ${c.name} cette semaine`">
                <Eye class="w-3.5 h-3.5" aria-hidden="true" /> Afficher cette semaine
              </button>
              <button type="button" @click="ouvrir(c)" :class="[boutonCarte, 'bg-creme text-foret hover:bg-creme2']" :aria-label="`Modifier ${c.name}`">
                <Pencil class="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button v-if="estAdmin" type="button" @click="supprimerDuCatalogue(c)" :class="[boutonCarte, 'text-red-700 hover:bg-red-50']" :aria-label="`Supprimer ${c.name} du catalogue`" title="Supprimer du catalogue">
                <Trash2 class="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </li>
        </ul>
      </section>
    </template>

    <!-- Fenêtre : ajout ou modification d'un produit -->
    <div v-if="ouvert" class="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" @click.self="fermer" @keydown.esc="fermer">
      <form @submit.prevent="enregistrer" role="dialog" aria-modal="true" aria-labelledby="titre-complement" class="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-2xl p-5 space-y-4">
        <div class="flex items-start justify-between gap-2">
          <h3 id="titre-complement" class="font-display font-bold text-lg text-noir">{{ form._id ? 'Modifier le produit' : 'Ajouter un produit' }}</h3>
          <button type="button" @click="fermer" class="cursor-pointer p-2 rounded-lg bg-creme" aria-label="Fermer"><X class="w-4 h-4" /></button>
        </div>

        <!-- Photo -->
        <div>
          <span class="text-xs font-bold text-noir">Photo du produit</span>
          <div class="mt-1 flex items-center gap-3">
            <div class="w-28 aspect-[4/3] rounded-xl bg-creme2 overflow-hidden flex items-center justify-center shrink-0">
              <img v-if="form.photo" :src="photoOptimisee(form.photo, 112, 84)" alt="Aperçu de la photo" class="w-full h-full object-cover" />
              <ImagePlus v-else class="w-6 h-6 text-gris" aria-hidden="true" />
            </div>
            <div class="flex flex-col gap-2">
              <label class="cursor-pointer inline-flex items-center gap-1.5 min-h-11 px-3 rounded-xl border border-creme2 text-foret font-bold text-xs" :class="{ 'opacity-60 pointer-events-none': televersement }">
                <Loader2 v-if="televersement" class="w-4 h-4 animate-spin" aria-hidden="true" />
                <ImagePlus v-else class="w-4 h-4" aria-hidden="true" />
                {{ televersement ? 'Envoi…' : form.photo ? 'Changer la photo' : 'Choisir une photo' }}
                <input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" @change="choisirPhoto" />
              </label>
              <button v-if="form.photo && !televersement" type="button" @click="form.photo = ''" class="cursor-pointer text-xs text-red-700 text-left">Retirer la photo</button>
            </div>
          </div>
          <p class="text-xs mt-1">Une vraie photo du produit, prise par l'équipe ou fournie par le fournisseur avec son accord. Elle est réduite avant l'envoi.</p>
        </div>

        <label class="block text-xs font-bold text-noir">Nom du produit *
          <input ref="champNom" v-model="form.name" required maxlength="80" :class="champ" placeholder="Ex. Poisson fumé" />
        </label>

        <div class="grid grid-cols-2 gap-3">
          <label class="block text-xs font-bold text-noir">Prix de vente (FCFA) *
            <input v-model="form.priceUnit" required type="number" min="1" step="1" inputmode="numeric" :class="champ" placeholder="2500" />
          </label>
          <label class="block text-xs font-bold text-noir">Unité *
            <input v-model="form.unit" required maxlength="30" list="unites-complement" :class="champ" />
            <datalist id="unites-complement"><option v-for="u in UNITES" :key="u" :value="u" /></datalist>
          </label>
        </div>

        <label class="block text-xs font-bold text-noir">Description
          <textarea v-model="form.description" maxlength="200" rows="3" :class="champ" placeholder="Ex. Poisson fumé au feu de bois, prêt à cuisiner."></textarea>
          <span class="block text-right font-normal text-gris">{{ form.description.length }} / 200</span>
        </label>

        <div class="space-y-2">
          <label class="flex items-center gap-2 text-noir cursor-pointer min-h-11">
            <input v-model="form.cetteSemaine" type="checkbox" class="w-5 h-5 accent-foret" /> Afficher cette semaine sur le site
          </label>
          <label class="flex items-center gap-2 text-noir cursor-pointer min-h-11">
            <input v-model="form.disponible" type="checkbox" class="w-5 h-5 accent-foret" /> Disponible à la commande
          </label>
        </div>

        <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <button type="button" @click="fermer" class="cursor-pointer min-h-11 px-4 rounded-xl border border-creme2 font-bold">Annuler</button>
          <button type="submit" :disabled="enregistrement || televersement" class="cursor-pointer min-h-11 px-5 rounded-xl bg-foret text-white font-bold hover:bg-savane disabled:opacity-60">
            {{ enregistrement ? 'Enregistrement…' : form._id ? 'Enregistrer' : 'Ajouter le produit' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
