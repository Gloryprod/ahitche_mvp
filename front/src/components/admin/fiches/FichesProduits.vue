<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { useToast } from 'vue-toastification'
import Swal from 'sweetalert2'
import { Plus, Pencil, EyeOff, Eye, Trash2, X, ImagePlus, Loader2 } from 'lucide-vue-next'
import api from '@/stores/api'
import { messageErreur } from '@/services/erreurs'
import { useAuthStore } from '@/stores/auth'
import { peutEcrire } from '@/config/roles'
import { reduireImage, photoOptimisee } from '@/services/images'
import CarteFiche from '@/components/fiches/CarteFiche.vue'

// Fiches produits : la publicité du bandeau « À découvrir » de l'espace client. Une fiche = un produit vendu du
// catalogue (base fixe ou extra) dans un format (« Boîte de 70 g »), avec un prix affiché saisi ici, une mention et
// une photo facultatives. Affichage seulement : aucun lien avec les commandes, le stock, les finances ni les prix VIP.
// Une fiche publiée dont le produit est « indisponible » ou supprimé n'est pas montrée au client (règle du serveur).
// Écriture : admin et gestionnaires ; lecture : coordinateur (section « fiches », le serveur fait foi).

interface Photo { url: string; publicId: string }
interface Fiche {
  _id: string
  productId: string
  produit: { reference: string | null; nom: string; unite: string; famille: string; indisponible: boolean; supprime: boolean }
  format: string
  prix: number
  mention: string
  photo: Photo
  publiee: boolean
  ordre: number | null
}
interface ProduitVendu { _id: string; reference: string | null; nom: string; unite: string; famille: 'P' | 'V'; indisponible: boolean }

// Limites du serveur (controllers/FicheController.js)
const FORMAT_MAX = 60
const MENTION_MAX = 120
const ORDRE_MAX = 9999

const auth = useAuthStore()
const toast = useToast()
const queryClient = useQueryClient()
const modifiable = computed(() => peutEcrire(auth.role.value, 'fiches'))

const { data, isLoading, isError } = useQuery({
  queryKey: ['fiches'],
  queryFn: async () => (await api.get('/api/admin/fiches')).data.fiches as Fiche[],
})
// Produits proposés dans le formulaire (vendus, sans aucun prix) : chargés seulement pour ceux qui écrivent
const { data: produits } = useQuery({
  queryKey: ['fiches-produits'],
  queryFn: async () => (await api.get('/api/admin/fiches/produits')).data.produits as ProduitVendu[],
  enabled: modifiable,
})
const recharger = () => queryClient.invalidateQueries({ queryKey: ['fiches'] })

const publiees = computed(() => (data.value ?? []).filter(f => f.publiee))
const nonPubliees = computed(() => (data.value ?? []).filter(f => !f.publiee))
const produitsBase = computed(() => (produits.value ?? []).filter(p => p.famille === 'P'))
const produitsVariables = computed(() => (produits.value ?? []).filter(p => p.famille === 'V'))
const libelleProduit = (p: { reference: string | null; nom: string }) => [p.reference, p.nom].filter(Boolean).join(' · ')
const fcfa = (n: number) => `${n.toLocaleString('fr-FR')} F`

// --- Formulaire (ajout et modification) ---
const formulaireVide = () => ({
  _id: '', productId: '', format: '', prix: '' as number | string, mention: '',
  photo: null as Photo | null, publiee: true, ordre: '' as number | string,
})
const form = ref(formulaireVide())
const nomProduitActuel = ref('') // Fiche dont le produit n'est plus proposé (supprimé du catalogue)
const ouvert = ref(false)
const enregistrement = ref(false)
const televersement = ref(false)
const erreurFormulaire = ref('')
const champProduit = ref<HTMLSelectElement | null>(null)
let declencheur: HTMLElement | null = null // Bouton qui a ouvert la fenêtre : il reprend le focus à la fermeture

const produitChoisi = computed(() => (produits.value ?? []).find(p => p._id === form.value.productId))
const produitHorsListe = computed(() => !!form.value.productId && !!produits.value && !produitChoisi.value)

async function ouvrir(f?: Fiche) {
  declencheur = document.activeElement instanceof HTMLElement ? document.activeElement : null
  form.value = f
    ? {
        _id: f._id, productId: String(f.productId), format: f.format, prix: f.prix, mention: f.mention || '',
        photo: f.photo?.url ? { url: f.photo.url, publicId: f.photo.publicId } : null, publiee: f.publiee, ordre: f.ordre ?? '',
      }
    : formulaireVide()
  nomProduitActuel.value = f?.produit.nom ?? ''
  erreurFormulaire.value = ''
  ouvert.value = true
  await nextTick()
  champProduit.value?.focus()
}
function fermer() {
  if (enregistrement.value || televersement.value) return
  ouvert.value = false
  declencheur?.focus()
}

async function choisirPhoto(event: Event) {
  const input = event.target as HTMLInputElement
  const fichier = input.files?.[0]
  input.value = '' // Permet de reprendre le même fichier après une erreur
  if (!fichier) return
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(fichier.type)) {
    erreurFormulaire.value = 'Photo au format JPEG, PNG ou WebP.'
    return
  }
  erreurFormulaire.value = ''
  televersement.value = true
  try {
    // Photo de téléphone (3 à 5 Mo) réduite dans le navigateur avant l'envoi : connexions lentes
    const image = await reduireImage(fichier)
    const nom = image.type === 'image/webp' ? 'photo.webp' : image.type === 'image/jpeg' ? 'photo.jpg' : fichier.name
    const donnees = new FormData()
    donnees.append('photo', image, nom)
    const { url, publicId } = (await api.post('/api/admin/fiches/photo', donnees)).data
    form.value.photo = { url, publicId }
  } catch (err) {
    erreurFormulaire.value = messageErreur(err, "La photo n'a pas pu être envoyée. Réessayez.")
  } finally {
    televersement.value = false
  }
}

async function enregistrer() {
  erreurFormulaire.value = ''
  enregistrement.value = true
  const { _id, prix, ordre, ...reste } = form.value
  // Fiche complète : en modification, PUT remplace tout (sans photo = photo retirée)
  const fiche = { ...reste, prix: Number(prix), ordre: ordre === '' || ordre === null ? null : Number(ordre) }
  try {
    if (_id) await api.put(`/api/admin/fiches/${_id}`, fiche)
    else await api.post('/api/admin/fiches', fiche)
    toast.success(_id ? 'Fiche modifiée.' : 'Fiche ajoutée.')
    ouvert.value = false
    declencheur?.focus()
    recharger()
  } catch (err) {
    erreurFormulaire.value = messageErreur(err, "L'enregistrement a échoué.")
  } finally {
    enregistrement.value = false
  }
}

// --- Actions sur une fiche ---
const nomFiche = (f: Fiche) => `${f.produit.nom} (${f.format})`

async function basculerPublication(f: Fiche) {
  try {
    await api.patch(`/api/admin/fiches/${f._id}`, { publiee: !f.publiee })
    toast.success(f.publiee ? `${nomFiche(f)} : retirée de l'espace client (elle reste ici).` : `${nomFiche(f)} : affichée dans l'espace client.`)
    recharger()
  } catch (err) {
    toast.error(messageErreur(err, 'Action impossible.'))
  }
}

async function supprimer(f: Fiche) {
  const choix = await Swal.fire({
    title: `Supprimer la fiche ${nomFiche(f)} ?`,
    text: "Elle disparaît de l'espace client et de cette liste. Pour seulement la cacher, utilisez « Retirer de l'espace client ».",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Supprimer la fiche',
    cancelButtonText: 'Annuler',
    confirmButtonColor: 'var(--color-foret)',
    cancelButtonColor: 'var(--color-gris)',
    customClass: { popup: 'rounded-2xl font-body' },
  })
  if (!choix.isConfirmed) return
  try {
    await api.delete(`/api/admin/fiches/${f._id}`)
    toast.success(`Fiche ${nomFiche(f)} supprimée.`)
    recharger()
  } catch (err) {
    toast.error(messageErreur(err, 'Suppression impossible.'))
  }
}

const champ = 'mt-1 w-full min-h-11 px-3 py-2 rounded-xl border border-creme2 bg-creme text-sm text-noir font-normal'
const boutonCarte = 'cursor-pointer inline-flex items-center justify-center gap-1.5 min-h-10 min-w-10 px-2.5 rounded-xl text-xs font-bold transition-colors'
</script>

<template>
  <div class="space-y-6 text-sm text-gris">
    <!-- En-tête -->
    <div class="bg-white p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="font-display font-bold text-xl text-noir">Fiches produits</h1>
        <p class="text-xs mt-1">Le bandeau « À découvrir » de l'espace client. Le prix affiché se saisit ici : il ne change ni les commandes, ni le stock, ni les prix VIP.</p>
      </div>
      <button v-if="modifiable" type="button" @click="ouvrir()" class="cursor-pointer shrink-0 inline-flex items-center justify-center gap-1.5 min-h-11 px-4 rounded-xl bg-foret text-white font-bold text-xs hover:bg-savane">
        <Plus class="w-4 h-4" aria-hidden="true" /> Ajouter une fiche
      </button>
    </div>

    <p v-if="isLoading" class="bg-white rounded-2xl p-6 text-center">Chargement des fiches…</p>
    <p v-else-if="isError" class="bg-red-50 text-red-700 rounded-2xl p-6 text-center">Les fiches n'ont pas pu être chargées.</p>

    <template v-else>
      <!-- Publiées : montrées dans l'espace client, sauf si leur produit est indisponible ou supprimé -->
      <section class="space-y-3" aria-labelledby="titre-publiees">
        <div>
          <h2 id="titre-publiees" class="font-bold text-noir">Publiées ({{ publiees.length }})</h2>
          <p class="text-xs">Montrées dans le bandeau de l'espace client, sauf quand leur produit est indisponible.</p>
        </div>
        <p v-if="!publiees.length" class="bg-white rounded-2xl p-5">
          Aucune fiche publiée : le bandeau n'apparaît pas dans l'espace client.
          <template v-if="modifiable"> Ajoutez une fiche pour le faire apparaître.</template>
        </p>
        <ul v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 items-start">
          <li v-for="f in publiees" :key="f._id">
            <CarteFiche :nom="f.produit.nom" :format="f.format" :prix="f.prix" :mention="f.mention" :photo="f.photo.url">
              <p class="text-[11px] text-gris pt-1">{{ f.produit.reference || 'Sans référence' }}<template v-if="f.ordre !== null"> · ordre {{ f.ordre }}</template></p>
              <p v-if="f.produit.supprime" class="text-[11px] font-bold text-red-700 bg-red-50 rounded-lg px-2 py-1">Produit supprimé du catalogue : fiche non affichée</p>
              <p v-else-if="f.produit.indisponible" class="text-[11px] font-semibold text-noir bg-or/20 rounded-lg px-2 py-1">Produit indisponible : fiche cachée de l'espace client jusqu'à son retour</p>
              <p v-if="!f.photo.url" class="text-[11px] text-gris">Sans photo</p>
              <div v-if="modifiable" class="flex flex-wrap gap-1.5 pt-2 mt-1 border-t border-creme2">
                <button type="button" @click="ouvrir(f)" :class="[boutonCarte, 'bg-creme text-foret hover:bg-creme2']" :aria-label="`Modifier ${nomFiche(f)}`" title="Modifier">
                  <Pencil class="w-4 h-4" aria-hidden="true" />
                </button>
                <button type="button" @click="basculerPublication(f)" :class="[boutonCarte, 'bg-creme text-gris hover:bg-creme2']" :aria-label="`Retirer ${nomFiche(f)} de l'espace client`" title="Retirer de l'espace client">
                  <EyeOff class="w-4 h-4" aria-hidden="true" />
                </button>
                <button type="button" @click="supprimer(f)" :class="[boutonCarte, 'text-red-700 hover:bg-red-50 ml-auto']" :aria-label="`Supprimer ${nomFiche(f)}`" title="Supprimer">
                  <Trash2 class="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </CarteFiche>
          </li>
        </ul>
      </section>

      <!-- Retirées de l'espace client : à remettre en un clic -->
      <section v-if="nonPubliees.length" class="space-y-3" aria-labelledby="titre-retirees">
        <h2 id="titre-retirees" class="font-bold text-noir">Retirées de l'espace client ({{ nonPubliees.length }})</h2>
        <ul class="bg-white rounded-2xl divide-y divide-creme2">
          <li v-for="f in nonPubliees" :key="f._id" class="flex flex-wrap items-center gap-3 p-3">
            <img v-if="f.photo.url" :src="photoOptimisee(f.photo.url, 48, 48)" alt="" width="48" height="48" loading="lazy" class="w-12 h-12 rounded-xl object-cover" />
            <span v-else class="w-12 h-12 rounded-xl bg-foret/10 text-foret font-display font-bold flex items-center justify-center" aria-hidden="true">{{ f.produit.nom.charAt(0).toUpperCase() }}</span>
            <div class="flex-1 min-w-[8rem]">
              <p class="font-bold text-noir">{{ f.produit.nom }}</p>
              <p class="text-xs">{{ f.format }} · {{ fcfa(f.prix) }}<template v-if="f.produit.supprime"> · produit supprimé</template></p>
            </div>
            <div v-if="modifiable" class="flex flex-wrap gap-1.5">
              <button type="button" @click="basculerPublication(f)" :class="[boutonCarte, 'bg-foret/10 text-foret hover:bg-foret/20']" :aria-label="`Afficher ${nomFiche(f)} dans l'espace client`">
                <Eye class="w-4 h-4" aria-hidden="true" /> Afficher
              </button>
              <button type="button" @click="ouvrir(f)" :class="[boutonCarte, 'bg-creme text-foret hover:bg-creme2']" :aria-label="`Modifier ${nomFiche(f)}`" title="Modifier">
                <Pencil class="w-4 h-4" aria-hidden="true" />
              </button>
              <button type="button" @click="supprimer(f)" :class="[boutonCarte, 'text-red-700 hover:bg-red-50']" :aria-label="`Supprimer ${nomFiche(f)}`" title="Supprimer">
                <Trash2 class="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </li>
        </ul>
      </section>
    </template>

    <!-- Fenêtre : ajout ou modification d'une fiche -->
    <div v-if="ouvert" class="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" @click.self="fermer" @keydown.esc="fermer">
      <form @submit.prevent="enregistrer" role="dialog" aria-modal="true" aria-labelledby="titre-fiche" class="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl p-5 space-y-4">
        <div class="flex items-start justify-between gap-2">
          <h2 id="titre-fiche" class="font-display font-bold text-lg text-noir">{{ form._id ? 'Modifier la fiche' : 'Ajouter une fiche' }}</h2>
          <button type="button" @click="fermer" class="cursor-pointer p-2.5 rounded-lg bg-creme" aria-label="Fermer"><X class="w-4 h-4" aria-hidden="true" /></button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-[1fr_11rem] gap-5">
          <div class="space-y-4">
            <label class="block text-xs font-bold text-noir">Produit du catalogue *
              <select ref="champProduit" v-model="form.productId" required :class="champ">
                <option value="" disabled>Choisir un produit</option>
                <option v-if="produitHorsListe" :value="form.productId" disabled>{{ nomProduitActuel || 'Produit' }} (supprimé : choisissez-en un autre)</option>
                <optgroup v-if="produitsBase.length" label="Produits de base (P)">
                  <option v-for="p in produitsBase" :key="p._id" :value="p._id">{{ libelleProduit(p) }} ({{ p.unite }}){{ p.indisponible ? ' · indisponible' : '' }}</option>
                </optgroup>
                <optgroup v-if="produitsVariables.length" label="Produits variables (V)">
                  <option v-for="p in produitsVariables" :key="p._id" :value="p._id">{{ libelleProduit(p) }} ({{ p.unite }}){{ p.indisponible ? ' · indisponible' : '' }}</option>
                </optgroup>
              </select>
            </label>

            <label class="block text-xs font-bold text-noir">Format *
              <input v-model="form.format" required :maxlength="FORMAT_MAX" :class="champ" placeholder="Ex. Boîte de 70 g" />
              <span class="block text-right font-normal text-gris">{{ form.format.length }} / {{ FORMAT_MAX }}</span>
            </label>

            <div class="grid grid-cols-2 gap-3">
              <label class="block text-xs font-bold text-noir">Prix affiché (FCFA) *
                <input v-model="form.prix" required type="number" min="0" step="1" inputmode="numeric" :class="champ" placeholder="85" />
              </label>
              <label class="block text-xs font-bold text-noir">Ordre d'affichage
                <input v-model="form.ordre" type="number" step="1" :min="-ORDRE_MAX" :max="ORDRE_MAX" inputmode="numeric" :class="champ" placeholder="Facultatif" aria-describedby="aide-ordre" />
              </label>
            </div>
            <p id="aide-ordre" class="text-xs -mt-2">Les plus petits nombres passent en premier ; sans ordre, la fiche suit les autres.</p>

            <label class="block text-xs font-bold text-noir">Mention
              <input v-model="form.mention" :maxlength="MENTION_MAX" :class="champ" placeholder="Ex. Prix inclus dans tous les packs" />
              <span class="block text-right font-normal text-gris">{{ form.mention.length }} / {{ MENTION_MAX }}</span>
            </label>

            <!-- Photo (facultative) -->
            <div>
              <span class="text-xs font-bold text-noir">Photo (facultative)</span>
              <div class="mt-1 flex items-center gap-3">
                <div class="w-24 aspect-[4/3] rounded-xl bg-creme2 overflow-hidden flex items-center justify-center shrink-0">
                  <img v-if="form.photo" :src="photoOptimisee(form.photo.url, 96, 72)" alt="Aperçu de la photo" class="w-full h-full object-cover" />
                  <ImagePlus v-else class="w-6 h-6 text-gris" aria-hidden="true" />
                </div>
                <div class="flex flex-col gap-2">
                  <label class="cursor-pointer inline-flex items-center gap-1.5 min-h-11 px-3 rounded-xl border border-creme2 text-foret font-bold text-xs has-focus-visible:outline-2 has-focus-visible:outline-foret" :class="{ 'opacity-60 pointer-events-none': televersement }">
                    <Loader2 v-if="televersement" class="w-4 h-4 animate-spin" aria-hidden="true" />
                    <ImagePlus v-else class="w-4 h-4" aria-hidden="true" />
                    {{ televersement ? 'Envoi…' : form.photo ? 'Changer la photo' : 'Choisir une photo' }}
                    <input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" @change="choisirPhoto" />
                  </label>
                  <button v-if="form.photo && !televersement" type="button" @click="form.photo = null" class="cursor-pointer min-h-11 text-xs font-semibold text-red-700 text-left">Retirer la photo</button>
                </div>
              </div>
              <p class="text-xs mt-1">Une vraie photo du produit, prise par l'équipe ou fournie par le fournisseur avec son accord. Elle est réduite avant l'envoi.</p>
            </div>

            <label class="flex items-center gap-2 text-noir cursor-pointer min-h-11">
              <input v-model="form.publiee" type="checkbox" class="w-5 h-5 accent-foret" /> Afficher dans l'espace client
            </label>
          </div>

          <!-- Aperçu : la carte telle que le client la verra -->
          <div>
            <p class="text-xs font-bold text-noir mb-1">Aperçu</p>
            <div class="w-44 mx-auto sm:mx-0">
              <CarteFiche
                :nom="produitChoisi?.nom || nomProduitActuel || 'Nom du produit'"
                :format="form.format || 'Format'"
                :prix="Number(form.prix) || 0"
                :mention="form.mention"
                :photo="form.photo?.url"
              />
            </div>
          </div>
        </div>

        <p v-if="erreurFormulaire" role="alert" class="p-3 rounded-xl bg-red-50 text-red-800 text-xs font-semibold">{{ erreurFormulaire }}</p>

        <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <button type="button" @click="fermer" class="cursor-pointer min-h-11 px-4 rounded-xl border border-creme2 font-bold">Annuler</button>
          <button type="submit" :disabled="enregistrement || televersement" class="cursor-pointer min-h-11 px-5 rounded-xl bg-foret text-white font-bold hover:bg-savane disabled:opacity-60">
            {{ enregistrement ? 'Enregistrement…' : form._id ? 'Enregistrer' : 'Ajouter la fiche' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
