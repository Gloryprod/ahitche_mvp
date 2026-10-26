<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import axios from 'axios'
import { X, Search } from 'lucide-vue-next'
import api from '@/stores/api'
import { messageErreur } from '@/services/erreurs'
import { useAuthStore } from '@/stores/auth'
import { peutEcrire, peutLire } from '@/config/roles'
import { MODES_PAIEMENT } from '@/config/commandes'
import { MAX_LIGNES, NOTE_MAX, formaterFrancs } from '@/config/vip'
import { usePanierAchatLibre } from '@/composables/usePanierAchatLibre'
import ListeProduitsVip from '@/components/vip/ListeProduitsVip.vue'
import SaisieDemandesLibres from '@/components/vip/SaisieDemandesLibres.vue'

// Achat libre VIP saisi par l'équipe au nom d'un client VIP (cahier, partie C) : admin et gestionnaires (écriture des
// Commandes). Mêmes produits, pas et maximums que l'espace client (panier partagé : usePanierAchatLibre) ; le serveur
// fixe les prix VIP et le total. Seul l'admin peut fixer le prix d'une demande libre dès la saisie : pour un
// gestionnaire, les demandes restent « à chiffrer » (le serveur refuse un prix envoyé par un autre rôle).

interface ClientVip { _id: string; nom: string; telephone: string; quartier: string; zone: string | null; zoneNom: string }

const emit = defineEmits<{ fermer: []; cree: [message: string] }>()

const auth = useAuthStore()
const chiffrer = computed(() => peutEcrire(auth.role.value, 'vip'))
const voirCodesVip = computed(() => peutLire(auth.role.value, 'vip'))

const panier = usePanierAchatLibre()
const { produitsBase, produitsVariables, quantites, demandes, lignes, panierVide, aChiffrer } = panier
const total = computed(() => panier.totalProduits.value + panier.totalDemandes.value)

// --- Chargement : clients VIP (périmètre du gestionnaire livreur compris) et catalogue au prix VIP ---
const clients = ref<ClientVip[]>([])
const chargement = ref(true)
const erreurChargement = ref('')

async function charger() {
  chargement.value = true
  erreurChargement.value = ''
  try {
    const [reponseClients, reponseCatalogue] = await Promise.all([
      api.get('/api/admin/commandes/achat-libre/clients'),
      api.get('/api/admin/commandes/achat-libre/catalogue'),
    ])
    clients.value = reponseClients.data.clients ?? []
    panier.definirProduits(reponseCatalogue.data.produits ?? [])
  } catch (err) {
    erreurChargement.value = messageErreur(err, "Le formulaire n'a pas pu être chargé.")
  } finally {
    chargement.value = false
  }
}

// --- Client : recherche par nom (sans tenir compte des accents) ou par téléphone ---
const recherche = ref('')
const clientId = ref('')
const boutonChanger = ref<HTMLButtonElement | null>(null)
const sansAccent = (texte: string) => texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const clientsFiltres = computed(() => {
  const mots = sansAccent(recherche.value.trim())
  const chiffres = recherche.value.replace(/\D/g, '')
  if (!mots) return clients.value
  return clients.value.filter(c => sansAccent(c.nom).includes(mots) || (!!chiffres && c.telephone.replace(/\D/g, '').includes(chiffres)))
})
const clientChoisi = computed(() => clients.value.find(c => c._id === clientId.value))
// Client choisi : la liste se replie, le focus passe sur « Changer »
watch(clientId, async (id) => {
  if (!id) return
  await nextTick()
  boutonChanger.value?.focus()
})

// --- Enregistrement ---
const note = ref('')
const modePaiement = ref<string>(MODES_PAIEMENT[0])
const envoi = ref(false)
const erreur = ref('')

async function enregistrer() {
  if (envoi.value) return // Double clic : une seule commande
  erreur.value = ''
  if (!clientChoisi.value) {
    erreur.value = 'Choisissez le client VIP.'
    return
  }
  if (panierVide.value) {
    erreur.value = 'Choisissez au moins un produit ou ajoutez une demande libre.'
    return
  }
  if (lignes.value.length > MAX_LIGNES) {
    erreur.value = `${MAX_LIGNES} produits au plus par commande.`
    return
  }
  envoi.value = true
  try {
    const { data } = await api.post('/api/admin/commandes/achat-libre', {
      client: clientId.value,
      lignes: lignes.value,
      // Prix d'une demande : seulement s'il a été saisi par l'admin ; sinon elle reste « à chiffrer »
      demandesLibres: demandes.value.map(d => ({
        designation: d.designation, quantite: d.quantite, ...(chiffrer.value && d.prix !== null ? { prix: d.prix } : {}),
      })),
      notes: note.value.trim(),
      modePaiement: modePaiement.value,
    })
    emit('cree', data.message)
  } catch (err) {
    // Refus du serveur (client plus VIP, produit plus proposé, quantité…) : affiché tel quel, la saisie est gardée
    erreur.value = messageErreur(err, "L'achat libre n'a pas pu être enregistré.")
    if (axios.isAxiosError(err) && err.response?.status === 400) {
      const reponse = await api.get('/api/admin/commandes/achat-libre/catalogue').catch(() => null)
      if (reponse) panier.definirProduits(reponse.data.produits ?? [])
    }
  } finally {
    envoi.value = false
  }
}

// --- Fenêtre : focus à l'ouverture, rendu au bouton d'origine à la fermeture ---
const champRecherche = ref<HTMLInputElement | null>(null)
const boutonFermer = ref<HTMLButtonElement | null>(null)
let declencheur: HTMLElement | null = null
onMounted(async () => {
  declencheur = document.activeElement instanceof HTMLElement ? document.activeElement : null
  await charger()
  await nextTick()
  ;(champRecherche.value ?? boutonFermer.value)?.focus()
})
onBeforeUnmount(() => declencheur?.focus())
const fermer = () => { if (!envoi.value) emit('fermer') }

const champ = 'mt-1 w-full min-h-11 px-3 py-2 rounded-xl border border-creme2 bg-creme text-sm text-noir font-normal normal-case tracking-normal'
const legende = 'text-xs font-bold uppercase tracking-wider text-gris mb-1'
</script>

<template>
  <div class="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4 font-body" @click.self="fermer" @keydown.esc="fermer">
    <div role="dialog" aria-modal="true" aria-labelledby="titre-saisie-vip" class="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl text-sm text-gris">
      <div class="p-5 space-y-5">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 id="titre-saisie-vip" class="font-display font-bold text-lg text-noir flex flex-wrap items-center gap-2">
              Achat libre <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-or text-noir font-body">VIP</span>
            </h2>
            <p class="text-xs mt-0.5">Saisie au nom d'un client VIP. Les prix VIP et le total sont fixés par le serveur.</p>
          </div>
          <button ref="boutonFermer" type="button" class="cursor-pointer p-2.5 rounded-lg bg-creme shrink-0" aria-label="Fermer la saisie" @click="fermer"><X class="w-4 h-4" aria-hidden="true" /></button>
        </div>

        <div v-if="chargement" class="space-y-2 animate-pulse" aria-hidden="true">
          <div v-for="n in 4" :key="n" class="h-12 bg-creme2 rounded-xl"></div>
        </div>
        <div v-else-if="erreurChargement" class="p-4 rounded-xl bg-creme space-y-3">
          <p role="alert" class="text-noir">{{ erreurChargement }}</p>
          <button type="button" class="cursor-pointer min-h-11 px-4 rounded-xl border border-creme2 bg-white font-semibold text-foret" @click="charger">Réessayer</button>
        </div>

        <!-- Aucun client VIP : l'achat libre leur est réservé -->
        <div v-else-if="!clients.length" role="status" class="p-4 rounded-xl bg-creme text-noir space-y-2">
          <p class="font-bold">Aucun client VIP pour le moment.</p>
          <p class="text-xs text-gris">L'achat libre est réservé aux clients VIP : un client le devient en saisissant un code VIP dans son espace. Pour les autres, saisissez un pack.</p>
          <RouterLink v-if="voirCodesVip" to="/dashboard/admin/vip" class="inline-flex items-center min-h-11 px-4 rounded-xl bg-foret text-white text-xs font-bold hover:bg-savane">Créer un code VIP</RouterLink>
        </div>

        <template v-else>
          <!-- Client VIP -->
          <fieldset class="space-y-2">
            <legend :class="legende">Client VIP *</legend>
            <div v-if="clientChoisi" class="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-foret bg-foret/5">
              <div class="min-w-0">
                <p class="font-bold text-noir">{{ clientChoisi.nom }}</p>
                <p class="text-xs">
                  {{ clientChoisi.telephone || 'Téléphone non renseigné' }}<template v-if="clientChoisi.quartier"> · {{ clientChoisi.quartier }}</template><template v-if="clientChoisi.zoneNom"> ({{ clientChoisi.zoneNom }})</template>
                </p>
              </div>
              <button ref="boutonChanger" type="button" class="cursor-pointer min-h-11 px-4 rounded-xl border border-creme2 bg-white text-xs font-bold text-foret" @click="clientId = ''">Changer</button>
            </div>
            <template v-else>
              <label class="relative block">
                <span class="sr-only">Rechercher un client VIP par nom ou téléphone</span>
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gris" aria-hidden="true" />
                <input ref="champRecherche" v-model="recherche" type="search" autocomplete="off" placeholder="Nom ou téléphone" class="w-full min-h-11 pl-9 pr-3 rounded-xl border border-creme2 bg-creme text-sm text-noir" />
              </label>
              <ul class="max-h-56 overflow-y-auto rounded-xl border border-creme2 divide-y divide-creme2" aria-label="Clients VIP">
                <li v-for="c in clientsFiltres" :key="c._id">
                  <label class="flex items-center gap-3 px-3 min-h-12 py-1.5 cursor-pointer hover:bg-creme">
                    <input v-model="clientId" type="radio" name="client-vip" :value="c._id" class="w-4 h-4 accent-foret shrink-0" />
                    <span class="min-w-0">
                      <span class="block font-semibold text-noir">{{ c.nom }}</span>
                      <span class="block text-xs">{{ c.telephone || 'Téléphone non renseigné' }}<template v-if="c.quartier"> · {{ c.quartier }}</template></span>
                    </span>
                  </label>
                </li>
                <li v-if="!clientsFiltres.length" class="px-3 py-3 text-xs">Aucun client VIP ne correspond à « {{ recherche }} ».</li>
              </ul>
            </template>
          </fieldset>

          <p v-if="!produitsBase.length && !produitsVariables.length" class="text-xs p-3 rounded-xl border border-dashed border-creme2">
            Aucun produit n'a de prix VIP pour le moment : seules des demandes libres sont possibles.
          </p>
          <fieldset v-if="produitsBase.length">
            <legend :class="legende">Produits de base</legend>
            <ListeProduitsVip :produits="produitsBase" :quantites="quantites" @fixer="panier.fixer" />
          </fieldset>
          <fieldset class="space-y-2">
            <legend :class="legende">Autre</legend>
            <template v-if="produitsVariables.length">
              <p class="text-xs">Produits variables :</p>
              <ListeProduitsVip :produits="produitsVariables" :quantites="quantites" @fixer="panier.fixer" />
            </template>
            <div class="pt-2 space-y-2">
              <p class="text-sm font-semibold text-noir">Demandes libres (produits hors catalogue)</p>
              <p class="text-xs">{{ chiffrer ? 'Prix facultatif : laissé vide, la demande reste « à chiffrer ».' : 'Le prix des demandes libres est fixé ensuite par l\'admin : elles restent « à chiffrer ».' }}</p>
              <SaisieDemandesLibres :demandes="demandes" :ajouter="panier.ajouterDemande" :retirer="panier.retirerDemande" :avec-prix="chiffrer" afficher-etat />
            </div>
          </fieldset>

          <label class="block text-xs font-bold uppercase tracking-wider text-gris">Note (facultatif)
            <textarea v-model="note" rows="2" :maxlength="NOTE_MAX" placeholder="Ex. livrer avant midi" :class="[champ, 'resize-none']"></textarea>
          </label>

          <fieldset>
            <legend :class="legende">Paiement à la livraison</legend>
            <div class="flex flex-wrap gap-2">
              <label v-for="m in MODES_PAIEMENT" :key="m" class="inline-flex items-center gap-2 min-h-11 px-4 rounded-xl border cursor-pointer text-sm font-semibold" :class="modePaiement === m ? 'border-foret text-foret bg-foret/5' : 'border-creme2 text-gris'">
                <input v-model="modePaiement" type="radio" name="paiement-saisie-vip" :value="m" class="w-4 h-4 accent-foret" /> {{ m }}
              </label>
            </div>
          </fieldset>
        </template>
      </div>

      <!-- Total et envoi, toujours visibles en bas de la fenêtre -->
      <div v-if="!chargement && !erreurChargement && clients.length" class="sticky bottom-0 bg-white border-t border-creme2 px-5 py-3 rounded-b-2xl">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="min-w-0" aria-live="polite" aria-atomic="true">
            <p class="text-xs">Total<template v-if="clientChoisi"> · {{ clientChoisi.nom }}</template></p>
            <p class="font-display text-xl font-bold text-foret leading-tight">{{ formaterFrancs(total) }}</p>
            <p v-if="aChiffrer" class="text-[11px] leading-snug">+ {{ aChiffrer }} demande{{ aChiffrer > 1 ? 's' : '' }} libre{{ aChiffrer > 1 ? 's' : '' }} à chiffrer</p>
          </div>
          <div class="flex gap-2">
            <button type="button" class="cursor-pointer min-h-11 px-4 rounded-xl border border-creme2 font-bold" @click="fermer">Annuler</button>
            <button type="button" :disabled="envoi" class="cursor-pointer min-h-11 px-5 rounded-xl bg-foret text-white font-bold hover:bg-savane disabled:opacity-60" @click="enregistrer">
              {{ envoi ? 'Enregistrement…' : 'Enregistrer' }}
            </button>
          </div>
        </div>
        <p v-if="erreur" role="alert" class="mt-2 p-2.5 rounded-xl bg-red-50 text-red-800 text-xs font-semibold">{{ erreur }}</p>
      </div>
    </div>
  </div>
</template>
