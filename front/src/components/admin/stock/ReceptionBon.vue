<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { PackageCheck, X } from 'lucide-vue-next'
import api from '@/stores/api'
import { messageErreur } from '@/services/erreurs'
import type { BonCommande, LigneBonFacture } from '@/type'
import {
  aujourdHui, dateValide, estAchatDirect, formatFcfa, formatQuantite, jourIso, libelleProduit, ligneRecue, nombreSaisi,
  nomDuBon, numeroDuLot, produitDeLigne, type ErreurSaisie,
} from '@/services/bonsCommande'

// Réception d'un bon au format facture (POST /api/admin/bons-commande/:id/reception) : un lot par ligne cochée,
// valorisé au montant de la ligne (au prorata d'une quantité reçue plus faible), dans une seule transaction.
const props = defineProps<{ bon: BonCommande }>()
const emit = defineEmits<{ fermer: []; receptionne: [message: string] }>()

interface LigneReception {
  ligne: LigneBonFacture
  coche: boolean
  quantiteRecue: number | string | null
  lotFournisseur: string
  numeroLot: string
}

// Date de la facture, sinon celle du bon, sinon aujourd'hui
const dateReception = ref(jourIso(props.bon.dateFacture) || jourIso(props.bon.dateEmission) || aujourdHui())
const lignes = ref<LigneReception[]>((props.bon.lignes ?? []).filter(l => !ligneRecue(l)).map(l => ({
  ligne: l, coche: true, quantiteRecue: l.quantite, lotFournisseur: '', numeroLot: '',
})))
const dejaRecues = computed(() => (props.bon.lignes ?? []).filter(ligneRecue))
const cochees = computed(() => lignes.value.filter(l => l.coche))

const unite = (l: LigneBonFacture) => produitDeLigne(l)?.unit ?? ''
const idChamp = (l: LigneReception, champ: string) => `reception-${l.ligne._id}-${champ}`
// Numéro proposé par le serveur quand le champ reste vide : LOT-<référence>-AAAAMMJJ-NN (jour de la réception)
const modeleNumero = (l: LigneReception) => {
  const reference = produitDeLigne(l.ligne)?.reference
  if (!reference) return ''
  const jour = dateValide(dateReception.value) ? dateReception.value.replace(/-/g, '') : 'AAAAMMJJ'
  return `LOT-${reference}-${jour}-NN`
}

// Contrôles du serveur
function verifier(): ErreurSaisie | null {
  if (!dateValide(dateReception.value)) return { message: 'Indiquez la date de réception (AAAA-MM-JJ).', champ: 'reception-date' }
  if (!cochees.value.length) return { message: 'Cochez au moins une ligne reçue.' }
  const numeros = new Set<string>()
  for (const l of cochees.value) {
    const nom = `Ligne « ${l.ligne.designation} »`
    const quantite = nombreSaisi(l.quantiteRecue)
    if (!(quantite > 0)) return { message: `${nom} : quantité reçue invalide (supérieure à 0).`, champ: idChamp(l, 'quantite') }
    if (quantite > l.ligne.quantite) {
      return { message: `${nom} : la quantité reçue (${formatQuantite(quantite)}) dépasse la quantité facturée (${formatQuantite(l.ligne.quantite)} ${unite(l.ligne)}).`, champ: idChamp(l, 'quantite') }
    }
    const numero = l.numeroLot.trim()
    const produit = produitDeLigne(l.ligne)
    if (!numero && !produit?.reference) {
      return { message: `${nom} : ${produit?.name ?? 'ce produit'} n'a pas de référence, indiquez le numéro de lot.`, champ: idChamp(l, 'lot') }
    }
    if (numero) {
      if (numeros.has(numero)) return { message: `Le numéro de lot ${numero} est indiqué deux fois.`, champ: idChamp(l, 'lot') }
      numeros.add(numero)
    }
  }
  return null
}

const erreur = ref<ErreurSaisie | null>(null)
const invalide = (champ: string) => erreur.value?.champ === champ
const queryClient = useQueryClient()

const reception = useMutation({
  mutationFn: (corps: { dateReception: string; lignes: { ligneId: string; quantiteRecue: number; lotFournisseur: string; numeroLot: string }[] }) =>
    api.post(`/api/admin/bons-commande/${props.bon._id}/reception`, corps),
  onSuccess: async (reponse) => {
    // Lots créés : liste des bons, inventaire, entrées de stock et mouvements à recharger
    await Promise.all(['purchaseOrders', 'globalInventory', 'lotsStock', 'mouvementsStock']
      .map(cle => queryClient.invalidateQueries({ queryKey: [cle] })))
    emit('receptionne', reponse.data?.message || 'Réception enregistrée.')
  },
  onError: (err) => {
    erreur.value = { message: messageErreur(err, 'Réception impossible : vérifiez la connexion et réessayez.') }
  },
})

// Une seule réception à la fois : bouton désactivé pendant l'envoi (un second envoi serait refusé, 409)
function envoyer() {
  if (reception.isPending.value) return
  erreur.value = verifier()
  if (erreur.value) {
    const champ = erreur.value.champ
    if (champ) void nextTick(() => document.getElementById(champ)?.focus())
    return
  }
  reception.mutate({
    dateReception: dateReception.value,
    lignes: cochees.value.map(l => ({
      ligneId: l.ligne._id,
      quantiteRecue: nombreSaisi(l.quantiteRecue),
      lotFournisseur: l.lotFournisseur.trim(),
      numeroLot: l.numeroLot.trim(),
    })),
  })
}

const titre = ref<HTMLElement | null>(null)
onMounted(() => titre.value?.focus())

const etiquette = 'block mb-1 font-bold text-noir text-[10px] uppercase tracking-wide'
const champ = (id: string) => [invalide(id) ? 'border-red-600' : 'border-creme2', 'w-full px-3 py-2 bg-white border rounded-lg text-noir focus:outline-none focus:border-foret disabled:opacity-50']
</script>

<template>
  <section class="bg-white rounded-2xl border border-creme2 p-4 sm:p-5 space-y-5" aria-labelledby="reception-titre">
    <div class="flex items-start justify-between gap-3 border-b border-creme2 pb-3">
      <div class="min-w-0">
        <h2 id="reception-titre" ref="titre" tabindex="-1" class="scroll-mt-24 font-display font-bold text-lg text-noir focus:outline-none break-words">Réceptionner {{ nomDuBon(bon) }}</h2>
        <p class="text-[11px] text-gris">
          {{ bon.fournisseur }}<template v-if="bon.numeroFacture && !estAchatDirect(bon)"> · facture n° {{ bon.numeroFacture }}</template>
          · {{ formatFcfa(bon.montantTotalFcfa) }}
        </p>
      </div>
      <button type="button" @click="emit('fermer')" class="cursor-pointer shrink-0 p-1.5 rounded-lg bg-creme text-gris hover:text-noir" aria-label="Fermer la réception">
        <X class="w-4 h-4" />
      </button>
    </div>

    <p class="p-3 rounded-xl bg-creme text-[11px] text-noir">
      Chaque ligne cochée entre en stock dans un lot, valorisé au montant de la ligne (au prorata si vous recevez moins que la quantité facturée).
      Les lignes décochées restent à réceptionner plus tard.
    </p>

    <form novalidate class="space-y-5" @submit.prevent="envoyer">
      <div class="max-w-xs">
        <label :class="etiquette" for="reception-date">Date de réception *</label>
        <input id="reception-date" v-model="dateReception" type="date" required :aria-invalid="invalide('reception-date') || undefined" :class="champ('reception-date')" />
      </div>

      <fieldset class="space-y-3">
        <legend :class="etiquette">Lignes à réceptionner ({{ cochees.length }} / {{ lignes.length }})</legend>
        <ol class="space-y-3">
          <li v-for="l in lignes" :key="l.ligne._id" :class="[l.coche ? 'border-creme2 bg-white' : 'border-creme2 bg-creme/60', 'p-3 rounded-xl border space-y-3']">
            <label class="flex items-start gap-2 cursor-pointer">
              <input v-model="l.coche" type="checkbox" class="mt-0.5 accent-foret" />
              <span class="min-w-0">
                <span class="block font-bold text-noir break-words">{{ l.ligne.designation }}</span>
                <span class="block text-[11px] text-gris">
                  {{ libelleProduit(produitDeLigne(l.ligne)) }} · {{ formatQuantite(l.ligne.quantite) }} {{ unite(l.ligne) }}<template v-if="l.ligne.quantiteFacture"> (facturé : {{ l.ligne.quantiteFacture }})</template> · {{ formatFcfa(l.ligne.montantFcfa) }}
                </span>
              </span>
            </label>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label :class="etiquette" :for="idChamp(l, 'quantite')">Quantité reçue *</label>
                <div class="flex items-center gap-1.5">
                  <input :id="idChamp(l, 'quantite')" v-model="l.quantiteRecue" type="number" min="0" :max="l.ligne.quantite" step="any" inputmode="decimal" :disabled="!l.coche" required :aria-invalid="invalide(idChamp(l, 'quantite')) || undefined" :aria-describedby="`${idChamp(l, 'quantite')}-aide`" :class="[champ(idChamp(l, 'quantite')), 'font-mono min-w-0']" />
                  <span class="shrink-0 text-gris">{{ unite(l.ligne) }}</span>
                </div>
                <p :id="`${idChamp(l, 'quantite')}-aide`" class="mt-1 text-[10px] text-gris">Au plus {{ formatQuantite(l.ligne.quantite) }} {{ unite(l.ligne) }}</p>
              </div>
              <div>
                <label :class="etiquette" :for="idChamp(l, 'lot-fournisseur')">Lot du fournisseur</label>
                <input :id="idChamp(l, 'lot-fournisseur')" v-model="l.lotFournisseur" type="text" maxlength="60" autocomplete="off" placeholder="Sur le carton" :disabled="!l.coche" :class="[champ(idChamp(l, 'lot-fournisseur')), 'font-mono']" />
              </div>
              <div>
                <label :class="etiquette" :for="idChamp(l, 'lot')">N° de lot{{ produitDeLigne(l.ligne)?.reference ? '' : ' *' }}</label>
                <input :id="idChamp(l, 'lot')" v-model="l.numeroLot" type="text" maxlength="60" autocomplete="off" :disabled="!l.coche" :required="!produitDeLigne(l.ligne)?.reference" :aria-invalid="invalide(idChamp(l, 'lot')) || undefined" :aria-describedby="`${idChamp(l, 'lot')}-aide`" :class="[champ(idChamp(l, 'lot')), 'font-mono']" />
                <p :id="`${idChamp(l, 'lot')}-aide`" class="mt-1 text-[10px] text-gris break-all">
                  <template v-if="modeleNumero(l)">Laissez vide : numéro généré {{ modeleNumero(l) }}</template>
                  <template v-else>Ce produit n'a pas de référence : indiquez le numéro de lot.</template>
                </p>
              </div>
            </div>
          </li>
        </ol>
      </fieldset>

      <div v-if="dejaRecues.length" class="space-y-1">
        <p :class="etiquette">Déjà réceptionnées ({{ dejaRecues.length }})</p>
        <ul class="space-y-1 text-[11px]">
          <li v-for="l in dejaRecues" :key="l._id" class="text-gris">
            <span class="text-noir font-semibold">{{ l.designation }}</span> : {{ formatQuantite(l.quantiteRecue) }} {{ unite(l) }}, lot <span class="font-mono">{{ numeroDuLot(l) || '—' }}</span>
          </li>
        </ul>
      </div>

      <p v-if="erreur" role="alert" class="p-3 rounded-xl bg-red-50 text-red-800 border border-red-200 font-semibold">{{ erreur.message }}</p>

      <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <button type="button" @click="emit('fermer')" class="cursor-pointer px-4 py-2.5 border border-creme2 text-noir font-bold rounded-xl hover:bg-creme">Annuler</button>
        <button type="submit" :disabled="reception.isPending.value" class="cursor-pointer inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-foret text-white font-bold rounded-xl hover:bg-foret/90 disabled:opacity-50 disabled:cursor-wait">
          <PackageCheck class="w-4 h-4" />
          {{ reception.isPending.value ? 'Réception en cours…' : `Réceptionner ${cochees.length} ligne${cochees.length > 1 ? 's' : ''}` }}
        </button>
      </div>
    </form>
  </section>
</template>
