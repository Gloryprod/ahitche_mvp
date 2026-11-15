<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'
import { ImagePlus, Loader2, RotateCcw, Undo2 } from 'lucide-vue-next'
import api from '@/stores/api'
import { messageErreur } from '@/services/erreurs'
import { nomFichierPhoto, reduireImage } from '@/services/images'
import { EMPLACEMENTS_FRISE, REGLES_PHOTO, photoDuCode, urlPhotoValide, type EmplacementFrise, type PhotosSite } from '@/services/valeursSite'
import { PHOTOS, TITRES_FRISE, composerFrise, photoAffichee } from '@/config/photos'
import PhotoAFournir from '@/components/ui/PhotoAFournir.vue'
import FermeAVous from '@/components/sections/FermeAVous.vue'
import { CLASSES_FORMULAIRE, idChamp, idPhoto, photosAEnvoyer } from './champsSite'

// Onglet « Photos » de l'écran « Site public » (docs-internes/admin/CONTRAT-site-public-D.md) : une carte par photo de
// la frise « De la ferme à vous ». « Remplacer la photo » la réduit dans le navigateur (1600 px au plus) puis l'envoie
// (POST /api/admin/site/photo) : rien n'est publié avant « Publier ». La photo du haut de l'accueil reste dans le code.
// Publication, confirmation et historique : SitePublic.vue.
const photos = defineModel<PhotosSite>('photos', { required: true })
const televersement = defineModel<EmplacementFrise | ''>('televersement', { default: '' }) // Emplacement en cours d'envoi
const props = defineProps<{
  publiees: PhotosSite // Photos du site, pour « Annuler la modification »
  erreur: { champ: string; message: string }
  lectureSeule: boolean
}>()

const FORMATS = ['image/jpeg', 'image/png', 'image/webp']
const TAILLE_ENVOI = 1600 // px, côté le plus long (le serveur ramène aussi à 1600)
const POIDS_MAX = 5 * 1024 * 1024 // Limite du serveur

// Erreur d'envoi, sous la carte de l'emplacement concerné (et erreur de publication sur la photo elle-même)
const erreursEnvoi = reactive<Record<EmplacementFrise, string>>(
  Object.fromEntries(EMPLACEMENTS_FRISE.map(cle => [cle, ''])) as Record<EmplacementFrise, string>,
)
const annonce = ref('')
const erreurDe = (cle: EmplacementFrise, champ: 'url' | 'alt' | 'droits') => (props.erreur.champ === idPhoto(cle, champ) ? props.erreur.message : '')
const erreurPhoto = (cle: EmplacementFrise) => erreursEnvoi[cle] || erreurDe(cle, 'url')
const id = (cle: EmplacementFrise, champ: 'url' | 'alt' | 'droits') => idChamp(idPhoto(cle, champ))

const envoi = computed(() => photosAEnvoyer(photos.value))
const modifiee = (cle: EmplacementFrise) => JSON.stringify(envoi.value[cle]) !== JSON.stringify(photosAEnvoyer(props.publiees)[cle])
function etat(cle: EmplacementFrise): { texte: string; classe: string } {
  if (modifiee(cle)) return { texte: 'Modifiée, à publier', classe: 'bg-or/25 text-noir' }
  return photos.value[cle].url ? { texte: 'Photo publiée', classe: 'bg-foret/10 text-foret' } : { texte: 'Photo du code', classe: 'bg-creme2 text-noir' }
}

// Aperçu : la vraie frise de l'accueil avec les photos du formulaire
const frise = computed(() => composerFrise(envoi.value))

async function choisir(cle: EmplacementFrise, event: Event) {
  const input = event.target as HTMLInputElement
  const fichier = input.files?.[0]
  input.value = '' // Permet de reprendre le même fichier après une erreur
  if (!fichier || televersement.value) return
  erreursEnvoi[cle] = ''
  if (!FORMATS.includes(fichier.type)) {
    erreursEnvoi[cle] = 'Photo au format JPEG, PNG ou WebP.'
    return
  }
  televersement.value = cle
  annonce.value = `Envoi de la photo « ${TITRES_FRISE[cle]} »…`
  try {
    // Photo de téléphone (3 à 5 Mo) réduite dans le navigateur avant l'envoi : connexions lentes
    const image = await reduireImage(fichier, TAILLE_ENVOI)
    if (image.size > POIDS_MAX) {
      erreursEnvoi[cle] = 'Photo trop lourde, même réduite : 5 Mo au plus. Essayez une autre photo.'
      annonce.value = ''
      return
    }
    const donnees = new FormData()
    donnees.append('photo', image, nomFichierPhoto(image, fichier))
    const { url, publicId } = (await api.post('/api/admin/site/photo', donnees)).data ?? {}
    if (typeof url !== 'string' || typeof publicId !== 'string' || !urlPhotoValide(url, publicId)) {
      erreursEnvoi[cle] = 'La photo a été envoyée mais son adresse n\'est pas reconnue. Prévenez l\'équipe technique.'
      annonce.value = ''
      return
    }
    // Nouvelle photo : sa description et la case des droits sont à remplir pour elle
    photos.value[cle] = { url, publicId, alt: '', droits: false }
    annonce.value = `Photo « ${TITRES_FRISE[cle]} » envoyée : décrivez-la, cochez la case des droits, puis publiez.`
    await nextTick()
    document.getElementById(id(cle, 'alt'))?.focus()
  } catch (err) {
    erreursEnvoi[cle] = messageErreur(err, 'La photo n\'a pas pu être envoyée. Vérifiez la connexion et réessayez.')
    annonce.value = ''
  } finally {
    televersement.value = ''
  }
}

function revenirAuCode(cle: EmplacementFrise) {
  photos.value[cle] = photoDuCode()
  erreursEnvoi[cle] = ''
  annonce.value = `Étape « ${TITRES_FRISE[cle]} » : la photo du code reviendra à la publication.`
}
function annuler(cle: EmplacementFrise) {
  photos.value[cle] = { ...props.publiees[cle] }
  erreursEnvoi[cle] = ''
  annonce.value = `Étape « ${TITRES_FRISE[cle]} » : photo du site rétablie dans le formulaire.`
}

// Description sur une seule ligne : Entrée ne crée pas de retour à la ligne (le serveur les refuse)
const sansRetourLigne = (e: KeyboardEvent) => { if (e.key === 'Enter') e.preventDefault() }
const bouton = 'cursor-pointer inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-xl text-xs font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed'
</script>

<template>
  <div class="space-y-5">
    <p class="sr-only" role="status">{{ annonce }}</p>
    <ol class="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <li v-for="(cle, i) in EMPLACEMENTS_FRISE" :key="cle" class="rounded-2xl border border-creme2 p-3 sm:p-4 space-y-3 min-w-0">
        <div class="flex items-start justify-between gap-2">
          <h3 class="font-bold text-noir text-sm">Étape {{ i + 1 }} · {{ TITRES_FRISE[cle] }}</h3>
          <span class="shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold" :class="etat(cle).classe">{{ etat(cle).texte }}</span>
        </div>

        <div class="grid grid-cols-1 min-[420px]:grid-cols-[10rem_minmax(0,1fr)] gap-3 items-start">
          <div class="w-full max-w-60 rounded-2xl overflow-hidden">
            <PhotoAFournir :photo="photoAffichee(cle, photos[cle])" tailles="(min-width: 420px) 160px, 90vw" compact />
          </div>
          <dl class="text-xs space-y-1.5 min-w-0">
            <div>
              <dt class="font-bold text-noir">Sujet attendu</dt>
              <dd>{{ PHOTOS[cle].sujet }}</dd>
            </div>
            <div>
              <dt class="font-bold text-noir">Cadrage</dt>
              <dd>{{ PHOTOS[cle].cadrage }} · {{ PHOTOS[cle].dimensions }}, recadrée en {{ PHOTOS[cle].ratio.replace(' / ', ':') }} sur le site</dd>
            </div>
          </dl>
        </div>

        <div v-if="!lectureSeule" class="flex flex-wrap gap-2">
          <label
            class="cursor-pointer inline-flex items-center gap-1.5 min-h-11 px-3 rounded-xl bg-foret text-white text-xs font-bold hover:bg-savane has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-foret"
            :class="{ 'opacity-60 pointer-events-none': televersement !== '' }"
          >
            <Loader2 v-if="televersement === cle" class="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <ImagePlus v-else class="w-4 h-4" aria-hidden="true" />
            {{ televersement === cle ? 'Envoi…' : 'Remplacer la photo' }}<span class="sr-only"> « {{ TITRES_FRISE[cle] }} »</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" :disabled="televersement !== ''" :aria-describedby="`aide-photo-${cle}`" @change="choisir(cle, $event)" />
          </label>
          <button v-if="photos[cle].url" type="button" :disabled="televersement !== ''" :class="[bouton, 'bg-creme text-foret hover:bg-creme2']" @click="revenirAuCode(cle)">
            <RotateCcw class="w-4 h-4" aria-hidden="true" /> Revenir à la photo du code<span class="sr-only"> « {{ TITRES_FRISE[cle] }} »</span>
          </button>
          <button v-if="modifiee(cle)" type="button" :disabled="televersement !== ''" :class="[bouton, 'bg-creme text-gris hover:bg-creme2']" @click="annuler(cle)">
            <Undo2 class="w-4 h-4" aria-hidden="true" /> Annuler la modification<span class="sr-only"> « {{ TITRES_FRISE[cle] }} »</span>
          </button>
        </div>
        <p v-if="!lectureSeule" :id="`aide-photo-${cle}`" class="text-xs">JPEG, PNG ou WebP. Réduite à 1600 px avant l'envoi ; rien ne change sur le site avant « Publier ».</p>
        <!-- Erreur d'envoi ou adresse refusée à la publication : sous la photo de cet emplacement -->
        <p v-if="erreurPhoto(cle)" :id="id(cle, 'url')" role="alert" tabindex="-1" class="p-3 rounded-xl bg-red-50 text-red-800 text-xs font-semibold">{{ erreurPhoto(cle) }}</p>

        <template v-if="photos[cle].url">
          <div>
            <label :for="id(cle, 'alt')" :class="CLASSES_FORMULAIRE.etiquette">Description de la photo *</label>
            <textarea
              :id="id(cle, 'alt')" v-model="photos[cle].alt" rows="2" required :maxlength="REGLES_PHOTO.alt.max" :placeholder="PHOTOS[cle].alt" :disabled="lectureSeule"
              :class="[CLASSES_FORMULAIRE.champ, 'resize-y']" :aria-invalid="erreurDe(cle, 'alt') ? 'true' : undefined"
              :aria-describedby="`${id(cle, 'alt')}-aide${erreurDe(cle, 'alt') ? ` ${id(cle, 'alt')}-erreur` : ''}`"
              @keydown="sansRetourLigne"
            ></textarea>
            <p :id="`${id(cle, 'alt')}-aide`" class="mt-1 text-xs flex justify-between gap-2"><span>Ce que montre la photo, lu aux personnes malvoyantes ; {{ REGLES_PHOTO.alt.min }} caractères au moins.</span><span class="shrink-0 tabular-nums">{{ photos[cle].alt.length }}/{{ REGLES_PHOTO.alt.max }}</span></p>
            <p v-if="erreurDe(cle, 'alt')" :id="`${id(cle, 'alt')}-erreur`" :class="CLASSES_FORMULAIRE.erreur">{{ erreurDe(cle, 'alt') }}</p>
          </div>
          <div>
            <label :for="id(cle, 'droits')" class="flex items-start gap-3 min-h-11 p-3 rounded-xl border cursor-pointer" :class="photos[cle].droits ? 'border-foret bg-foret/5' : 'border-creme2'">
              <input :id="id(cle, 'droits')" v-model="photos[cle].droits" type="checkbox" :disabled="lectureSeule" class="mt-0.5 w-5 h-5 shrink-0 accent-foret" :aria-invalid="erreurDe(cle, 'droits') ? 'true' : undefined" :aria-describedby="erreurDe(cle, 'droits') ? `${id(cle, 'droits')}-erreur` : undefined" />
              <span class="text-xs text-noir">Photo prise par l'équipe Ahitché, ou fournie avec l'accord écrit de son auteur et des personnes visibles *</span>
            </label>
            <p v-if="erreurDe(cle, 'droits')" :id="`${id(cle, 'droits')}-erreur`" :class="CLASSES_FORMULAIRE.erreur">{{ erreurDe(cle, 'droits') }}</p>
          </div>
        </template>
      </li>
    </ol>

    <!-- Aperçu : la vraie frise de l'accueil -->
    <div class="space-y-2">
      <p class="text-xs font-bold text-foret uppercase tracking-wider">Aperçu de la frise</p>
      <div class="rounded-2xl border border-creme2 overflow-hidden">
        <FermeAVous :photos="frise" apercu />
      </div>
    </div>
  </div>
</template>
