<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, nextTick, type ComponentPublicInstance } from 'vue'
import axios from 'axios'
import { Crown, KeyRound, Minus, Plus, Trash2, ArrowRight } from 'lucide-vue-next'
import { useToast } from 'vue-toastification'
import api from '@/stores/api'
import { useAuthStore } from '@/stores/auth'
import { messageErreur } from '@/services/erreurs'
import { lienWhatsApp, LIVRAISON_ANNONCE, PAIEMENT_ANNONCE } from '@/config/contact'
import { messageAchatLibre, messageAchatLibreSecours, type InfosLivraison } from '@/services/messagesCommande'
import { MAX_LIGNES, MAX_DEMANDES, DESIGNATION, QUANTITE_DEMANDE_MAX, NOTE_MAX, formaterFrancs, formaterQuantite } from '@/config/vip'

// Bloc VIP de l'espace client :
//  - compte sans statut VIP : saisie d'un code VIP (le serveur limite les essais et répond toujours de la même façon) ;
//  - compte VIP : achats libres au prix VIP. Produits de base, puis « Autre » (produits variables et demandes libres,
//    sans prix : Ahitché les chiffre ensuite). Le total affiché est indicatif : le serveur fixe le prix.
// La commande suit le même parcours qu'un pack : enregistrée par le serveur, puis finalisée sur WhatsApp.

const props = defineProps<{ livraison: InfosLivraison }>()
const emit = defineEmits<{ commandee: [] }>()

const authStore = useAuthStore()
const toast = useToast()

// --- Statut du compte ---
// Juste après la connexion, la session ne contient pas encore le statut VIP : elle est relue (requête partagée
// avec celle de la page)
const sessionRelue = ref(false)
const vipConnu = computed(() => authStore.user.value?.vip !== undefined || sessionRelue.value)
const estVip = computed(() => authStore.user.value?.vip?.actif === true)
onMounted(async () => {
  if (authStore.user.value?.vip === undefined) await authStore.checkSession()
  sessionRelue.value = true
})

// --- Code VIP ---
const code = ref('')
const verification = ref(false)
const erreurCode = ref('')
const bienvenue = ref('')
const titreAchats = ref<HTMLElement | null>(null)

async function validerCode() {
  const saisi = code.value.trim().toUpperCase()
  if (verification.value) return
  if (!saisi) {
    erreurCode.value = 'Saisissez votre code VIP.'
    return
  }
  verification.value = true
  erreurCode.value = ''
  try {
    const { data } = await api.post('/api/auth/vip/code', { code: saisi })
    // Bascule immédiate vers les achats libres, puis statut relu sur le serveur
    const compte = authStore.user.value
    if (compte) compte.vip = { actif: true, depuis: data.vip?.depuis ?? null, retireLe: null }
    code.value = ''
    bienvenue.value = data.message
    toast.success(data.message)
    await nextTick()
    titreAchats.value?.focus()
    void authStore.checkSession()
  } catch (err) {
    erreurCode.value = messageErreur(err, 'Vérification impossible pour le moment. Réessayez.')
    // Compte déjà VIP (code saisi dans un autre onglet) : le statut est relu, le bloc bascule
    if (axios.isAxiosError(err) && err.response?.status === 409) void authStore.checkSession()
  } finally {
    verification.value = false
  }
}

// --- Catalogue au prix VIP ---
interface ProduitVip {
  productId: string
  reference: string | null
  nom: string
  unite: string
  famille: 'P' | 'V'
  prixVip: number
  pas: number // 0,5 pour kg et L, 1 sinon
  maximum: number
}
const produits = ref<ProduitVip[]>([])
const chargement = ref(false)
const erreurCatalogue = ref('')
const quantites = reactive<Record<string, number>>({})

const sections = computed(() => [
  { cle: 'base', titre: 'Produits de base', produits: produits.value.filter(p => p.famille === 'P') },
  { cle: 'autre', titre: 'Autre', produits: produits.value.filter(p => p.famille === 'V') },
])

async function chargerCatalogue() {
  chargement.value = true
  erreurCatalogue.value = ''
  try {
    produits.value = (await api.get('/api/auth/vip/catalogue')).data.produits ?? []
    // Un produit qui n'est plus proposé quitte le panier
    for (const id of Object.keys(quantites)) if (!produits.value.some(p => p.productId === id)) delete quantites[id]
  } catch (err) {
    erreurCatalogue.value = messageErreur(err, "Les produits n'ont pas pu être chargés.")
    if (axios.isAxiosError(err) && err.response?.status === 403) void authStore.checkSession() // Statut retiré
  } finally {
    chargement.value = false
  }
}
watch(estVip, (vip) => { if (vip) void chargerCatalogue() }, { immediate: true })

// --- Quantités : multiples du pas (0,5 kg ou L ; 1 sinon), du pas au maximum ---
const quantite = (p: ProduitVip) => quantites[p.productId] ?? 0
function fixer(p: ProduitVip, valeur: number) {
  const q = !Number.isFinite(valeur) || valeur <= 0 ? 0 : Math.min(p.maximum, Math.max(p.pas, Math.round(valeur / p.pas) * p.pas))
  if (q) quantites[p.productId] = q
  else delete quantites[p.productId]
}
const ajuster = (p: ProduitVip, sens: 1 | -1) => fixer(p, quantite(p) + sens * p.pas)
function saisir(p: ProduitVip, event: Event) {
  const champ = event.target as HTMLInputElement
  const texte = champ.value.trim().replace(',', '.')
  fixer(p, texte === '' ? 0 : Number(texte))
  champ.value = quantite(p) ? formaterQuantite(quantite(p)) : '' // Valeur retenue (pas, maximum)
}

// --- Demandes libres (sans prix : chiffrées ensuite par Ahitché) ---
interface Demande { id: number; designation: string; quantite: string }
const demandes = ref<Demande[]>([])
const nouvelle = reactive({ designation: '', quantite: '' })
const erreurDemande = ref('')
// Champ placé dans la boucle des sections : référence par fonction (une référence simple y deviendrait un tableau)
let champDesignation: HTMLInputElement | null = null
const garderChampDesignation = (el: Element | ComponentPublicInstance | null) => {
  champDesignation = el instanceof HTMLInputElement ? el : null
}
let prochainId = 1
const nettoyer = (texte: string) => texte.replace(/\s+/g, ' ').trim()

function ajouterDemande() {
  const designation = nettoyer(nouvelle.designation)
  if (demandes.value.length >= MAX_DEMANDES) {
    erreurDemande.value = `${MAX_DEMANDES} demandes au plus par commande.`
    return
  }
  if (designation.length < DESIGNATION.min) {
    erreurDemande.value = 'Décrivez le produit souhaité.'
    champDesignation?.focus()
    return
  }
  demandes.value.push({ id: prochainId++, designation, quantite: nettoyer(nouvelle.quantite) })
  nouvelle.designation = ''
  nouvelle.quantite = ''
  erreurDemande.value = ''
  champDesignation?.focus()
}
const retirerDemande = (id: number) => { demandes.value = demandes.value.filter(d => d.id !== id) }

// --- Total indicatif et commande ---
const note = ref('')
const lignes = computed(() => produits.value.filter(p => quantite(p) > 0).map(p => ({ productId: p.productId, quantite: quantite(p) })))
const totalIndicatif = computed(() => Math.round(produits.value.reduce((s, p) => s + p.prixVip * quantite(p), 0)))
const panierVide = computed(() => !lignes.value.length && !demandes.value.length)
const resume = computed(() => [
  lignes.value.length ? `${lignes.value.length} produit${lignes.value.length > 1 ? 's' : ''}` : '',
  demandes.value.length ? `${demandes.value.length} demande${demandes.value.length > 1 ? 's' : ''} libre${demandes.value.length > 1 ? 's' : ''}` : '',
].filter(Boolean).join(' · '))

const envoi = ref(false)
const erreurCommande = ref('')

function viderPanier() {
  for (const id of Object.keys(quantites)) delete quantites[id]
  demandes.value = []
  note.value = ''
  nouvelle.designation = ''
  nouvelle.quantite = ''
}

async function commander() {
  if (envoi.value) return // Double clic : une seule commande
  erreurCommande.value = ''
  if (panierVide.value) {
    erreurCommande.value = 'Choisissez au moins un produit ou ajoutez une demande.'
    return
  }
  if (lignes.value.length > MAX_LIGNES) {
    erreurCommande.value = `${MAX_LIGNES} produits au plus par commande.`
    return
  }
  const corps = {
    lignes: lignes.value,
    demandesLibres: demandes.value.map(({ designation, quantite }) => ({ designation, quantite })),
    notes: note.value.trim(),
  }
  // Copie du panier pour le message de secours (le panier est vidé après l'enregistrement)
  const panier = produits.value.filter(p => quantite(p) > 0).map(p => ({ nom: p.nom, quantite: quantite(p), unite: p.unite }))
  const total = totalIndicatif.value

  // Onglet WhatsApp ouvert pendant le clic : ouvert après l'appel au serveur, il serait bloqué sur téléphone
  const fenetre = window.open('', '_blank')
  if (fenetre) fenetre.opener = null

  envoi.value = true
  let lien = ''
  try {
    const { data } = await api.post('/api/auth/vip/commande', corps)
    const { reference, total: totalServeur } = data.commande
    const aChiffrer = corps.demandesLibres.length
    toast.success(`Commande ${reference} enregistrée. ${aChiffrer ? 'Nous vous confirmons le prix de vos demandes libres sur WhatsApp.' : 'Finalisez-la sur WhatsApp.'}`)
    lien = lienWhatsApp(messageAchatLibre({ reference, total: totalServeur, demandesAChiffrer: aChiffrer }, props.livraison))
    viderPanier()
  } catch (err) {
    const statut = axios.isAxiosError(err) ? err.response?.status : undefined
    if (statut !== undefined && statut < 500) {
      // Refus du serveur (quantité, produit plus proposé, limite…) : le panier reste là pour être corrigé
      erreurCommande.value = messageErreur(err, "Votre commande n'a pas pu être enregistrée.")
      if (statut === 403) void authStore.checkSession()
      else if (statut === 400) void chargerCatalogue()
    } else {
      // Réseau ou serveur indisponible : la commande reste possible sur WhatsApp, panier recopié
      toast.error("Votre commande n'a pas pu être enregistrée. Vous pouvez la finaliser directement sur WhatsApp.")
      lien = lienWhatsApp(messageAchatLibreSecours(panier, corps.demandesLibres, total, props.livraison))
    }
  } finally {
    envoi.value = false
  }

  if (!lien) {
    fenetre?.close()
    return
  }
  if (fenetre) fenetre.location.href = lien
  else window.location.href = lien // Fenêtre refusée : on bascule dans l'onglet courant
  emit('commandee')
}

const champ = 'mt-1 w-full min-h-11 px-4 py-2.5 border border-creme2 rounded-xl text-sm font-normal normal-case tracking-normal text-noir bg-white'
const boutonQuantite = 'cursor-pointer w-11 h-11 inline-flex items-center justify-center rounded-xl border border-creme2 text-foret hover:bg-creme disabled:opacity-40 disabled:cursor-default'
</script>

<template>
  <section id="achats-vip" aria-labelledby="titre-vip" class="bg-white rounded-2xl border border-creme2 shadow-sm">
    <!-- Statut du compte en cours de lecture -->
    <div v-if="!vipConnu" class="p-6 space-y-3 animate-pulse" aria-hidden="true">
      <div class="h-5 bg-creme2 rounded-lg w-1/3"></div>
      <div class="h-11 bg-creme2 rounded-xl w-full"></div>
    </div>

    <!-- Compte sans statut VIP : saisie d'un code -->
    <div v-else-if="!estVip" class="p-6 space-y-4">
      <div class="flex items-center gap-3">
        <div class="p-2 bg-creme rounded-xl border border-creme2"><KeyRound class="w-5 h-5 text-foret" aria-hidden="true" /></div>
        <div>
          <h2 id="titre-vip" class="font-display font-bold text-xl">Code VIP</h2>
          <p class="text-xs text-gris">Vous avez reçu un code ? Commandez au détail, au prix VIP.</p>
        </div>
      </div>
      <form class="flex flex-col sm:flex-row sm:items-end gap-3" novalidate @submit.prevent="validerCode">
        <div class="flex-1">
          <label for="code-vip" class="block text-xs font-bold uppercase tracking-wider text-gris mb-1.5">Code VIP</label>
          <input
            id="code-vip" v-model="code" maxlength="30" autocomplete="off" autocapitalize="characters" spellcheck="false"
            placeholder="Ex. AHI-VIP-7K2Q4M" :aria-invalid="!!erreurCode" :aria-describedby="erreurCode ? 'message-code' : undefined"
            class="w-full min-h-11 px-4 py-2.5 border border-creme2 rounded-xl text-sm font-mono uppercase text-noir placeholder:normal-case placeholder:font-body"
          />
        </div>
        <button type="submit" :disabled="verification" class="cursor-pointer min-h-11 px-6 rounded-xl bg-foret text-white text-sm font-bold hover:bg-savane disabled:opacity-60">
          {{ verification ? 'Vérification…' : 'Valider' }}
        </button>
      </form>
      <p v-if="erreurCode" id="message-code" role="alert" class="text-xs font-semibold text-red-700">{{ erreurCode }}</p>
    </div>

    <!-- Compte VIP : achats libres -->
    <div v-else class="px-5 pt-5 sm:px-6 sm:pt-6 space-y-5">
      <div class="flex items-center gap-3">
        <div class="p-2 bg-or/20 rounded-xl"><Crown class="w-5 h-5 text-noir" aria-hidden="true" /></div>
        <div>
          <h2 id="titre-vip" ref="titreAchats" tabindex="-1" class="font-display font-bold text-xl outline-none">Achats libres VIP</h2>
          <p class="text-xs text-gris">Commandez au détail, au prix VIP.</p>
        </div>
      </div>
      <p v-if="bienvenue" class="text-xs p-3 rounded-xl bg-or/15 text-noir">{{ bienvenue }}</p>

      <div v-if="chargement && !produits.length" class="space-y-2 animate-pulse" aria-hidden="true">
        <div v-for="n in 4" :key="n" class="h-12 bg-creme2 rounded-xl"></div>
      </div>
      <div v-else-if="erreurCatalogue && !produits.length" class="p-4 rounded-xl bg-creme text-sm space-y-3">
        <p class="text-noir" role="alert">{{ erreurCatalogue }}</p>
        <button type="button" class="cursor-pointer min-h-11 px-4 rounded-xl border border-creme2 bg-white font-semibold text-foret" @click="chargerCatalogue">Réessayer</button>
      </div>

      <template v-else>
        <p v-if="!produits.length" class="text-sm text-gris p-4 rounded-xl border border-dashed border-creme2">
          Aucun produit n'est proposé au prix VIP pour le moment. Vous pouvez quand même faire une demande libre ci-dessous.
        </p>

        <fieldset v-for="section in sections" :key="section.cle" class="space-y-1">
          <legend class="text-xs font-bold uppercase tracking-wider text-gris mb-1">{{ section.titre }}</legend>
          <p v-if="section.cle === 'autre' && section.produits.length" class="text-xs text-gris">Produits variables :</p>
          <!-- Une colonne sur téléphone, deux sur grand écran -->
          <ul v-if="section.produits.length" class="grid grid-cols-1 lg:grid-cols-2 lg:gap-x-10">
            <li v-for="p in section.produits" :key="p.productId" class="flex items-center justify-between gap-3 py-2 border-b border-creme2">
              <div class="min-w-0">
                <p class="text-sm font-semibold text-noir leading-snug">{{ p.nom }}</p>
                <p class="text-xs text-gris">{{ formaterFrancs(p.prixVip) }} / {{ p.unite }}</p>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <button type="button" :class="boutonQuantite" :disabled="!quantite(p)" :aria-label="`${p.nom} : diminuer la quantité`" @click="ajuster(p, -1)">
                  <Minus class="w-4 h-4" aria-hidden="true" />
                </button>
                <input
                  type="text" inputmode="decimal" autocomplete="off" placeholder="0"
                  :value="quantite(p) ? formaterQuantite(quantite(p)) : ''"
                  :aria-label="`Quantité de ${p.nom}, en ${p.unite}`"
                  :class="['w-12 h-11 rounded-xl border text-center text-sm font-bold', quantite(p) ? 'border-foret text-foret bg-foret/5' : 'border-creme2 text-noir']"
                  @change="saisir(p, $event)"
                  @keydown.enter.prevent="saisir(p, $event)"
                />
                <button type="button" :class="boutonQuantite" :disabled="quantite(p) >= p.maximum" :aria-label="`${p.nom} : augmenter la quantité`" @click="ajuster(p, 1)">
                  <Plus class="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          </ul>

          <!-- Demandes libres : un produit qui n'est pas dans la liste -->
          <div v-if="section.cle === 'autre'" class="pt-3 space-y-3">
            <div>
              <p class="text-sm font-semibold text-noir">Un produit qui n'est pas dans la liste ?</p>
              <p class="text-xs text-gris">Décrivez-le : nous vous confirmons son prix sur WhatsApp ({{ MAX_DEMANDES }} demandes au plus).</p>
            </div>
            <ul v-if="demandes.length" class="space-y-2" aria-label="Vos demandes libres">
              <li v-for="d in demandes" :key="d.id" class="flex items-center justify-between gap-2 pl-3 rounded-xl bg-creme">
                <span class="min-w-0 py-2 text-sm text-noir break-words">{{ d.designation }}<span v-if="d.quantite" class="text-gris"> · {{ d.quantite }}</span></span>
                <button type="button" class="cursor-pointer shrink-0 w-11 h-11 inline-flex items-center justify-center rounded-xl text-red-700 hover:bg-red-50" :aria-label="`Retirer la demande : ${d.designation}`" @click="retirerDemande(d.id)">
                  <Trash2 class="w-4 h-4" aria-hidden="true" />
                </button>
              </li>
            </ul>
            <div v-if="demandes.length < MAX_DEMANDES" class="grid grid-cols-1 sm:grid-cols-[1fr_9rem_auto] gap-2 sm:items-end">
              <label class="block text-xs font-bold uppercase tracking-wider text-gris">Produit souhaité
                <input :ref="garderChampDesignation" v-model="nouvelle.designation" :maxlength="DESIGNATION.max" placeholder="Ex. Poisson fumé" :class="champ" @keydown.enter.prevent="ajouterDemande" />
              </label>
              <label class="block text-xs font-bold uppercase tracking-wider text-gris">Quantité
                <input v-model="nouvelle.quantite" :maxlength="QUANTITE_DEMANDE_MAX" placeholder="Ex. 2 tas" :class="champ" @keydown.enter.prevent="ajouterDemande" />
              </label>
              <button type="button" class="cursor-pointer min-h-11 px-4 rounded-xl border border-foret/30 text-foret text-sm font-bold hover:bg-foret/5" @click="ajouterDemande">Ajouter</button>
            </div>
            <p v-if="erreurDemande" role="alert" class="text-xs font-semibold text-red-700">{{ erreurDemande }}</p>
          </div>
        </fieldset>

        <label class="block text-xs font-bold uppercase tracking-wider text-gris">Note pour Ahitché (facultatif)
          <textarea v-model="note" rows="2" :maxlength="NOTE_MAX" placeholder="Ex. livrer le riz en sac de 5 kg si possible" :class="[champ, 'resize-none']"></textarea>
        </label>
        <p class="text-xs text-gris">{{ LIVRAISON_ANNONCE }}, sans frais ni minimum de commande. Paiement à la livraison : {{ PAIEMENT_ANNONCE }}.</p>
      </template>

      <!-- Total toujours visible en bas de l'écran pendant le choix -->
      <div class="sticky bottom-0 z-10 -mx-5 sm:-mx-6 px-5 sm:px-6 py-3 bg-white border-t border-creme2 rounded-b-2xl">
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0" aria-live="polite" aria-atomic="true">
            <template v-if="panierVide">
              <p class="text-xs text-gris">Votre panier est vide.</p>
            </template>
            <template v-else>
              <p class="text-xs text-gris">Total indicatif<span class="hidden sm:inline"> · {{ resume }}</span></p>
              <p class="font-display text-xl font-bold text-foret leading-tight">{{ formaterFrancs(totalIndicatif) }}</p>
              <p v-if="demandes.length" class="text-[11px] text-gris leading-snug">+ demandes libres : le prix final est confirmé par Ahitché.</p>
            </template>
          </div>
          <button
            type="button" :disabled="panierVide || envoi"
            class="cursor-pointer shrink-0 inline-flex items-center gap-2 min-h-11 px-5 rounded-xl bg-foret text-white text-sm font-bold hover:bg-savane disabled:opacity-50 disabled:cursor-default"
            @click="commander"
          >
            {{ envoi ? 'Envoi…' : 'Commander' }}
            <ArrowRight class="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <p v-if="erreurCommande" role="alert" class="mt-2 text-xs font-semibold text-red-700">{{ erreurCommande }}</p>
      </div>
    </div>
  </section>
</template>
