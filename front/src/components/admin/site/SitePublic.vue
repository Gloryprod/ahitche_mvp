<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { useToast } from 'vue-toastification'
import Swal from 'sweetalert2'
import { PanelsTopLeft, Send, Eye, RotateCcw, X, ExternalLink } from 'lucide-vue-next'
import api from '@/stores/api'
import { useAuthStore } from '@/stores/auth'
import { peutEcrire } from '@/config/roles'
import { appliquerInfos } from '@/config/contact'
import { appliquerFormules } from '@/config/formules'
import { messageErreur } from '@/services/erreurs'
import BandeauAnnonce from '@/components/layout/BandeauAnnonce.vue'
import OngletFormules from './OngletFormules.vue'
import {
  JOURS_SEMAINE, annonceLivraison, formaterHoraires, formaterNumero, lienBandeauValide, type BandeauSite, type InfosSite,
  type TextesFormules,
} from '@/services/valeursSite'
import {
  CHAMPS_BANDEAU, CHAMPS_FORMULES, CHAMPS_INFOS, TITRES_CONTENUS, bandeauAEnvoyer, bandeauPublie, champDeLErreur, changements,
  controlerFormules, formulesAEnvoyer, formulesPubliees, infosAEnvoyer, infosPubliees, lireReponseSite, periodeBandeau,
  type Changement, type CleContenu, type ContenuEcran, type ContenusSite, type ReponseSite, type Version,
} from './champsSite'

// « Site public » (docs-internes/admin/CONTRAT-site-public-A.md et -B.md), section « site » : lecture admin et
// coordinateur, publication admin seulement (le serveur fait foi). Lot A : infos pratiques et bandeau d'annonce ;
// lot B : textes des cartes des formules (le prix, lui, se modifie dans « Formules et prix »). Chaque onglet :
// formulaire prérempli (valeurs publiées, sinon celles du code), aperçu en direct, publication confirmée et
// historique des 10 dernières versions.

const toast = useToast()
const queryClient = useQueryClient()
const auth = useAuthStore()
const ecriture = computed(() => peutEcrire(auth.role.value, 'site'))

const CLE_REQUETE = ['site-public']
const { data, isLoading, isError } = useQuery({
  queryKey: CLE_REQUETE,
  queryFn: async (): Promise<ReponseSite> => lireReponseSite((await api.get('/api/admin/site')).data),
})
const contenusSite = computed(() => data.value?.contenus)
const prixBase = computed(() => lireReponseSite(data.value).prix) // Prix de vente de la base (lecture seule)

const onglet = ref<CleContenu>('infos')

// --- Formulaires : remplis une fois au chargement, puis après chaque publication ---
const infos = reactive<InfosSite>(infosPubliees(undefined))
const bandeau = reactive<BandeauSite>(bandeauPublie(undefined))
const formules = reactive<TextesFormules>(formulesPubliees(undefined))
const rempli = { infos: false, bandeau: false, formules: false }

function remplir(cle: CleContenu, contenus: ContenusSite) {
  if (cle === 'infos') Object.assign(infos, infosPubliees(contenus.infos))
  else if (cle === 'bandeau') Object.assign(bandeau, bandeauPublie(contenus.bandeau))
  else Object.assign(formules, formulesPubliees(contenus.formules))
  rempli[cle] = true
}
watch(contenusSite, contenus => {
  if (!contenus) return
  if (!rempli.infos) remplir('infos', contenus)
  if (!rempli.bandeau) remplir('bandeau', contenus)
  if (!rempli.formules) remplir('formules', contenus)
}, { immediate: true })

const jamaisPublie = (cle: CleContenu) => !!contenusSite.value && !contenusSite.value[cle]
const versions = (cle: CleContenu): Version[] => contenusSite.value?.[cle]?.versions ?? []

// --- Ce qui change par rapport au site ---
const envoiInfos = computed(() => infosAEnvoyer(infos))
const envoiBandeau = computed(() => bandeauAEnvoyer(bandeau))
const envoiFormules = computed(() => formulesAEnvoyer(formules))
const changementsInfos = computed(() => changements(CHAMPS_INFOS, infosPubliees(contenusSite.value?.infos), envoiInfos.value))
const changementsBandeau = computed(() => changements(CHAMPS_BANDEAU, bandeauPublie(contenusSite.value?.bandeau), envoiBandeau.value))
const changementsFormules = computed(() => changements(CHAMPS_FORMULES, formulesPubliees(contenusSite.value?.formules), envoiFormules.value))
const listeChangementsDe = (cle: CleContenu) => ({ infos: changementsInfos, bandeau: changementsBandeau, formules: changementsFormules }[cle].value)
const aChange = (cle: CleContenu) => listeChangementsDe(cle).length > 0

// --- Aperçu en direct ---
const lienEssai = (message: string) => `https://wa.me/${envoiInfos.value.whatsappNumero}?text=${encodeURIComponent(message)}`
const apercuNumero = computed(() => formaterNumero(envoiInfos.value.whatsappNumero))
const numeroValide = computed(() => /^229(\d{8}|\d{10})$/.test(envoiInfos.value.whatsappNumero))
const apercuHoraires = computed(() => formaterHoraires(envoiInfos.value.horaires))
const apercuBandeau = computed<BandeauSite>(() => ({
  ...envoiBandeau.value,
  message: envoiBandeau.value.message || 'Votre message apparaîtra ici.',
  lien: envoiBandeau.value.texteLien ? envoiBandeau.value.lien : '',
}))
const MESSAGES = [
  { cle: 'commande', libelle: 'Commander une formule', aide: 'Boutons « Commander » du menu, du haut de l\'accueil et du bouton flottant.' },
  { cle: 'premiereCommande', libelle: 'Première commande', aide: 'Section « Comment ça marche ».' },
  { cle: 'complements', libelle: 'Produits de la semaine', aide: 'Section « Disponible cette semaine ».' },
  { cle: 'fondateur', libelle: 'Client fondateur', aide: 'Section des témoignages.' },
] as const

// --- Erreurs : à côté du champ nommé par le serveur, sinon en haut du formulaire ---
const erreurs = reactive<Record<CleContenu, { champ: string; message: string }>>({
  infos: { champ: '', message: '' },
  bandeau: { champ: '', message: '' },
  formules: { champ: '', message: '' },
})
// Une erreur affichée disparaît dès que le formulaire change (elle reviendra à la prochaine publication si besoin)
watch(() => JSON.stringify(infos), () => { erreurs.infos = { champ: '', message: '' } })
watch(() => JSON.stringify(bandeau), () => { erreurs.bandeau = { champ: '', message: '' } })
watch(() => JSON.stringify(formules), () => { erreurs.formules = { champ: '', message: '' } })
const idChamp = (id: string) => `champ-site-${id.replace(/\./g, '-')}`
const erreurDe = (cle: CleContenu, champ: string) => (erreurs[cle].champ === champ ? erreurs[cle].message : '')
const attributsErreur = (cle: CleContenu, champ: string) => (erreurDe(cle, champ)
  ? { 'aria-invalid': 'true' as const, 'aria-describedby': `${idChamp(champ)}-erreur` }
  : {})

async function signaler(cle: CleContenu, message: string, champ = champDeLErreur(cle, message)) {
  erreurs[cle] = { champ, message }
  await nextTick()
  const cible = champ ? document.getElementById(idChamp(champ)) : document.getElementById(`erreur-haut-${cle}`)
  cible?.focus()
  cible?.scrollIntoView({ block: 'center' })
}

// Contrôles simples avant l'envoi (le serveur refait tout)
function controler(cle: CleContenu): { champ: string; message: string } | null {
  if (cle === 'infos') {
    if (!numeroValide.value) return { champ: 'whatsappNumero', message: 'Numéro WhatsApp : 229 suivi de 8 ou 10 chiffres (ex. +229 01 23 45 67 89).' }
    if (!infos.horaires.jours.length) return { champ: 'horaires.jours', message: 'Jours d\'ouverture : choisissez au moins un jour.' }
    if (infos.horaires.ouverture >= infos.horaires.fermeture) return { champ: 'horaires.fermeture', message: 'Horaires : l\'heure d\'ouverture doit précéder l\'heure de fermeture.' }
    return null
  }
  if (cle === 'formules') return controlerFormules(envoiFormules.value)
  const b = envoiBandeau.value
  if (b.lien && !lienBandeauValide(b.lien)) return { champ: 'lien', message: 'Lien du bandeau : un chemin du site (ex. /blog) ou une adresse https://wa.me/…' }
  if (b.debut && b.fin && b.fin < b.debut) return { champ: 'fin', message: 'Fin du bandeau : ne peut pas précéder le début.' }
  return null
}

// --- Confirmation : la liste de ce qui change ---
const STYLE_SWAL = { confirmButtonColor: 'var(--color-foret)', cancelButtonColor: 'var(--color-gris)', customClass: { popup: 'rounded-2xl font-body' } }
const echapper = (texte: string) => texte.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]!))
const listeChangements = (liste: Changement[]) => `<ul style="text-align:left;font-size:.875rem;line-height:1.45;margin:0;padding:0;list-style:none">${liste
  .map(c => `<li style="padding:.5rem 0;border-top:1px solid var(--color-creme2)"><strong>${echapper(c.libelle)}</strong><br><span style="color:var(--color-gris)">Avant : ${echapper(c.avant)}</span><br>Après : ${echapper(c.apres)}</li>`)
  .join('')}</ul>`

// Cache public du serveur (60 s, puis 300 s de reprise) : une nouvelle version met quelques minutes à s'afficher partout
const AVIS_CACHE = 'Le site affiche la nouvelle version d\'ici quelques minutes.'
const nouvelleVersion = reactive<Record<CleContenu, boolean>>({ infos: false, bandeau: false, formules: false })

// Met à jour l'écran (et le site de cet onglet) avec la réponse du serveur ; le message du serveur est affiché tel quel
type ContenuRecu = ContenuEcran<InfosSite> | ContenuEcran<BandeauSite> | ContenuEcran<TextesFormules> | null
function enregistrerReponse(cle: CleContenu, contenu: ContenuRecu, message: string) {
  const avant = versions(cle)[0]?._id
  const publiee = !!contenu?.versions?.[0] && contenu.versions[0]._id !== avant
  const actuel = lireReponseSite(data.value)
  const contenus = { ...actuel.contenus, [cle]: contenu } as ContenusSite
  queryClient.setQueryData<ReponseSite>(CLE_REQUETE, { contenus, prix: actuel.prix })
  remplir(cle, contenus)
  if (cle === 'infos' && contenus.infos) appliquerInfos(contenus.infos.valeurs)
  if (cle === 'formules' && contenus.formules) appliquerFormules(contenus.formules.valeurs, actuel.prix)
  if (publiee) {
    nouvelleVersion[cle] = true
    toast.success(`${message} ${AVIS_CACHE}`)
  } else {
    toast.info(message) // « Aucun changement : rien n'a été publié. », « Cette version est déjà celle du site… »
  }
}

const envoi = ref<CleContenu | ''>('')
const OBJETS_PUBLICATION: Record<CleContenu, string> = { infos: 'les infos pratiques', bandeau: 'le bandeau d\'annonce', formules: 'les textes des formules' }

async function publier(cle: CleContenu) {
  if (!ecriture.value || envoi.value) return
  erreurs[cle] = { champ: '', message: '' }
  const probleme = controler(cle)
  if (probleme) return signaler(cle, probleme.message, probleme.champ)
  const liste = listeChangementsDe(cle)
  if (!liste.length) return toast.info('Aucun changement par rapport au site.')
  const choix = await Swal.fire({
    ...STYLE_SWAL,
    title: `Publier ${OBJETS_PUBLICATION[cle]} ?`,
    html: `<p style="font-size:.875rem;margin-bottom:.5rem">Le site change dès la publication. Ce qui change :</p>${listeChangements(liste)}`,
    showCancelButton: true, confirmButtonText: 'Publier', cancelButtonText: 'Annuler', focusCancel: true,
  })
  if (!choix.isConfirmed) return
  envoi.value = cle
  try {
    const valeurs = { infos: envoiInfos, bandeau: envoiBandeau, formules: envoiFormules }[cle].value
    const { data: r } = await api.put(`/api/admin/site/${cle}`, { valeurs })
    enregistrerReponse(cle, r.contenu, r.message)
  } catch (err) {
    await signaler(cle, messageErreur(err, 'La publication a échoué. Réessayez.'))
  } finally {
    envoi.value = ''
  }
}

// --- Historique : voir une version, y revenir ---
const dateHeure = (d: string) => new Date(d).toLocaleString('fr-FR', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Porto-Novo',
})
interface VersionDetaillee { valeurs: InfosSite | BandeauSite | TextesFormules; publieLe: string; publiePar: { nom: string } }
const cacheVersions = new Map<string, VersionDetaillee>()
async function chargerVersion(cle: CleContenu, id: string): Promise<VersionDetaillee> {
  const cleCache = `${cle}:${id}`
  const connue = cacheVersions.get(cleCache)
  if (connue) return connue
  const { data: v } = await api.get(`/api/admin/site/${cle}/versions/${id}`)
  cacheVersions.set(cleCache, v)
  return v
}

// Une version lue comme le site la lirait : ses lignes (« Voir ») et ce qui change par rapport au site actuel
function enContenu<T>(valeurs: unknown): ContenuEcran<T> {
  return { valeurs: valeurs as T, updatedAt: '', versions: [] }
}
function comparerVersion(cle: CleContenu, valeurs: VersionDetaillee['valeurs']): { lignes: { libelle: string; valeur: string }[]; liste: Changement[] } {
  if (cle === 'infos') {
    const v = infosPubliees(enContenu<InfosSite>(valeurs))
    return { lignes: CHAMPS_INFOS.map(c => ({ libelle: c.libelle, valeur: c.lire(v) })), liste: changements(CHAMPS_INFOS, infosPubliees(contenusSite.value?.infos), v) }
  }
  if (cle === 'bandeau') {
    const v = bandeauPublie(enContenu<BandeauSite>(valeurs))
    return { lignes: CHAMPS_BANDEAU.map(c => ({ libelle: c.libelle, valeur: c.lire(v) })), liste: changements(CHAMPS_BANDEAU, bandeauPublie(contenusSite.value?.bandeau), v) }
  }
  const v = formulesPubliees(enContenu<TextesFormules>(valeurs))
  return { lignes: CHAMPS_FORMULES.map(c => ({ libelle: c.libelle, valeur: c.lire(v) })), liste: changements(CHAMPS_FORMULES, formulesPubliees(contenusSite.value?.formules), v) }
}

const fenetre = reactive({ ouverte: false, cle: 'infos' as CleContenu, version: null as Version | null, chargement: false, erreur: '', lignes: [] as { libelle: string; valeur: string }[] })
let declencheur: HTMLElement | null = null
const boutonFermer = ref<HTMLButtonElement | null>(null)

async function voir(cle: CleContenu, version: Version) {
  declencheur = document.activeElement instanceof HTMLElement ? document.activeElement : null
  Object.assign(fenetre, { ouverte: true, cle, version, chargement: true, erreur: '', lignes: [] })
  await nextTick()
  boutonFermer.value?.focus()
  try {
    const v = await chargerVersion(cle, version._id)
    fenetre.lignes = comparerVersion(cle, v.valeurs).lignes
  } catch (err) {
    fenetre.erreur = messageErreur(err, 'Cette version n\'a pas pu être chargée.')
  } finally {
    fenetre.chargement = false
  }
}
function fermerFenetre() {
  fenetre.ouverte = false
  declencheur?.focus()
  declencheur = null
}

const estEnLigne = (cle: CleContenu, version: Version) => versions(cle)[0]?._id === version._id

async function revenir(cle: CleContenu, version: Version) {
  if (!ecriture.value || envoi.value) return
  erreurs[cle] = { champ: '', message: '' }
  let v: VersionDetaillee
  try {
    v = await chargerVersion(cle, version._id)
  } catch (err) {
    return toast.error(messageErreur(err, 'Cette version n\'a pas pu être chargée.'))
  }
  const liste = comparerVersion(cle, v.valeurs).liste
  const brouillon = aChange(cle)
  const choix = await Swal.fire({
    ...STYLE_SWAL,
    title: `Revenir à la version du ${dateHeure(version.publieLe)} ?`,
    html: `<p style="font-size:.875rem;margin-bottom:.5rem">Elle est republiée tout de suite, comme une nouvelle publication.${brouillon ? ' Vos modifications non publiées du formulaire seront remplacées.' : ''}</p>${liste.length ? listeChangements(liste) : '<p style="font-size:.875rem">Aucune différence avec le site actuel.</p>'}`,
    showCancelButton: true, confirmButtonText: 'Revenir à cette version', cancelButtonText: 'Annuler', focusCancel: true,
  })
  if (!choix.isConfirmed) return
  if (fenetre.ouverte) fermerFenetre()
  envoi.value = cle
  try {
    const { data: r } = await api.post(`/api/admin/site/${cle}/versions/${version._id}/restaurer`)
    enregistrerReponse(cle, r.contenu, r.message)
  } catch (err) {
    await signaler(cle, messageErreur(err, 'Le retour à cette version a échoué.'), '')
  } finally {
    envoi.value = ''
  }
}

// Messages sur une seule ligne : Entrée ne crée pas de retour à la ligne (le serveur les refuse)
const sansRetourLigne = (e: KeyboardEvent) => { if (e.key === 'Enter') e.preventDefault() }

const champ = 'mt-1 w-full min-h-11 px-3 py-2 rounded-xl border border-creme2 bg-creme text-sm text-noir font-normal disabled:opacity-80 aria-invalid:border-red-400'
const etiquette = 'block text-xs font-bold text-noir'
const bouton = 'cursor-pointer inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-xl text-xs font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed'
const boutonOnglet = (actif: boolean) => [
  'cursor-pointer shrink-0 min-h-11 px-4 rounded-xl text-sm font-bold transition-colors',
  actif ? 'bg-foret text-white' : 'bg-white text-foret hover:bg-creme2',
]
const erreurChamp = 'mt-1 text-xs font-semibold text-red-700'
</script>

<template>
  <div class="space-y-5 text-sm text-gris">
    <div class="bg-white p-4 rounded-2xl space-y-2">
      <h1 class="font-display font-bold text-xl text-noir flex items-center gap-2"><PanelsTopLeft class="w-5 h-5 text-foret" aria-hidden="true" /> Site public</h1>
      <p class="text-xs">
        Les contenus du site, modifiables sans code. Chaque publication est enregistrée dans le journal et l'historique garde les 10 dernières versions.
        <template v-if="!ecriture"> Lecture seule : seul l'administrateur publie.</template>
      </p>
    </div>

    <div v-onglets class="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Contenus du site">
      <button id="onglet-infos" type="button" role="tab" :aria-selected="onglet === 'infos'" aria-controls="panneau-infos" :class="boutonOnglet(onglet === 'infos')" @click="onglet = 'infos'">
        Infos pratiques
      </button>
      <button id="onglet-bandeau" type="button" role="tab" :aria-selected="onglet === 'bandeau'" aria-controls="panneau-bandeau" :class="boutonOnglet(onglet === 'bandeau')" @click="onglet = 'bandeau'">
        Bandeau d'annonce
      </button>
      <button id="onglet-formules" type="button" role="tab" :aria-selected="onglet === 'formules'" aria-controls="panneau-formules" :class="boutonOnglet(onglet === 'formules')" @click="onglet = 'formules'">
        Formules
      </button>
    </div>

    <p v-if="isLoading" class="bg-white rounded-2xl p-6 text-center">Chargement des contenus du site…</p>
    <p v-else-if="isError" role="alert" class="bg-red-50 text-red-700 rounded-2xl p-6 text-center">Les contenus du site n'ont pas pu être chargés.</p>

    <template v-else>
      <!-- ============ INFOS PRATIQUES ============ -->
      <section v-show="onglet === 'infos'" id="panneau-infos" role="tabpanel" aria-labelledby="onglet-infos" class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
        <form class="bg-white rounded-2xl p-4 space-y-5 min-w-0" novalidate aria-labelledby="titre-infos" @submit.prevent="publier('infos')">
          <div class="space-y-1">
            <h2 id="titre-infos" class="font-bold text-noir text-base">Infos pratiques</h2>
            <p v-if="jamaisPublie('infos')" class="text-xs p-2.5 rounded-xl bg-creme text-noir">Valeurs actuelles du site (jamais modifiées depuis l'admin)</p>
            <p v-else-if="versions('infos')[0]" class="text-xs">Publié le {{ dateHeure(versions('infos')[0]!.publieLe) }} par {{ versions('infos')[0]!.publiePar.nom || 'un administrateur' }}.</p>
          </div>
          <p v-if="erreurs.infos.message && !erreurs.infos.champ" id="erreur-haut-infos" role="alert" tabindex="-1" class="p-3 rounded-xl bg-red-50 text-red-800 text-xs font-semibold">{{ erreurs.infos.message }}</p>

          <fieldset :disabled="!ecriture" class="space-y-5 min-w-0">
            <legend class="sr-only">Infos pratiques du site</legend>

            <!-- WhatsApp -->
            <div class="space-y-3">
              <h3 class="text-xs font-bold text-foret uppercase tracking-wider">WhatsApp</h3>
              <div>
                <label :for="idChamp('whatsappNumero')" :class="etiquette">Numéro WhatsApp *</label>
                <input :id="idChamp('whatsappNumero')" v-model="infos.whatsappNumero" type="tel" inputmode="tel" autocomplete="off" required maxlength="20" :class="champ" aria-describedby="aide-numero" v-bind="attributsErreur('infos', 'whatsappNumero')" />
                <p id="aide-numero" class="mt-1 text-xs">229 suivi de 8 ou 10 chiffres ; espaces et « + » acceptés. Affiché : <strong class="text-noir">{{ apercuNumero || '—' }}</strong></p>
                <p v-if="erreurDe('infos', 'whatsappNumero')" :id="`${idChamp('whatsappNumero')}-erreur`" :class="erreurChamp">{{ erreurDe('infos', 'whatsappNumero') }}</p>
              </div>
              <div v-for="m in MESSAGES" :key="m.cle">
                <label :for="idChamp(`messages.${m.cle}`)" :class="etiquette">Message « {{ m.libelle }} » *</label>
                <textarea :id="idChamp(`messages.${m.cle}`)" v-model="infos.messages[m.cle]" rows="2" required maxlength="300" :class="[champ, 'resize-y']" :aria-describedby="`aide-${m.cle}`" v-bind="attributsErreur('infos', `messages.${m.cle}`)" @keydown="sansRetourLigne"></textarea>
                <p :id="`aide-${m.cle}`" class="mt-1 text-xs flex justify-between gap-2"><span>{{ m.aide }}</span><span class="shrink-0">{{ infos.messages[m.cle].length }}/300</span></p>
                <p v-if="erreurDe('infos', `messages.${m.cle}`)" :id="`${idChamp(`messages.${m.cle}`)}-erreur`" :class="erreurChamp">{{ erreurDe('infos', `messages.${m.cle}`) }}</p>
              </div>
            </div>

            <!-- Réseaux -->
            <div class="space-y-3">
              <h3 class="text-xs font-bold text-foret uppercase tracking-wider">Réseaux sociaux</h3>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div v-for="r in ([{ id: 'facebook', nom: 'Facebook', exemple: 'https://www.facebook.com/…' }, { id: 'tiktok', nom: 'TikTok', exemple: 'https://www.tiktok.com/@…' }] as const)" :key="r.id" class="min-w-0">
                  <label :for="idChamp(r.id)" :class="etiquette">{{ r.nom }}</label>
                  <input :id="idChamp(r.id)" v-model="infos[r.id]" type="url" inputmode="url" autocomplete="off" maxlength="300" :placeholder="r.exemple" :class="champ" :aria-describedby="`aide-${r.id}`" v-bind="attributsErreur('infos', r.id)" />
                  <p :id="`aide-${r.id}`" class="mt-1 text-xs">Vide : le lien n'apparaît plus sur le site.</p>
                  <p v-if="erreurDe('infos', r.id)" :id="`${idChamp(r.id)}-erreur`" :class="erreurChamp">{{ erreurDe('infos', r.id) }}</p>
                </div>
              </div>
            </div>

            <!-- Horaires -->
            <div class="space-y-3">
              <h3 class="text-xs font-bold text-foret uppercase tracking-wider">Horaires de réponse</h3>
              <fieldset :id="idChamp('horaires.jours')" tabindex="-1" :aria-describedby="erreurDe('infos', 'horaires.jours') ? `${idChamp('horaires.jours')}-erreur` : undefined">
                <legend :class="etiquette">Jours d'ouverture *</legend>
                <div class="mt-1 flex flex-wrap gap-2">
                  <label v-for="j in JOURS_SEMAINE" :key="j" class="inline-flex items-center gap-2 min-h-11 px-3 rounded-xl border cursor-pointer text-sm text-noir capitalize" :class="infos.horaires.jours.includes(j) ? 'border-foret bg-foret/5' : 'border-creme2'">
                    <input v-model="infos.horaires.jours" type="checkbox" :value="j" class="w-4 h-4 accent-foret" />
                    {{ j }}
                  </label>
                </div>
                <p v-if="erreurDe('infos', 'horaires.jours')" :id="`${idChamp('horaires.jours')}-erreur`" :class="erreurChamp">{{ erreurDe('infos', 'horaires.jours') }}</p>
              </fieldset>
              <div class="grid grid-cols-2 gap-3 max-w-sm">
                <div>
                  <label :for="idChamp('horaires.ouverture')" :class="etiquette">Ouverture *</label>
                  <input :id="idChamp('horaires.ouverture')" v-model="infos.horaires.ouverture" type="time" required :class="champ" v-bind="attributsErreur('infos', 'horaires.ouverture')" />
                </div>
                <div>
                  <label :for="idChamp('horaires.fermeture')" :class="etiquette">Fermeture *</label>
                  <input :id="idChamp('horaires.fermeture')" v-model="infos.horaires.fermeture" type="time" required :class="champ" v-bind="attributsErreur('infos', 'horaires.fermeture')" />
                </div>
              </div>
              <p v-if="erreurDe('infos', 'horaires.ouverture')" :id="`${idChamp('horaires.ouverture')}-erreur`" :class="erreurChamp">{{ erreurDe('infos', 'horaires.ouverture') }}</p>
              <p v-if="erreurDe('infos', 'horaires.fermeture')" :id="`${idChamp('horaires.fermeture')}-erreur`" :class="erreurChamp">{{ erreurDe('infos', 'horaires.fermeture') }}</p>
            </div>

            <!-- Livraison et paiement -->
            <div class="space-y-3">
              <h3 class="text-xs font-bold text-foret uppercase tracking-wider">Livraison et paiement</h3>
              <div>
                <label :for="idChamp('joursLivraison')" :class="etiquette">Jours de livraison</label>
                <input :id="idChamp('joursLivraison')" v-model="infos.joursLivraison" type="text" maxlength="80" autocomplete="off" placeholder="le mardi et le samedi" :class="champ" aria-describedby="aide-livraison" v-bind="attributsErreur('infos', 'joursLivraison')" />
                <p id="aide-livraison" class="mt-1 text-xs">Affiché : « {{ annonceLivraison(envoiInfos.joursLivraison) }} ». Vide tant que les jours ne sont pas confirmés.</p>
                <p v-if="erreurDe('infos', 'joursLivraison')" :id="`${idChamp('joursLivraison')}-erreur`" :class="erreurChamp">{{ erreurDe('infos', 'joursLivraison') }}</p>
              </div>
              <div>
                <label :for="idChamp('paiement')" :class="etiquette">Moyens de paiement *</label>
                <input :id="idChamp('paiement')" v-model="infos.paiement" type="text" required maxlength="120" autocomplete="off" :class="champ" aria-describedby="aide-paiement" v-bind="attributsErreur('infos', 'paiement')" />
                <p id="aide-paiement" class="mt-1 text-xs">Repris dans « Vous payez à la livraison », « Comment ça marche » et la FAQ.</p>
                <p v-if="erreurDe('infos', 'paiement')" :id="`${idChamp('paiement')}-erreur`" :class="erreurChamp">{{ erreurDe('infos', 'paiement') }}</p>
              </div>
            </div>
          </fieldset>

          <div v-if="ecriture" class="pt-3 border-t border-creme2 space-y-2">
            <button type="submit" :disabled="envoi !== '' || !aChange('infos')" :class="[bouton, 'w-full sm:w-auto bg-foret text-white hover:bg-savane px-5 text-sm']">
              <Send class="w-4 h-4" aria-hidden="true" /> {{ envoi === 'infos' ? 'Publication…' : 'Publier' }}
            </button>
            <p v-if="nouvelleVersion.infos" role="status" class="text-xs text-foret font-semibold">{{ AVIS_CACHE }}</p>
            <p class="text-xs">{{ aChange('infos') ? `${changementsInfos.length} changement(s) à publier.` : 'Aucun changement par rapport au site.' }}</p>
            <p class="text-xs text-noir font-semibold">Pas de promesse de santé ni de prix non validé ; le site change dès la publication.</p>
          </div>
        </form>

        <!-- Aperçu en direct -->
        <aside class="bg-white rounded-2xl p-4 space-y-4 lg:sticky lg:top-4 min-w-0" aria-labelledby="titre-apercu-infos">
          <h2 id="titre-apercu-infos" class="font-bold text-noir text-base">Aperçu</h2>
          <div class="space-y-2">
            <p class="text-xs font-bold text-foret uppercase tracking-wider">WhatsApp</p>
            <p class="text-noir font-bold">{{ apercuNumero || '—' }}</p>
            <ul class="space-y-1.5">
              <li v-for="m in MESSAGES" :key="m.cle">
                <a v-if="numeroValide" :href="lienEssai(envoiInfos.messages[m.cle])" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 min-h-11 text-savane font-bold hover:text-foret">
                  <ExternalLink class="w-4 h-4 shrink-0" aria-hidden="true" /> Essayer « {{ m.libelle }} »
                </a>
                <span v-else class="text-xs">Numéro incomplet : lien indisponible.</span>
              </li>
            </ul>
          </div>
          <div>
            <p class="text-xs font-bold text-foret uppercase tracking-wider">Horaires</p>
            <p class="text-noir">{{ apercuHoraires }}</p>
          </div>
          <div>
            <p class="text-xs font-bold text-foret uppercase tracking-wider">Livraison et paiement</p>
            <p class="text-noir">{{ annonceLivraison(envoiInfos.joursLivraison) }}</p>
            <p class="text-noir">Vous payez à la livraison : {{ envoiInfos.paiement || '—' }}, une fois vos vivres reçus.</p>
          </div>
          <div>
            <p class="text-xs font-bold text-foret uppercase tracking-wider">Réseaux sociaux</p>
            <ul class="text-noir">
              <li v-for="r in ([{ nom: 'Facebook', url: envoiInfos.facebook }, { nom: 'TikTok', url: envoiInfos.tiktok }])" :key="r.nom" class="break-all">
                {{ r.nom }} : <a v-if="r.url" :href="r.url" target="_blank" rel="noopener noreferrer" class="inline-flex items-center min-h-11 text-savane font-semibold underline underline-offset-2">{{ r.url }}</a><span v-else class="text-gris">masqué</span>
              </li>
            </ul>
          </div>
        </aside>

        <!-- Historique -->
        <section class="bg-white rounded-2xl p-4 space-y-3 lg:col-span-2" aria-labelledby="titre-historique-infos">
          <h2 id="titre-historique-infos" class="font-bold text-noir text-base">Historique (10 dernières publications)</h2>
          <p v-if="!versions('infos').length" class="text-xs">Aucune publication pour l'instant.</p>
          <ul v-else class="divide-y divide-creme2">
            <li v-for="v in versions('infos')" :key="v._id" class="py-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
              <p class="flex-1 min-w-0 text-noir">
                {{ dateHeure(v.publieLe) }} <span class="text-gris">par {{ v.publiePar.nom || 'un administrateur' }}</span>
                <span v-if="estEnLigne('infos', v)" class="ml-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-foret/10 text-foret">En ligne</span>
              </p>
              <div class="flex gap-2">
                <button type="button" :class="[bouton, 'bg-creme text-foret hover:bg-creme2']" :aria-label="`Voir la version du ${dateHeure(v.publieLe)}`" @click="voir('infos', v)">
                  <Eye class="w-4 h-4" aria-hidden="true" /> Voir
                </button>
                <button v-if="ecriture && !estEnLigne('infos', v)" type="button" :disabled="envoi !== ''" :class="[bouton, 'bg-creme text-foret hover:bg-creme2']" :aria-label="`Revenir à la version du ${dateHeure(v.publieLe)}`" @click="revenir('infos', v)">
                  <RotateCcw class="w-4 h-4" aria-hidden="true" /> Revenir à cette version
                </button>
              </div>
            </li>
          </ul>
        </section>
      </section>

      <!-- ============ BANDEAU D'ANNONCE ============ -->
      <section v-show="onglet === 'bandeau'" id="panneau-bandeau" role="tabpanel" aria-labelledby="onglet-bandeau" class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
        <form class="bg-white rounded-2xl p-4 space-y-5 min-w-0" novalidate aria-labelledby="titre-bandeau" @submit.prevent="publier('bandeau')">
          <div class="space-y-1">
            <h2 id="titre-bandeau" class="font-bold text-noir text-base">Bandeau d'annonce</h2>
            <p v-if="jamaisPublie('bandeau')" class="text-xs p-2.5 rounded-xl bg-creme text-noir">Valeurs actuelles du site (jamais modifiées depuis l'admin)</p>
            <p v-else-if="versions('bandeau')[0]" class="text-xs">Publié le {{ dateHeure(versions('bandeau')[0]!.publieLe) }} par {{ versions('bandeau')[0]!.publiePar.nom || 'un administrateur' }}.</p>
            <p class="text-xs">Barre en bas de l'écran, sur les pages publiques seulement ; le visiteur peut la fermer.</p>
          </div>
          <p v-if="erreurs.bandeau.message && !erreurs.bandeau.champ" id="erreur-haut-bandeau" role="alert" tabindex="-1" class="p-3 rounded-xl bg-red-50 text-red-800 text-xs font-semibold">{{ erreurs.bandeau.message }}</p>

          <fieldset :disabled="!ecriture" class="space-y-4 min-w-0">
            <legend class="sr-only">Bandeau d'annonce du site</legend>
            <label :for="idChamp('actif')" class="flex items-center gap-3 min-h-11 p-3 rounded-xl border cursor-pointer" :class="bandeau.actif ? 'border-foret bg-foret/5' : 'border-creme2'">
              <input :id="idChamp('actif')" v-model="bandeau.actif" type="checkbox" class="w-5 h-5 accent-foret" />
              <span><strong class="text-noir">Afficher le bandeau</strong><span class="block text-xs">{{ periodeBandeau(envoiBandeau) }}</span></span>
            </label>

            <div>
              <label :for="idChamp('message')" :class="etiquette">Message{{ bandeau.actif ? ' *' : '' }}</label>
              <textarea :id="idChamp('message')" v-model="bandeau.message" rows="2" maxlength="160" :required="bandeau.actif" :class="[champ, 'resize-y']" aria-describedby="aide-message-bandeau" placeholder="Livraisons du 24 décembre : commandez avant le 20." v-bind="attributsErreur('bandeau', 'message')" @keydown="sansRetourLigne"></textarea>
              <p id="aide-message-bandeau" class="mt-1 text-xs flex justify-between gap-2"><span>Court et clair, sans promesse non validée.</span><span class="shrink-0">{{ bandeau.message.length }}/160</span></p>
              <p v-if="erreurDe('bandeau', 'message')" :id="`${idChamp('message')}-erreur`" :class="erreurChamp">{{ erreurDe('bandeau', 'message') }}</p>
            </div>

            <fieldset :id="idChamp('ton')" tabindex="-1">
              <legend :class="etiquette">Ton</legend>
              <div class="mt-1 grid grid-cols-1 min-[420px]:grid-cols-2 gap-2">
                <label class="flex items-center gap-2 min-h-11 p-3 rounded-xl border cursor-pointer" :class="bandeau.ton === 'info' ? 'border-foret bg-foret/5' : 'border-creme2'">
                  <input v-model="bandeau.ton" type="radio" value="info" name="ton-bandeau" class="w-4 h-4 accent-foret" />
                  <span class="w-4 h-4 rounded-full bg-foret shrink-0" aria-hidden="true"></span>
                  <span><strong class="text-noir">Info</strong><span class="block text-xs">Fond vert forêt</span></span>
                </label>
                <label class="flex items-center gap-2 min-h-11 p-3 rounded-xl border cursor-pointer" :class="bandeau.ton === 'important' ? 'border-foret bg-foret/5' : 'border-creme2'">
                  <input v-model="bandeau.ton" type="radio" value="important" name="ton-bandeau" class="w-4 h-4 accent-foret" />
                  <span class="w-4 h-4 rounded-full bg-or shrink-0" aria-hidden="true"></span>
                  <span><strong class="text-noir">Important</strong><span class="block text-xs">Fond or</span></span>
                </label>
              </div>
              <p v-if="erreurDe('bandeau', 'ton')" :id="`${idChamp('ton')}-erreur`" :class="erreurChamp">{{ erreurDe('bandeau', 'ton') }}</p>
            </fieldset>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div class="min-w-0">
                <label :for="idChamp('lien')" :class="etiquette">Lien</label>
                <input :id="idChamp('lien')" v-model="bandeau.lien" type="text" inputmode="url" maxlength="300" autocomplete="off" placeholder="/blog ou https://wa.me/229…" :class="champ" aria-describedby="aide-lien-bandeau" v-bind="attributsErreur('bandeau', 'lien')" />
                <p id="aide-lien-bandeau" class="mt-1 text-xs">Facultatif : une page du site (commence par /) ou une adresse https://wa.me/…</p>
                <p v-if="erreurDe('bandeau', 'lien')" :id="`${idChamp('lien')}-erreur`" :class="erreurChamp">{{ erreurDe('bandeau', 'lien') }}</p>
              </div>
              <div class="min-w-0">
                <label :for="idChamp('texteLien')" :class="etiquette">Texte du lien{{ bandeau.lien ? ' *' : '' }}</label>
                <input :id="idChamp('texteLien')" v-model="bandeau.texteLien" type="text" maxlength="40" autocomplete="off" :required="!!bandeau.lien" placeholder="En savoir plus" :class="champ" v-bind="attributsErreur('bandeau', 'texteLien')" />
                <p v-if="erreurDe('bandeau', 'texteLien')" :id="`${idChamp('texteLien')}-erreur`" :class="erreurChamp">{{ erreurDe('bandeau', 'texteLien') }}</p>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3 max-w-sm">
              <div>
                <label :for="idChamp('debut')" :class="etiquette">Début</label>
                <input :id="idChamp('debut')" v-model="bandeau.debut" type="date" :max="bandeau.fin || undefined" :class="champ" v-bind="attributsErreur('bandeau', 'debut')" />
              </div>
              <div>
                <label :for="idChamp('fin')" :class="etiquette">Fin</label>
                <input :id="idChamp('fin')" v-model="bandeau.fin" type="date" :min="bandeau.debut || undefined" :class="champ" v-bind="attributsErreur('bandeau', 'fin')" />
              </div>
            </div>
            <p class="text-xs -mt-2">Facultatives, jours inclus, heure de Cotonou.</p>
            <p v-if="erreurDe('bandeau', 'debut')" :id="`${idChamp('debut')}-erreur`" :class="erreurChamp">{{ erreurDe('bandeau', 'debut') }}</p>
            <p v-if="erreurDe('bandeau', 'fin')" :id="`${idChamp('fin')}-erreur`" :class="erreurChamp">{{ erreurDe('bandeau', 'fin') }}</p>
          </fieldset>

          <div v-if="ecriture" class="pt-3 border-t border-creme2 space-y-2">
            <button type="submit" :disabled="envoi !== '' || !aChange('bandeau')" :class="[bouton, 'w-full sm:w-auto bg-foret text-white hover:bg-savane px-5 text-sm']">
              <Send class="w-4 h-4" aria-hidden="true" /> {{ envoi === 'bandeau' ? 'Publication…' : 'Publier' }}
            </button>
            <p v-if="nouvelleVersion.bandeau" role="status" class="text-xs text-foret font-semibold">{{ AVIS_CACHE }}</p>
            <p class="text-xs">{{ aChange('bandeau') ? `${changementsBandeau.length} changement(s) à publier.` : 'Aucun changement par rapport au site.' }}</p>
            <p class="text-xs text-noir font-semibold">Pas de promesse de santé ni de prix non validé ; le site change dès la publication.</p>
          </div>
        </form>

        <aside class="bg-white rounded-2xl p-4 space-y-3 lg:sticky lg:top-4 min-w-0" aria-labelledby="titre-apercu-bandeau">
          <h2 id="titre-apercu-bandeau" class="font-bold text-noir text-base">Aperçu</h2>
          <BandeauAnnonce :bandeau="apercuBandeau" apercu />
          <p class="text-xs">{{ periodeBandeau(envoiBandeau) }}</p>
        </aside>

        <section class="bg-white rounded-2xl p-4 space-y-3 lg:col-span-2" aria-labelledby="titre-historique-bandeau">
          <h2 id="titre-historique-bandeau" class="font-bold text-noir text-base">Historique (10 dernières publications)</h2>
          <p v-if="!versions('bandeau').length" class="text-xs">Aucune publication pour l'instant.</p>
          <ul v-else class="divide-y divide-creme2">
            <li v-for="v in versions('bandeau')" :key="v._id" class="py-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
              <p class="flex-1 min-w-0 text-noir">
                {{ dateHeure(v.publieLe) }} <span class="text-gris">par {{ v.publiePar.nom || 'un administrateur' }}</span>
                <span v-if="estEnLigne('bandeau', v)" class="ml-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-foret/10 text-foret">En ligne</span>
              </p>
              <div class="flex gap-2">
                <button type="button" :class="[bouton, 'bg-creme text-foret hover:bg-creme2']" :aria-label="`Voir la version du ${dateHeure(v.publieLe)}`" @click="voir('bandeau', v)">
                  <Eye class="w-4 h-4" aria-hidden="true" /> Voir
                </button>
                <button v-if="ecriture && !estEnLigne('bandeau', v)" type="button" :disabled="envoi !== ''" :class="[bouton, 'bg-creme text-foret hover:bg-creme2']" :aria-label="`Revenir à la version du ${dateHeure(v.publieLe)}`" @click="revenir('bandeau', v)">
                  <RotateCcw class="w-4 h-4" aria-hidden="true" /> Revenir à cette version
                </button>
              </div>
            </li>
          </ul>
        </section>
      </section>

      <!-- ============ FORMULES ============ -->
      <section v-show="onglet === 'formules'" id="panneau-formules" role="tabpanel" aria-labelledby="onglet-formules" class="space-y-4">
        <form class="bg-white rounded-2xl p-4 space-y-5 min-w-0" novalidate aria-labelledby="titre-formules" @submit.prevent="publier('formules')">
          <div class="space-y-1">
            <h2 id="titre-formules" class="font-bold text-noir text-base">Formules</h2>
            <p v-if="jamaisPublie('formules')" class="text-xs p-2.5 rounded-xl bg-creme text-noir">Valeurs actuelles du site (jamais modifiées depuis l'admin)</p>
            <p v-else-if="versions('formules')[0]" class="text-xs">Publié le {{ dateHeure(versions('formules')[0]!.publieLe) }} par {{ versions('formules')[0]!.publiePar.nom || 'un administrateur' }}.</p>
            <p class="text-xs">Textes des cartes de l'accueil. Nom, couleurs, niveau et produits restent fixes ; le prix vient de l'écran « Formules et prix ».</p>
          </div>
          <p v-if="erreurs.formules.message && !erreurs.formules.champ" id="erreur-haut-formules" role="alert" tabindex="-1" class="p-3 rounded-xl bg-red-50 text-red-800 text-xs font-semibold">{{ erreurs.formules.message }}</p>

          <fieldset :disabled="!ecriture" class="min-w-0">
            <legend class="sr-only">Textes des formules du site</legend>
            <OngletFormules v-model:textes="formules" :prix="prixBase" :erreur="erreurs.formules" />
          </fieldset>

          <div v-if="ecriture" class="pt-3 border-t border-creme2 space-y-2">
            <button type="submit" :disabled="envoi !== '' || !aChange('formules')" :class="[bouton, 'w-full sm:w-auto bg-foret text-white hover:bg-savane px-5 text-sm']">
              <Send class="w-4 h-4" aria-hidden="true" /> {{ envoi === 'formules' ? 'Publication…' : 'Publier' }}
            </button>
            <p v-if="nouvelleVersion.formules" role="status" class="text-xs text-foret font-semibold">{{ AVIS_CACHE }}</p>
            <p class="text-xs">{{ aChange('formules') ? `${changementsFormules.length} changement(s) à publier.` : 'Aucun changement par rapport au site.' }}</p>
            <p class="text-xs text-noir font-semibold">Repas et heures : des estimations, pas des promesses. Pas de promesse de santé.</p>
          </div>
        </form>

        <section class="bg-white rounded-2xl p-4 space-y-3" aria-labelledby="titre-historique-formules">
          <h2 id="titre-historique-formules" class="font-bold text-noir text-base">Historique (10 dernières publications)</h2>
          <p v-if="!versions('formules').length" class="text-xs">Aucune publication pour l'instant.</p>
          <ul v-else class="divide-y divide-creme2">
            <li v-for="v in versions('formules')" :key="v._id" class="py-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
              <p class="flex-1 min-w-0 text-noir">
                {{ dateHeure(v.publieLe) }} <span class="text-gris">par {{ v.publiePar.nom || 'un administrateur' }}</span>
                <span v-if="estEnLigne('formules', v)" class="ml-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-foret/10 text-foret">En ligne</span>
              </p>
              <div class="flex gap-2">
                <button type="button" :class="[bouton, 'bg-creme text-foret hover:bg-creme2']" :aria-label="`Voir la version du ${dateHeure(v.publieLe)}`" @click="voir('formules', v)">
                  <Eye class="w-4 h-4" aria-hidden="true" /> Voir
                </button>
                <button v-if="ecriture && !estEnLigne('formules', v)" type="button" :disabled="envoi !== ''" :class="[bouton, 'bg-creme text-foret hover:bg-creme2']" :aria-label="`Revenir à la version du ${dateHeure(v.publieLe)}`" @click="revenir('formules', v)">
                  <RotateCcw class="w-4 h-4" aria-hidden="true" /> Revenir à cette version
                </button>
              </div>
            </li>
          </ul>
        </section>
      </section>
    </template>

    <!-- Une ancienne version -->
    <div v-if="fenetre.ouverte" class="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4 font-body" @click.self="fermerFenetre" @keydown.esc="fermerFenetre">
      <div role="dialog" aria-modal="true" aria-labelledby="titre-version" class="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-2xl p-5 space-y-4 text-sm text-gris">
        <div class="flex items-start justify-between gap-2">
          <h2 id="titre-version" class="font-display font-bold text-lg text-noir">
            {{ TITRES_CONTENUS[fenetre.cle] }} du {{ fenetre.version ? dateHeure(fenetre.version.publieLe) : '' }}
          </h2>
          <button ref="boutonFermer" type="button" class="cursor-pointer w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-lg bg-creme" aria-label="Fermer" @click="fermerFenetre"><X class="w-4 h-4" aria-hidden="true" /></button>
        </div>
        <p class="text-xs">Publiée par {{ fenetre.version?.publiePar.nom || 'un administrateur' }}.</p>
        <p v-if="fenetre.chargement" role="status">Chargement de la version…</p>
        <p v-else-if="fenetre.erreur" role="alert" class="p-3 rounded-xl bg-red-50 text-red-800 text-xs font-semibold">{{ fenetre.erreur }}</p>
        <dl v-else class="divide-y divide-creme2">
          <div v-for="l in fenetre.lignes" :key="l.libelle" class="py-2">
            <dt class="text-xs font-bold text-noir">{{ l.libelle }}</dt>
            <dd class="text-noir break-words">{{ l.valeur }}</dd>
          </div>
        </dl>
        <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button type="button" class="cursor-pointer min-h-11 px-4 rounded-xl border border-creme2 font-bold" @click="fermerFenetre">Fermer</button>
          <button
            v-if="ecriture && fenetre.version && !estEnLigne(fenetre.cle, fenetre.version) && !fenetre.erreur"
            type="button" :disabled="fenetre.chargement || envoi !== ''"
            class="cursor-pointer inline-flex items-center justify-center gap-1.5 min-h-11 px-5 rounded-xl bg-foret text-white font-bold hover:bg-savane disabled:opacity-60"
            @click="revenir(fenetre.cle, fenetre.version)"
          >
            <RotateCcw class="w-4 h-4" aria-hidden="true" /> Revenir à cette version
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
