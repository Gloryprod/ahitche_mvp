<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import axios from 'axios'
import { Crown, KeyRound, ArrowRight, ChevronDown } from 'lucide-vue-next'
import { useToast } from 'vue-toastification'
import api from '@/stores/api'
import { useAuthStore } from '@/stores/auth'
import { messageErreur } from '@/services/erreurs'
import { lienWhatsApp, PAIEMENT_ANNONCE } from '@/config/contact'
import { messageAchatLibre, messageAchatLibreSecours, type InfosLivraison } from '@/services/messagesCommande'
import { MAX_LIGNES, MAX_DEMANDES, NOTE_MAX, formaterFcfa } from '@/config/vip'
import { usePanierAchatLibre } from '@/composables/usePanierAchatLibre'
import ListeProduitsVip from '@/components/vip/ListeProduitsVip.vue'
import SaisieDemandesLibres from '@/components/vip/SaisieDemandesLibres.vue'

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

// --- Code VIP : une ligne discrète, « Vous avez un code VIP ? », qui déplie le champ (focus placé dans le champ) ---
const codeOuvert = ref(false)
const champCode = ref<HTMLInputElement | null>(null)
async function basculerCode() {
  codeOuvert.value = !codeOuvert.value
  if (!codeOuvert.value) return
  await nextTick()
  champCode.value?.focus()
}
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

// --- Catalogue au prix VIP et panier (quantités, demandes libres, total : usePanierAchatLibre) ---
const panier = usePanierAchatLibre()
const { produits, produitsBase, produitsVariables, quantites, demandes, lignes, panierVide, resume } = panier
const totalIndicatif = panier.totalProduits // Demandes libres sans prix : chiffrées ensuite par Ahitché
const chargement = ref(false)
const erreurCatalogue = ref('')
// Produits du panier qui ne sont plus proposés (catalogue relu après un refus du serveur) : signalés au client
const produitsRetires = ref<string[]>([])
// Statut VIP retiré pendant la visite (réponse 403) : expliqué quand le bloc repasse au formulaire de code
const statutRetire = ref(false)
function signalerStatutRetire() {
  statutRetire.value = true
  void authStore.checkSession()
}

async function chargerCatalogue() {
  chargement.value = true
  erreurCatalogue.value = ''
  try {
    produitsRetires.value = panier.definirProduits((await api.get('/api/auth/vip/catalogue')).data.produits ?? [])
  } catch (err) {
    erreurCatalogue.value = messageErreur(err, "Les produits n'ont pas pu être chargés.")
    if (axios.isAxiosError(err) && err.response?.status === 403) signalerStatutRetire()
  } finally {
    chargement.value = false
  }
}
watch(estVip, (vip) => { if (vip) void chargerCatalogue() }, { immediate: true })

// --- Commande ---
const note = ref('')
const envoi = ref(false)
const erreurCommande = ref('')

function viderPanier() {
  panier.vider()
  note.value = ''
}

async function commander() {
  if (envoi.value) return // Double clic : une seule commande
  erreurCommande.value = ''
  produitsRetires.value = []
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
  const choisis = panier.choisis.value
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
    toast.success(`Commande ${reference} enregistrée (${formaterFcfa(totalServeur)}). Envoyez le message WhatsApp pour la finaliser.${aChiffrer ? ' Nous vous y enverrons le prix de vos demandes libres.' : ''}`)
    lien = lienWhatsApp(messageAchatLibre({ reference, total: totalServeur, demandesAChiffrer: aChiffrer }, props.livraison))
    viderPanier()
  } catch (err) {
    const statut = axios.isAxiosError(err) ? err.response?.status : undefined
    if (statut !== undefined && statut < 500) {
      // Refus du serveur (quantité, produit plus proposé, limite…) : le panier reste là pour être corrigé
      erreurCommande.value = messageErreur(err, "Votre commande n'a pas pu être enregistrée.")
      if (statut === 403) signalerStatutRetire()
      else if (statut === 400) void chargerCatalogue() // Un produit plus proposé quitte le panier, avec une note
    } else {
      // Réseau ou serveur indisponible : la commande reste possible sur WhatsApp, panier recopié
      toast.error("Votre commande n'a pas pu être enregistrée. Vous pouvez la finaliser directement sur WhatsApp.")
      lien = lienWhatsApp(messageAchatLibreSecours(choisis, corps.demandesLibres, total, props.livraison))
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
</script>

<template>
  <section id="achats-vip" aria-labelledby="titre-vip" class="bg-white rounded-2xl border border-creme2 shadow-sm">
    <!-- Statut du compte en cours de lecture -->
    <div v-if="!vipConnu" class="p-6 space-y-3 animate-pulse" aria-hidden="true">
      <div class="h-5 bg-creme2 rounded-lg w-1/3"></div>
      <div class="h-11 bg-creme2 rounded-xl w-full"></div>
    </div>

    <!-- Compte sans statut VIP : saisie d'un code -->
    <div v-else-if="!estVip" class="px-5 py-2 space-y-3">
      <p v-if="statutRetire" role="status" class="mt-2 text-xs p-3 rounded-xl bg-creme text-noir">Votre compte n'a plus le statut VIP. Pour toute question, écrivez-nous sur WhatsApp.</p>
      <h2 id="titre-vip" class="text-sm font-semibold">
        <button
          type="button" :aria-expanded="codeOuvert" aria-controls="zone-code-vip" @click="basculerCode"
          class="cursor-pointer w-full min-h-11 flex items-center gap-2 text-left text-foret"
        >
          <KeyRound class="w-4 h-4 shrink-0" aria-hidden="true" />
          <span class="flex-1">Vous avez un code VIP ?</span>
          <ChevronDown :class="['w-4 h-4 shrink-0 transition-transform', codeOuvert ? 'rotate-180' : '']" aria-hidden="true" />
        </button>
      </h2>
      <div v-if="codeOuvert" id="zone-code-vip" class="pb-3 space-y-3">
      <p class="text-xs text-gris">Avec un code VIP, vous commandez au détail, au prix VIP.</p>
      <form class="flex flex-col sm:flex-row sm:items-end gap-3" novalidate @submit.prevent="validerCode">
        <div class="flex-1">
          <label for="code-vip" class="block text-xs font-bold uppercase tracking-wider text-gris mb-1.5">Code VIP</label>
          <input
            id="code-vip" ref="champCode" v-model="code" maxlength="30" autocomplete="off" autocapitalize="characters" spellcheck="false"
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

        <fieldset v-if="produitsBase.length" class="space-y-1">
          <legend class="text-xs font-bold uppercase tracking-wider text-gris mb-1">Produits de base</legend>
          <ListeProduitsVip :produits="produitsBase" :quantites="quantites" @fixer="panier.fixer" />
        </fieldset>

        <fieldset class="space-y-1">
          <legend class="text-xs font-bold uppercase tracking-wider text-gris mb-1">Autre</legend>
          <template v-if="produitsVariables.length">
            <p class="text-xs text-gris">Produits variables :</p>
            <ListeProduitsVip :produits="produitsVariables" :quantites="quantites" @fixer="panier.fixer" />
          </template>
          <!-- Demandes libres : un produit qui n'est pas dans la liste -->
          <div class="pt-3 space-y-3">
            <div>
              <p class="text-sm font-semibold text-noir">Un produit qui n'est pas dans la liste ?</p>
              <p class="text-xs text-gris">Décrivez-le : nous vous envoyons son prix sur WhatsApp. Il n'est ajouté à votre commande qu'avec votre accord ({{ MAX_DEMANDES }} demandes au plus).</p>
              <p class="text-xs text-noir">N'indiquez ici aucune information de santé (maladie, allergie, traitement) ni de religion.</p>
            </div>
            <SaisieDemandesLibres :demandes="demandes" :ajouter="panier.ajouterDemande" :retirer="panier.retirerDemande" />
          </div>
        </fieldset>

        <label class="block text-xs font-bold uppercase tracking-wider text-gris">Note pour Ahitché (facultatif)
          <textarea v-model="note" rows="2" :maxlength="NOTE_MAX" placeholder="Ex. livrer le riz en sac de 5 kg si possible" aria-describedby="rappel-note" :class="[champ, 'resize-none']"></textarea>
        </label>
        <p id="rappel-note" class="text-xs text-noir -mt-3">N'indiquez ici aucune information de santé (maladie, allergie, traitement) ni de religion.</p>
        <p class="text-xs text-gris">Livraison à jour fixe dans nos zones de Cotonou et d'Abomey-Calavi, sans frais de livraison ni minimum de commande ; nous vous confirmons le jour sur WhatsApp. Paiement à la livraison : {{ PAIEMENT_ANNONCE }}.</p>
      </template>

      <!-- Total toujours visible en bas de l'écran pendant le choix -->
      <div class="sticky bottom-0 z-10 -mx-5 sm:-mx-6 px-5 sm:px-6 py-3 bg-white border-t border-creme2 rounded-b-2xl">
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0" aria-live="polite" aria-atomic="true">
            <template v-if="panierVide">
              <p class="text-xs text-gris">Votre panier est vide.</p>
            </template>
            <template v-else>
              <p class="text-xs text-gris">Total des produits<span class="hidden sm:inline"> · {{ resume }}</span></p>
              <p class="font-display text-xl font-bold text-foret leading-tight">{{ formaterFcfa(totalIndicatif) }}</p>
              <p v-if="demandes.length" class="text-xs text-noir leading-snug">Demandes libres en plus : prix envoyé sur WhatsApp, à accepter avant la livraison.</p>
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
        <p v-if="produitsRetires.length" role="status" class="mt-1 text-xs text-noir">Retiré de votre panier, car plus proposé : {{ produitsRetires.join(', ') }}.</p>
      </div>
    </div>
  </section>
</template>
