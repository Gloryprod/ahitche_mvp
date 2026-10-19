<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { Plus, Trash2, X } from 'lucide-vue-next'
import api from '@/stores/api'
import { messageErreur } from '@/services/erreurs'
import type { BonCommande, Prestataire, Product, TypeCommandeBon } from '@/type'
import ChoixProduit from './ChoixProduit.vue'
import {
  MAX_LIGNES_BON, arrondi2, corpsDuBon, formatFcfa, formatQuantite, idChampLigne, jourIso, libelleProduit, lignesFigees,
  nombreSaisi, nomDuBon, numeroDuLot, produitDeLigne, sommeLignes, verifierSaisieBon, type ErreurSaisie, type LigneSaisie,
  type SaisieBon,
} from '@/services/bonsCommande'

// Bon au format facture : création (bon = null) ou modification. Bon déjà reçu, même en partie : l'en-tête seulement,
// ses lignes (en stock) s'affichent en lecture seule et le serveur met ses lots à jour.
// Les contrôles sont ceux du serveur ; s'il refuse (numéro déjà pris, ligne budgétaire inconnue…), son message
// s'affiche tel quel.
const props = defineProps<{
  bon: BonCommande | null
  produits: Product[] // Catalogue complet, tous types
  fournisseurs: Prestataire[] // Fiches « Fournisseur » actives
}>()
const emit = defineEmits<{ fermer: []; enregistre: [message: string] }>()

const TYPES: { valeur: TypeCommandeBon; titre: string; aide: string }[] = [
  { valeur: 'Bon de commande', titre: 'Bon de commande signé', aide: 'Avec la référence du bon signé' },
  { valeur: 'Achat direct', titre: 'Achat direct', aide: 'Sans bon de commande : la facture fait foi' },
]

let prochaineCle = 0
const ligneVide = (): LigneSaisie => ({
  cle: prochaineCle++, designation: '', quantiteFacture: '', productId: '', quantite: null, detailQuantite: '', montantFcfa: null, produitRetire: '',
})

// Aucune valeur inventée : dates, fournisseur et total restent à saisir
function saisieInitiale(bon: BonCommande | null): SaisieBon {
  if (!bon) {
    return {
      typeCommande: 'Bon de commande', numeroBon: '', numeroFacture: '', dateFacture: '', dateEmission: '', fournisseurId: '',
      ligneBudgetaire: '', sousLigne: '', commentaire: '', totalFacture: null, lignes: [ligneVide()],
    }
  }
  const achatDirect = bon.typeCommande === 'Achat direct'
  return {
    typeCommande: achatDirect ? 'Achat direct' : 'Bon de commande',
    numeroBon: achatDirect ? '' : bon.numeroBon, // Achat direct : numéro tiré de la facture par le serveur
    numeroFacture: bon.numeroFacture ?? '',
    dateFacture: jourIso(bon.dateFacture),
    dateEmission: jourIso(bon.dateEmission),
    fournisseurId: bon.fournisseurId ?? '',
    ligneBudgetaire: bon.ligneBudgetaire ?? '',
    sousLigne: bon.sousLigne ?? '',
    commentaire: bon.commentaire ?? '',
    totalFacture: bon.montantTotalFcfa ?? null,
    lignes: (bon.lignes ?? []).map(l => {
      const produit = produitDeLigne(l)
      return {
        cle: prochaineCle++,
        designation: l.designation,
        quantiteFacture: l.quantiteFacture ?? '',
        productId: produit?._id ?? (typeof l.productId === 'string' ? l.productId : ''),
        quantite: l.quantite,
        detailQuantite: l.detailQuantite ?? '',
        montantFcfa: l.montantFcfa,
        produitRetire: produit ? libelleProduit(produit) : '',
      }
    }),
  }
}

const saisie = ref<SaisieBon>(saisieInitiale(props.bon))
const figees = computed(() => !!props.bon && lignesFigees(props.bon))
const achatDirect = computed(() => saisie.value.typeCommande === 'Achat direct')
const produitsParId = computed(() => new Map(props.produits.map(p => [p._id, p])))
const uniteDe = (id: string) => produitsParId.value.get(id)?.unit ?? null
// Produit d'origine retiré du catalogue (modification) : la ligne doit en choisir un autre
const produitAbsent = (l: LigneSaisie) => !!l.productId && props.produits.length > 0 && !produitsParId.value.has(l.productId)

// Total : somme des lignes (comme le serveur) et écart avec le total recopié de la facture
const totalLignes = computed(() => sommeLignes(saisie.value.lignes))
const ecart = computed(() => {
  const total = nombreSaisi(saisie.value.totalFacture)
  return Number.isNaN(total) ? null : arrondi2(total - totalLignes.value)
})

// --- Lignes ---
function ajouterLigne() {
  if (saisie.value.lignes.length >= MAX_LIGNES_BON) return
  const ligne = ligneVide()
  saisie.value.lignes.push(ligne)
  void nextTick(() => document.getElementById(idChampLigne(ligne.cle, 'designation'))?.focus())
}
function retirerLigne(index: number) {
  if (saisie.value.lignes.length > 1) saisie.value.lignes.splice(index, 1)
}

// --- Envoi ---
const erreur = ref<ErreurSaisie | null>(null)
const invalide = (champ: string) => erreur.value?.champ === champ
const queryClient = useQueryClient()

const enregistrement = useMutation({
  mutationFn: (corps: ReturnType<typeof corpsDuBon>) => (props.bon
    ? api.put(`/api/admin/bons-commande/${props.bon._id}`, corps)
    : api.post('/api/admin/bons-commande', corps)),
  onSuccess: async (reponse) => {
    await queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] })
    emit('enregistre', reponse.data?.message || (props.bon ? 'Bon mis à jour.' : 'Bon enregistré.'))
  },
  onError: (err) => {
    erreur.value = { message: messageErreur(err, "Enregistrement du bon impossible : vérifiez la connexion et réessayez.") }
  },
})

function envoyer() {
  if (enregistrement.isPending.value) return
  erreur.value = verifierSaisieBon(saisie.value, uniteDe, figees.value)
  if (erreur.value) {
    const champ = erreur.value.champ
    if (champ) void nextTick(() => document.getElementById(champ)?.focus())
    return
  }
  enregistrement.mutate(corpsDuBon(saisie.value, figees.value))
}

// Le titre reçoit le focus à l'ouverture : lecteurs d'écran et téléphone arrivent au début du formulaire
const titre = ref<HTMLElement | null>(null)
onMounted(() => titre.value?.focus())

const etiquette = 'block mb-1 font-bold text-noir text-[10px] uppercase tracking-wide'
const champ = (id: string) => [invalide(id) ? 'border-red-600' : 'border-creme2', 'w-full px-3 py-2 bg-white border rounded-lg text-noir focus:outline-none focus:border-foret']
</script>

<template>
  <section class="bg-white rounded-2xl border border-creme2 p-4 sm:p-5 space-y-5" aria-labelledby="bon-facture-titre">
    <div class="flex items-start justify-between gap-3 border-b border-creme2 pb-3">
      <div class="min-w-0">
        <h2 id="bon-facture-titre" ref="titre" tabindex="-1" class="scroll-mt-24 font-display font-bold text-lg text-noir focus:outline-none break-words">
          {{ bon ? `Modifier ${nomDuBon(bon)}` : 'Nouveau bon (facture d\'achat)' }}
        </h2>
        <p v-if="figees" class="text-[11px] text-gris">Bon réceptionné : corrigez le fournisseur, les références, les dates, l'imputation ou le commentaire. Les champs marqués * sont obligatoires.</p>
        <p v-else class="text-[11px] text-gris">Recopiez la facture ligne par ligne et rattachez chaque ligne à un produit du catalogue. Les champs marqués * sont obligatoires.</p>
      </div>
      <button type="button" @click="emit('fermer')" class="cursor-pointer shrink-0 p-1.5 rounded-lg bg-creme text-gris hover:text-noir" aria-label="Fermer le formulaire">
        <X class="w-4 h-4" />
      </button>
    </div>

    <form novalidate class="space-y-5" @submit.prevent="envoyer">
      <!-- TYPE D'ACHAT -->
      <fieldset>
        <legend :class="etiquette">Type d'achat *</legend>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label v-for="t in TYPES" :key="t.valeur" :class="[saisie.typeCommande === t.valeur ? 'border-foret bg-foret/5' : 'border-creme2 bg-white', 'cursor-pointer flex items-start gap-2 p-3 rounded-xl border']">
            <input v-model="saisie.typeCommande" type="radio" name="bon-type" :value="t.valeur" class="mt-0.5 accent-foret" />
            <span>
              <span class="block font-bold text-noir">{{ t.titre }}</span>
              <span class="block text-[11px] text-gris">{{ t.aide }}</span>
            </span>
          </label>
        </div>
      </fieldset>

      <!-- RÉFÉRENCES, DATES ET FOURNISSEUR -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div v-if="!achatDirect">
          <label :class="etiquette" for="bon-numero">Référence du bon signé *</label>
          <input id="bon-numero" v-model="saisie.numeroBon" type="text" maxlength="60" required autocomplete="off" placeholder="Telle qu'écrite sur le bon" :aria-invalid="invalide('bon-numero') || undefined" :class="[champ('bon-numero'), 'font-mono']" />
        </div>
        <div>
          <label :class="etiquette" for="bon-facture">N° de facture{{ achatDirect ? ' *' : '' }}</label>
          <input id="bon-facture" v-model="saisie.numeroFacture" type="text" maxlength="60" :required="achatDirect" autocomplete="off" :placeholder="achatDirect ? 'Obligatoire pour un achat direct' : 'Facultatif si la facture n\'est pas encore arrivée'" :aria-invalid="invalide('bon-facture') || undefined" :class="[champ('bon-facture'), 'font-mono']" />
          <p v-if="achatDirect" class="mt-1 text-[10px] text-gris">Numéro du bon : « Achat direct – facture n° {{ saisie.numeroFacture.trim() || '…' }} »</p>
        </div>
        <div v-if="!achatDirect">
          <label :class="etiquette" for="bon-date">Date du bon *</label>
          <input id="bon-date" v-model="saisie.dateEmission" type="date" required :aria-invalid="invalide('bon-date') || undefined" :class="champ('bon-date')" />
        </div>
        <div>
          <label :class="etiquette" for="bon-date-facture">Date de la facture{{ achatDirect ? ' *' : '' }}</label>
          <input id="bon-date-facture" v-model="saisie.dateFacture" type="date" :required="achatDirect" :aria-invalid="invalide('bon-date-facture') || undefined" :class="champ('bon-date-facture')" />
        </div>
        <div class="sm:col-span-2">
          <label :class="etiquette" for="bon-fournisseur">Fournisseur *</label>
          <select id="bon-fournisseur" v-model="saisie.fournisseurId" required :aria-invalid="invalide('bon-fournisseur') || undefined" :class="champ('bon-fournisseur')">
            <option value="" disabled>-- Choisir le fournisseur --</option>
            <option v-for="f in fournisseurs" :key="f._id" :value="f._id">{{ f.nom }}</option>
          </select>
          <p v-if="!fournisseurs.length" class="mt-1 text-[10px] text-gris">Aucun fournisseur actif : ajoutez-en un dans « Prestataires ».</p>
          <p v-else-if="bon && saisie.fournisseurId && !fournisseurs.some(f => f._id === saisie.fournisseurId)" class="mt-1 text-[10px] text-amber-800">Le fournisseur de ce bon ({{ bon.fournisseur }}) n'est plus actif : choisissez-en un autre.</p>
        </div>
        <div>
          <label :class="etiquette" for="bon-ligne-budgetaire">Ligne budgétaire</label>
          <input id="bon-ligne-budgetaire" v-model="saisie.ligneBudgetaire" type="text" maxlength="20" autocomplete="off" placeholder="Ex : L5 (facultatif)" :class="[champ('bon-ligne-budgetaire'), 'font-mono']" />
        </div>
        <div>
          <label :class="etiquette" for="bon-sous-ligne">Sous-ligne</label>
          <input id="bon-sous-ligne" v-model="saisie.sousLigne" type="text" maxlength="20" autocomplete="off" placeholder="Ex : L5b (facultatif)" :class="[champ('bon-sous-ligne'), 'font-mono']" />
        </div>
        <div class="sm:col-span-2">
          <label :class="etiquette" for="bon-commentaire">Commentaire</label>
          <textarea id="bon-commentaire" v-model="saisie.commentaire" rows="2" maxlength="1000" :class="champ('bon-commentaire')"></textarea>
        </div>
      </div>

      <!-- LIGNES D'UN BON RÉCEPTIONNÉ : en stock, en lecture seule -->
      <section v-if="figees && bon" class="space-y-2" aria-labelledby="bon-lignes-figees">
        <h3 id="bon-lignes-figees" :class="etiquette">Lignes de la facture ({{ bon.lignes?.length ?? 0 }}), entrées en stock</h3>
        <p class="p-3 rounded-xl bg-creme text-[11px] text-gris">Ces lignes ont créé les lots du stock : elles ne se modifient plus. Les lots du bon reprennent le fournisseur et le numéro de facture enregistrés ici. Une quantité se corrige dans le Stock (correction motivée).</p>
        <ol class="space-y-2">
          <li v-for="(l, index) in bon.lignes ?? []" :key="l._id" class="p-3 rounded-xl border border-creme2 bg-creme/50 min-w-0">
            <p class="font-bold text-noir break-words">Ligne {{ index + 1 }} : {{ l.designation }}</p>
            <p class="text-[11px] text-gris break-words">
              {{ libelleProduit(produitDeLigne(l)) }} · {{ formatQuantite(l.quantite) }} {{ produitDeLigne(l)?.unit ?? '' }} · {{ formatFcfa(l.montantFcfa) }}<template v-if="numeroDuLot(l)"> · lot {{ numeroDuLot(l) }}</template>
            </p>
          </li>
        </ol>
        <p class="p-3 rounded-xl bg-creme"><span :class="etiquette">Total de la facture</span> <span class="font-mono font-bold text-base text-noir">{{ formatFcfa(bon.montantTotalFcfa) }}</span></p>
      </section>

      <!-- LIGNES DE LA FACTURE -->
      <fieldset v-else class="space-y-3">
        <legend :class="etiquette">Lignes de la facture ({{ saisie.lignes.length }})</legend>
        <ol class="space-y-3">
          <li v-for="(l, index) in saisie.lignes" :key="l.cle" class="p-3 rounded-xl border border-creme2 bg-creme/50 space-y-2">
            <div class="flex items-center justify-between gap-2">
              <p class="font-bold text-noir">Ligne {{ index + 1 }}</p>
              <button v-if="saisie.lignes.length > 1" type="button" @click="retirerLigne(index)" class="cursor-pointer p-1.5 rounded-lg text-gris hover:text-red-700 hover:bg-white" :aria-label="`Retirer la ligne ${index + 1}`">
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-12 gap-2">
              <div class="col-span-2 sm:col-span-8">
                <label :class="etiquette" :for="idChampLigne(l.cle, 'designation')">Désignation (telle que sur la facture) *</label>
                <input :id="idChampLigne(l.cle, 'designation')" v-model="l.designation" type="text" maxlength="300" required :aria-invalid="invalide(idChampLigne(l.cle, 'designation')) || undefined" :class="champ(idChampLigne(l.cle, 'designation'))" />
              </div>
              <div class="col-span-2 sm:col-span-4">
                <label :class="etiquette" :for="idChampLigne(l.cle, 'quantite-facture')">Quantité facturée</label>
                <input :id="idChampLigne(l.cle, 'quantite-facture')" v-model="l.quantiteFacture" type="text" maxlength="100" placeholder="Ex : 1 carton" :class="champ(idChampLigne(l.cle, 'quantite-facture'))" />
              </div>
              <div class="col-span-2 sm:col-span-6">
                <label :class="etiquette" :for="idChampLigne(l.cle, 'produit')">Produit du catalogue *</label>
                <ChoixProduit v-model="l.productId" :id-champ="idChampLigne(l.cle, 'produit')" :produits="produits" :invalide="invalide(idChampLigne(l.cle, 'produit'))" requis />
                <p v-if="produitAbsent(l)" class="mt-1 text-[10px] text-amber-800">Produit d'origine{{ l.produitRetire ? ` (${l.produitRetire})` : '' }} retiré du catalogue : choisissez-en un autre.</p>
              </div>
              <div class="col-span-1 sm:col-span-3">
                <label :class="etiquette" :for="idChampLigne(l.cle, 'quantite')">Quantité *</label>
                <div class="flex items-center gap-1.5">
                  <input :id="idChampLigne(l.cle, 'quantite')" v-model="l.quantite" type="number" min="0" step="any" inputmode="decimal" required :aria-invalid="invalide(idChampLigne(l.cle, 'quantite')) || undefined" :aria-describedby="`${idChampLigne(l.cle, 'quantite')}-unite`" :class="[champ(idChampLigne(l.cle, 'quantite')), 'font-mono min-w-0']" />
                  <span :id="`${idChampLigne(l.cle, 'quantite')}-unite`" class="shrink-0 text-gris">{{ uniteDe(l.productId) ?? 'unité' }}</span>
                </div>
              </div>
              <div class="col-span-1 sm:col-span-3">
                <label :class="etiquette" :for="idChampLigne(l.cle, 'montant')">Montant (FCFA) *</label>
                <input :id="idChampLigne(l.cle, 'montant')" v-model="l.montantFcfa" type="number" min="0" step="any" inputmode="decimal" required :aria-invalid="invalide(idChampLigne(l.cle, 'montant')) || undefined" :class="[champ(idChampLigne(l.cle, 'montant')), 'font-mono']" />
              </div>
              <div class="col-span-2 sm:col-span-12">
                <label :class="etiquette" :for="idChampLigne(l.cle, 'detail')">Détail de la quantité</label>
                <input :id="idChampLigne(l.cle, 'detail')" v-model="l.detailQuantite" type="text" maxlength="200" placeholder="Ex : 15 bouteilles de 1 L" :class="champ(idChampLigne(l.cle, 'detail'))" />
              </div>
            </div>
          </li>
        </ol>
        <button type="button" :disabled="saisie.lignes.length >= MAX_LIGNES_BON" @click="ajouterLigne" class="cursor-pointer w-full inline-flex items-center justify-center gap-1.5 py-2 border border-dashed border-gris-lt rounded-xl text-gris hover:text-foret hover:border-foret font-bold disabled:opacity-50 disabled:cursor-not-allowed">
          <Plus class="w-3.5 h-3.5" /> Ajouter une ligne
        </button>
        <p v-if="saisie.lignes.length >= MAX_LIGNES_BON" class="text-[10px] text-gris">{{ MAX_LIGNES_BON }} lignes au plus par bon.</p>
      </fieldset>

      <!-- TOTAL -->
      <div v-if="!figees" class="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-creme">
        <div>
          <p :class="etiquette">Somme des lignes</p>
          <p class="font-mono font-bold text-base text-noir">{{ formatFcfa(totalLignes) }}</p>
        </div>
        <div>
          <label :class="etiquette" for="bon-total">Total de la facture (FCFA) *</label>
          <input id="bon-total" v-model="saisie.totalFacture" type="number" min="0" step="any" inputmode="decimal" required aria-describedby="bon-total-ecart" :aria-invalid="invalide('bon-total') || undefined" :class="[champ('bon-total'), 'font-mono']" />
          <p id="bon-total-ecart" class="mt-1 text-[11px]" :class="ecart === null ? 'text-gris' : ecart === 0 ? 'text-savane font-semibold' : 'text-amber-800 font-semibold'" aria-live="polite">
            <template v-if="ecart === null">Recopiez le total écrit sur la facture : il doit être égal à la somme des lignes.</template>
            <template v-else-if="ecart === 0">Égal à la somme des lignes.</template>
            <template v-else>Écart de {{ formatFcfa(Math.abs(ecart)) }} avec la somme des lignes ({{ ecart > 0 ? 'total plus élevé' : 'total plus faible' }}).</template>
          </p>
        </div>
      </div>

      <p v-if="erreur" role="alert" class="p-3 rounded-xl bg-red-50 text-red-800 border border-red-200 font-semibold">{{ erreur.message }}</p>

      <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <button type="button" @click="emit('fermer')" class="cursor-pointer px-4 py-2.5 border border-creme2 text-noir font-bold rounded-xl hover:bg-creme">Annuler</button>
        <button type="submit" :disabled="enregistrement.isPending.value" class="cursor-pointer px-4 py-2.5 bg-foret text-white font-bold rounded-xl hover:bg-foret/90 disabled:opacity-50 disabled:cursor-wait">
          {{ enregistrement.isPending.value ? 'Enregistrement…' : (bon ? 'Enregistrer les modifications' : 'Enregistrer le bon') }}
        </button>
      </div>
    </form>
  </section>
</template>
