<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { X } from 'lucide-vue-next'
import api from '@/stores/api'
import { messageErreur } from '@/services/erreurs'
import { useAuthStore } from '@/stores/auth'
import { peutEcrire } from '@/config/roles'
import { classeStatut } from '@/config/commandes'
import {
  MOTIF_RETRAIT, STATUTS_CHIFFRABLES, etatDemande, formaterFrancs, quantiteEtUnite, type DemandeLibre,
} from '@/config/vip'
import type { Commande } from '@/type'

// Détail d'un achat libre VIP (écran Commandes) : lignes au prix VIP et demandes libres. L'admin chiffre chaque demande
// (prix en FCFA) ou la retire avec un motif ; le serveur recalcule le total et journalise. Jamais le formulaire d'un pack.
// Les autres rôles voient le détail sans pouvoir le modifier.

const props = defineProps<{ commande: Commande }>()
const emit = defineEmits<{ fermer: []; modifiee: [message: string] }>()

const auth = useAuthStore()
const peutChiffrer = computed(() => peutEcrire(auth.role.value, 'vip'))
// Chiffrage possible avant le départ en livraison, tant que la commande n'est ni payée ni archivée (règle du serveur)
const chiffrable = computed(() =>
  STATUTS_CHIFFRABLES.includes(props.commande.statut) && props.commande.paiement?.statut !== 'Payé' && !props.commande.deletedAt
)
const modifiable = computed(() => peutChiffrer.value && chiffrable.value)

const lignes = computed(() => props.commande.productsSnapshot ?? [])
const sousTotal = computed(() => Math.round(lignes.value.reduce((s, l) => s + (l.totalPrice ?? 0), 0)))

// Copie locale, mise à jour par la réponse du serveur après chaque enregistrement
const total = ref(props.commande.total)
const demandes = ref<DemandeLibre[]>((props.commande.demandesLibres ?? []).map(d => ({ ...d })))

interface Brouillon { mode: 'prix' | 'retrait'; prix: number | ''; motif: string }
const brouillons = reactive<Record<string, Brouillon>>({})
function initialiserBrouillons() {
  for (const d of demandes.value) {
    brouillons[d._id] = { mode: d.retiree ? 'retrait' : 'prix', prix: d.prix ?? '', motif: d.motif ?? '' }
  }
}
initialiserBrouillons()

type Decision = { _id: string; prix: number } | { _id: string; retiree: true; motif: string }
// Demandes modifiées par rapport au serveur (une demande sans prix saisi reste à chiffrer)
const decisions = computed<Decision[]>(() => demandes.value.flatMap((d): Decision[] => {
  const b = brouillons[d._id]
  if (!b) return []
  if (b.mode === 'retrait') {
    const motif = b.motif.trim()
    return !d.retiree || (d.motif ?? '') !== motif ? [{ _id: d._id, retiree: true, motif }] : []
  }
  if (b.prix === '') return []
  const prix = Number(b.prix)
  return d.retiree || d.prix !== prix ? [{ _id: d._id, prix }] : []
}))

// Aperçu du total après enregistrement (le serveur fait foi) : produits + demandes chiffrées et gardées
const totalApercu = computed(() => sousTotal.value + demandes.value.reduce((s, d) => {
  const b = brouillons[d._id]
  if (!b || b.mode === 'retrait' || b.prix === '' || !Number.isFinite(Number(b.prix))) return s
  return s + Math.round(Number(b.prix))
}, 0))

const LIBELLES_ETAT = { 'chiffree': 'Chiffrée', 'a-chiffrer': 'À chiffrer', 'retiree': 'Retirée' } as const
const CLASSES_ETAT = {
  'chiffree': 'bg-foret/10 text-foret',
  'a-chiffrer': 'bg-white border border-or-deep text-noir',
  'retiree': 'bg-creme2 text-gris',
} as const

const enregistrement = ref(false)
const erreur = ref('')
const message = ref('')

async function enregistrer() {
  erreur.value = ''
  message.value = ''
  if (!decisions.value.length) {
    message.value = 'Aucune modification.'
    return
  }
  // Mêmes contrôles que le serveur, pour un message immédiat
  for (const decision of decisions.value) {
    const nom = demandes.value.find(d => d._id === decision._id)?.designation ?? ''
    if ('retiree' in decision) {
      if (decision.motif.length < MOTIF_RETRAIT.min || decision.motif.length > MOTIF_RETRAIT.max) {
        erreur.value = `Indiquez le motif du retrait de « ${nom} » (${MOTIF_RETRAIT.min} à ${MOTIF_RETRAIT.max} caractères).`
        return
      }
    } else if (!(Number.isFinite(decision.prix) && decision.prix >= 0)) {
      erreur.value = `Indiquez le prix de « ${nom} » en FCFA (0 ou plus).`
      return
    }
  }
  enregistrement.value = true
  try {
    const { data } = await api.patch(`/api/admin/orders/${props.commande.id}/demandes`, { demandes: decisions.value })
    total.value = data.order.total
    demandes.value = data.order.demandesLibres
    initialiserBrouillons()
    message.value = data.message
    emit('modifiee', data.message)
  } catch (err) {
    erreur.value = messageErreur(err, 'Enregistrement impossible.')
  } finally {
    enregistrement.value = false
  }
}

// Fenêtre : focus sur le bouton Fermer à l'ouverture, rendu au bouton d'origine à la fermeture
const boutonFermer = ref<HTMLButtonElement | null>(null)
let declencheur: HTMLElement | null = null
onMounted(async () => {
  declencheur = document.activeElement instanceof HTMLElement ? document.activeElement : null
  await nextTick()
  boutonFermer.value?.focus()
})
onBeforeUnmount(() => declencheur?.focus())
const fermer = () => { if (!enregistrement.value) emit('fermer') }

const champ = 'mt-1 w-full min-h-11 px-3 py-2 rounded-xl border border-creme2 bg-creme text-sm text-noir font-normal'
</script>

<template>
  <div class="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4 font-body" @click.self="fermer" @keydown.esc="fermer">
    <div role="dialog" aria-modal="true" aria-labelledby="titre-achat-libre" class="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl p-5 space-y-5 text-sm text-gris">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 id="titre-achat-libre" class="font-display font-bold text-lg text-noir flex flex-wrap items-center gap-2">
            Achat libre <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-or text-noir font-body">VIP</span>
          </h2>
          <p class="text-xs mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="font-bold text-noir">{{ commande.reference }}</span>
            <span>{{ commande.date }}</span>
            <span :class="[classeStatut(commande.statut), 'px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap']">{{ commande.statut }}</span>
          </p>
        </div>
        <button ref="boutonFermer" type="button" @click="fermer" class="cursor-pointer p-2.5 rounded-lg bg-creme shrink-0" aria-label="Fermer le détail"><X class="w-4 h-4" aria-hidden="true" /></button>
      </div>

      <dl class="grid grid-cols-2 gap-3 text-xs">
        <div><dt>Client</dt><dd class="text-noir font-bold">{{ commande.clientName }}</dd></div>
        <div><dt>WhatsApp</dt><dd class="text-noir">{{ commande.whatsapp || '—' }}</dd></div>
        <div><dt>Paiement à la livraison</dt><dd class="text-noir">{{ commande.modePaiement }}<template v-if="commande.paiement?.statut"> · {{ commande.paiement.statut }}</template></dd></div>
        <div v-if="commande.notes" class="col-span-2"><dt>Note du client</dt><dd class="text-noir">{{ commande.notes }}</dd></div>
      </dl>

      <!-- Produits du catalogue, au prix VIP -->
      <section class="space-y-2" aria-labelledby="titre-lignes">
        <h3 id="titre-lignes" class="font-bold text-noir">Produits au prix VIP ({{ lignes.length }})</h3>
        <p v-if="!lignes.length" class="text-xs">Aucun produit du catalogue : seulement des demandes libres.</p>
        <template v-else>
          <ul class="divide-y divide-creme2 border-y border-creme2">
            <li v-for="l in lignes" :key="l.productId" class="py-2 flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="font-semibold text-noir">{{ l.name }}<span v-if="l.isExtra" class="ml-1.5 px-1.5 py-0.5 rounded bg-creme2 text-[10px] font-bold text-gris align-middle">Variable</span></p>
                <p class="text-xs">{{ quantiteEtUnite(l.quantity, l.unit) }} × {{ formaterFrancs(l.unitPrice ?? 0) }}</p>
              </div>
              <p class="font-bold text-noir whitespace-nowrap tabular-nums">{{ formaterFrancs(l.totalPrice ?? 0) }}</p>
            </li>
          </ul>
          <p class="text-right text-xs">Sous-total des produits (arrondi au franc) : <strong class="text-noir">{{ formaterFrancs(sousTotal) }}</strong></p>
        </template>
      </section>

      <!-- Demandes libres : chiffrage ou retrait -->
      <section v-if="demandes.length" class="space-y-2" aria-labelledby="titre-demandes">
        <h3 id="titre-demandes" class="font-bold text-noir">Demandes libres ({{ demandes.length }})</h3>
        <p class="text-xs">Produits hors catalogue, sans prix pour le client. La commande ne peut pas être confirmée tant qu'une demande n'est ni chiffrée ni retirée.</p>
        <ul class="space-y-2">
          <li v-for="d in demandes" :key="d._id" class="rounded-xl border border-creme2 p-3 space-y-2">
            <div class="flex items-start justify-between gap-2">
              <p class="text-noir font-semibold min-w-0 break-words">{{ d.designation }}<span v-if="d.quantite" class="font-normal text-gris"> · {{ d.quantite }}</span></p>
              <span :class="[CLASSES_ETAT[etatDemande(d)], 'shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap']">
                {{ LIBELLES_ETAT[etatDemande(d)] }}<template v-if="etatDemande(d) === 'chiffree'"> · {{ formaterFrancs(d.prix ?? 0) }}</template>
              </span>
            </div>
            <p v-if="d.retiree && d.motif" class="text-xs">Motif : {{ d.motif }}</p>

            <fieldset v-if="modifiable && brouillons[d._id]" class="space-y-2">
              <legend class="sr-only">Décision pour {{ d.designation }}</legend>
              <div class="flex flex-wrap gap-2">
                <label class="inline-flex items-center gap-2 min-h-10 px-3 rounded-xl border cursor-pointer text-xs font-bold" :class="brouillons[d._id]!.mode === 'prix' ? 'border-foret text-foret bg-foret/5' : 'border-creme2 text-gris'">
                  <input v-model="brouillons[d._id]!.mode" type="radio" value="prix" :name="`decision-${d._id}`" class="w-4 h-4 accent-foret" /> Chiffrer
                </label>
                <label class="inline-flex items-center gap-2 min-h-10 px-3 rounded-xl border cursor-pointer text-xs font-bold" :class="brouillons[d._id]!.mode === 'retrait' ? 'border-foret text-foret bg-foret/5' : 'border-creme2 text-gris'">
                  <input v-model="brouillons[d._id]!.mode" type="radio" value="retrait" :name="`decision-${d._id}`" class="w-4 h-4 accent-foret" /> Retirer
                </label>
              </div>
              <label v-if="brouillons[d._id]!.mode === 'prix'" class="block text-xs font-bold text-noir">Prix (FCFA)
                <input v-model="brouillons[d._id]!.prix" type="number" min="0" step="1" inputmode="numeric" :class="champ" placeholder="Ex. 1500" />
              </label>
              <label v-else class="block text-xs font-bold text-noir">Motif du retrait ({{ MOTIF_RETRAIT.min }} à {{ MOTIF_RETRAIT.max }} caractères)
                <input v-model="brouillons[d._id]!.motif" :maxlength="MOTIF_RETRAIT.max" :class="champ" placeholder="Ex. introuvable cette semaine" />
              </label>
            </fieldset>
          </li>
        </ul>
        <p v-if="peutChiffrer && !chiffrable" class="text-xs p-3 rounded-xl bg-creme text-noir">
          Commande « {{ commande.statut }} »<template v-if="commande.paiement?.statut === 'Payé'">, payée</template> : ses demandes libres ne se modifient plus.
        </p>
      </section>

      <!-- Total -->
      <div class="rounded-xl bg-creme p-3 space-y-0.5" aria-live="polite" aria-atomic="true">
        <p class="flex items-baseline justify-between gap-3">
          <span class="text-noir font-bold">Total de la commande</span>
          <strong class="font-display text-xl text-foret tabular-nums">{{ formaterFrancs(total) }}</strong>
        </p>
        <p v-if="decisions.length" class="text-xs text-right">Après enregistrement : <strong class="text-noir">{{ formaterFrancs(totalApercu) }}</strong></p>
      </div>

      <p v-if="message" role="status" class="p-3 rounded-xl bg-foret/10 text-foret text-xs font-semibold">{{ message }}</p>
      <p v-if="erreur" role="alert" class="p-3 rounded-xl bg-red-50 text-red-800 text-xs font-semibold">{{ erreur }}</p>

      <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <button type="button" @click="fermer" class="cursor-pointer min-h-11 px-4 rounded-xl border border-creme2 font-bold">Fermer</button>
        <button v-if="modifiable && demandes.length" type="button" @click="enregistrer" :disabled="enregistrement" class="cursor-pointer min-h-11 px-5 rounded-xl bg-foret text-white font-bold hover:bg-savane disabled:opacity-60">
          {{ enregistrement ? 'Enregistrement…' : 'Enregistrer les demandes' }}
        </button>
      </div>
    </div>
  </div>
</template>
