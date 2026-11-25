<script setup lang="ts">
// Import d'un référentiel dans le catalogue (admin seulement) : coller un tableau (copié d'Excel, « ; » ou Markdown),
// vérifier (simulation), puis appliquer. Tout ou rien : le serveur lit, contrôle et journalise (services/referentielService.js).
// Le texte collé n'est jamais écrit dans la console (prix du catalogue).
import { ref, computed } from 'vue'
import axios from 'axios'
import { X, ClipboardCopy } from 'lucide-vue-next'
import Swal from 'sweetalert2'
import api from '@/stores/api'
import { messageErreur } from '@/services/erreurs'
import { MODELE_REFERENTIEL, peutAppliquerReferentiel, lignesAffichees, type ReponseReferentiel } from '@/services/importReferentiel'

const emit = defineEmits<{ fermer: []; importe: [message: string] }>()

const texte = ref('')
const texteVerifie = ref<string | null>(null) // Texte de la dernière vérification
const apercu = ref<ReponseReferentiel | null>(null)
const erreur = ref('')
const enCours = ref(false)
const masquerInchangees = ref(true)
const modeleCopie = ref(false)

const applicable = computed(() => peutAppliquerReferentiel(apercu.value, texte.value, texteVerifie.value))
const texteModifie = computed(() => texteVerifie.value !== null && texte.value !== texteVerifie.value)
const lignes = computed(() => (apercu.value ? lignesAffichees(apercu.value.lignes, masquerInchangees.value) : []))

async function envoyer(appliquer: boolean) {
  const t = texte.value
  enCours.value = true
  erreur.value = ''
  try {
    const { data } = await api.post<ReponseReferentiel>('/api/admin/products/referentiel/import', { texte: t, appliquer })
    if (appliquer) {
      emit('importe', data.message)
      return
    }
    apercu.value = data
    texteVerifie.value = t
  } catch (err) {
    // Refus ligne par ligne (tout ou rien) : l'aperçu montre les lignes en cause ; sinon erreur de fichier (en-têtes, limites…)
    const corps = axios.isAxiosError<Partial<ReponseReferentiel>>(err) ? err.response?.data : undefined
    if (Array.isArray(corps?.lignes) && corps.resume) {
      apercu.value = corps as ReponseReferentiel
      texteVerifie.value = t
    } else {
      apercu.value = null
      texteVerifie.value = null
    }
    erreur.value = messageErreur(err, 'La vérification du référentiel a échoué. Réessayez dans un instant.')
  } finally {
    enCours.value = false
  }
}

async function appliquerImport() {
  const r = apercu.value?.resume
  if (!r) return
  const { isConfirmed } = await Swal.fire({
    title: 'Appliquer le référentiel ?',
    text: `${r.modifications} produit(s) modifié(s) et ${r.creations} créé(s) dans le catalogue, avec conversion du stock si une unité change. Chaque changement est inscrit au journal.`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#1A5C38',
    cancelButtonColor: '#d33',
    confirmButtonText: 'Oui, appliquer',
    cancelButtonText: 'Annuler',
    customClass: { popup: 'rounded-2xl font-body' }
  })
  if (isConfirmed) await envoyer(true)
}

async function copierModele() {
  try {
    await navigator.clipboard.writeText(MODELE_REFERENTIEL)
    modeleCopie.value = true
    setTimeout(() => (modeleCopie.value = false), 2500)
  } catch {
    erreur.value = 'Copie impossible : sélectionnez la ligne du modèle à la main.'
  }
}

const libelleStatut = { creation: 'Création', modification: 'Modifiée', inchange: 'Inchangée', erreur: 'Erreur' }
const classeStatut = { creation: 'bg-savane/10 text-savane', modification: 'bg-foret/10 text-foret', inchange: 'bg-creme2 text-gris', erreur: 'bg-red-50 text-red-800' }
const champ = 'w-full px-3 py-2 rounded-xl border border-creme2 bg-creme text-noir focus:outline-none focus:border-foret'
</script>

<template>
  <section aria-labelledby="referentiel-titre" class="bg-white p-5 rounded-2xl border border-creme2 shadow-sm space-y-4 animate-fadeIn">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 id="referentiel-titre" class="font-display font-bold text-lg text-noir">Importer un référentiel</h2>
        <p class="text-[11px]">Collez le tableau du référentiel (feuille « Import » d'Excel) : vérification, aperçu, puis application en une fois.</p>
      </div>
      <button type="button" @click="emit('fermer')" aria-label="Fermer l'import du référentiel" class="cursor-pointer p-1.5 rounded-lg hover:bg-creme text-gris">
        <X class="w-4 h-4" />
      </button>
    </div>

    <details class="rounded-xl bg-creme p-3 text-[11px] space-y-1.5">
      <summary class="cursor-pointer font-bold text-noir">Colonnes et règles</summary>
      <p class="mt-2">Première ligne : les en-têtes. Séparateur : tabulation (copié d'Excel), point-virgule ou tableau Markdown.</p>
      <p>Obligatoires : <span class="font-mono text-noir">reference</span> et <span class="font-mono text-noir">produit</span>. Facultatives : <span class="font-mono">type, unite, prix_unitaire_fcfa, quantite_essentiel, quantite_equilibre, quantite_confort, quantite_reserve, quantite_fraicheur, categorie, conversion</span>. Une colonne absente garde la valeur actuelle.</p>
      <ul class="list-disc pl-4 space-y-0.5">
        <li>Le produit est reconnu par son nom : deux produits peuvent échanger leurs références (P09, V19…) en gardant leur historique.</li>
        <li>Quantité vide ou « — » : absent du pack ; « = » : quantité actuelle gardée. Prix vide : prix actuel gardé.</li>
        <li>Conversion : nombre de nouvelles unités dans une ancienne (ex. 5 pour passer du kg au sachet de 200 g). Elle exige un prix et convertit le stock (lots, mouvements, manques, bons).</li>
        <li>Les produits absents du tableau ne sont pas touchés. Une ligne en erreur : rien n'est enregistré.</li>
      </ul>
      <div class="flex flex-wrap items-center gap-2 pt-1">
        <button type="button" @click="copierModele" class="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-creme2 text-noir font-bold rounded-lg hover:bg-creme2">
          <ClipboardCopy class="w-3.5 h-3.5" /> Copier le modèle
        </button>
        <span v-if="modeleCopie" role="status" class="text-foret font-bold">Modèle copié.</span>
      </div>
    </details>

    <form @submit.prevent="envoyer(false)" class="space-y-4">
      <div>
        <label for="referentiel-texte" class="block text-[10px] font-bold uppercase tracking-wider text-gris mb-1">Tableau du référentiel</label>
        <textarea id="referentiel-texte" v-model="texte" rows="8" spellcheck="false" :class="[champ, 'font-mono text-[11px]']" :aria-describedby="erreur ? 'referentiel-erreur' : undefined" required></textarea>
      </div>

      <p v-if="erreur" id="referentiel-erreur" role="alert" class="p-3 rounded-xl border bg-red-50 text-red-700 border-red-200 font-semibold">{{ erreur }}</p>

      <button type="submit" :disabled="enCours || !texte.trim()" class="cursor-pointer w-full sm:w-auto px-6 py-2.5 bg-white border border-foret text-foret text-xs font-bold rounded-xl hover:bg-foret/5 disabled:opacity-50 disabled:cursor-not-allowed">
        {{ enCours ? 'Vérification…' : 'Vérifier' }}
      </button>
    </form>

    <section v-if="apercu" aria-labelledby="referentiel-apercu-titre" class="space-y-3">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="referentiel-apercu-titre" class="font-bold text-noir text-sm">Aperçu</h3>
        <p class="text-[11px]" aria-live="polite">
          {{ apercu.message }}
          <span class="block sm:inline">
            {{ apercu.resume.modifications }} modifié(s) · {{ apercu.resume.creations }} créé(s) · {{ apercu.resume.inchanges }} inchangé(s)<span v-if="apercu.resume.erreurs" class="text-red-700 font-bold"> · {{ apercu.resume.erreurs }} en erreur</span>
          </span>
        </p>
      </div>
      <label class="inline-flex items-center gap-2 cursor-pointer text-[11px] font-semibold">
        <input v-model="masquerInchangees" type="checkbox" class="accent-foret" /> Masquer les lignes inchangées
      </label>

      <p v-if="!lignes.length" class="text-center py-4 text-gris">Toutes les lignes sont inchangées.</p>
      <div v-else v-defilable="'Aperçu du référentiel'" class="overflow-x-auto border border-creme2 rounded-xl">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-creme border-b border-creme2 text-[10px] font-bold uppercase tracking-wider text-gris">
              <!-- Statut et détail d'abord : ce qu'il faut corriger reste visible sur téléphone -->
              <th scope="col" class="py-2 px-3">Ligne</th>
              <th scope="col" class="py-2 px-3">Statut</th>
              <th scope="col" class="py-2 px-3">Détail</th>
              <th scope="col" class="py-2 px-3">Réf.</th>
              <th scope="col" class="py-2 px-3">Produit</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-creme2 text-noir">
            <tr v-for="l in lignes" :key="l.ligne" class="align-top">
              <td class="py-2 px-3 font-mono">{{ l.ligne }}</td>
              <td class="py-2 px-3"><span :class="[classeStatut[l.statut], 'px-2 py-0.5 rounded font-bold whitespace-nowrap']">{{ libelleStatut[l.statut] }}</span></td>
              <td class="py-2 px-3 min-w-[14rem]">
                <ul v-if="l.messages.length" class="space-y-0.5 text-red-800"><li v-for="(m, i) in l.messages" :key="i">{{ m }}</li></ul>
                <ul v-else-if="l.changements.length" class="space-y-0.5"><li v-for="(c, i) in l.changements" :key="i">{{ c }}</li></ul>
                <span v-else class="text-gris">—</span>
              </td>
              <td class="py-2 px-3 font-mono whitespace-nowrap">{{ l.reference || '—' }}</td>
              <td class="py-2 px-3 font-bold whitespace-nowrap">{{ l.produit || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p v-if="texteModifie" class="p-2 rounded-lg bg-amber-50 text-amber-900 text-[11px]">Le tableau a changé depuis la vérification : cliquez de nouveau sur « Vérifier ».</p>
      <p v-else-if="apercu.resume.erreurs" class="p-2 rounded-lg bg-red-50 text-red-800 text-[11px]">Corrigez les lignes en erreur, puis vérifiez de nouveau. Rien n'est enregistré tant qu'une ligne est en erreur.</p>

      <button type="button" @click="appliquerImport" :disabled="!applicable || enCours" class="cursor-pointer w-full py-2.5 bg-foret text-white text-xs font-bold rounded-xl hover:bg-opacity-95 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
        {{ enCours ? 'Application…' : 'Appliquer le référentiel' }}
      </button>
    </section>
  </section>
</template>
