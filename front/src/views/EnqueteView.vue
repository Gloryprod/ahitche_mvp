<script setup lang="ts">
import { ref, reactive, nextTick, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import api from '@/stores/api'
import { messageErreur } from '@/services/erreurs'
import { lienWhatsApp } from '@/config/contact'
import { FORMULES_ENQUETE, AVIS_PRODUIT, LIMITES_ENQUETE, type AvisProduit } from '@/config/enquete'
import LienAccueil from '@/components/ui/LienAccueil.vue'
import BaseButton from '@/components/ui/BaseButton.vue'

// Enquête de satisfaction, sans compte et anonyme par défaut (docs-internes/enquete/CONTRAT.md).
// Seule la note globale est obligatoire ; le serveur (POST /api/public/enquete) refait tous les contrôles.

interface Produit { id: string; nom: string }

const NOTES = [
  { cle: 'noteGlobale', legende: 'Ta note globale', obligatoire: true },
  { cle: 'noteLivraison', legende: 'La livraison', obligatoire: false },
  { cle: 'noteQualite', legende: 'La qualité des produits', obligatoire: false },
] as const
const QUESTIONS = [
  { cle: 'plus', autre: 'moins', titre: 'Les produits que tu voudrais en plus grande quantité' },
  { cle: 'moins', autre: 'plus', titre: 'Ceux que tu utilises le moins' },
] as const

const produits = ref<Produit[]>([])
const etatProduits = ref<'chargement' | 'pret' | 'erreur'>('chargement')
onMounted(async () => {
  try {
    produits.value = (await api.get('/api/public/enquete')).data.produits ?? []
    etatProduits.value = 'pret'
  } catch {
    etatProduits.value = 'erreur'
  }
})

const notes = reactive<Record<(typeof NOTES)[number]['cle'], number | null>>({ noteGlobale: null, noteLivraison: null, noteQualite: null })
const formule = ref('')
const choix = reactive({ plus: [] as string[], moins: [] as string[] })
const produitSouhaite = ref('')
const detailOuvert = ref(false)
const avisProduits = reactive<Record<string, AvisProduit>>({})
const remplacements = reactive<Record<string, string>>({})
const suggestion = ref('')
const contact = reactive({ prenom: '', telephone: '', accordRecontact: false })
const piege = ref('') // Champ « site » : invisible, laissé vide par une personne, rempli par les robots

// Un produit choisi dans une liste n'est plus proposé dans l'autre
const proposes = (autre: string[]) => produits.value.filter(p => !autre.includes(p.id))
function basculer(liste: string[], id: string) {
  const i = liste.indexOf(id)
  if (i >= 0) liste.splice(i, 1)
  else if (liste.length < LIMITES_ENQUETE.produits) liste.push(id)
}
// Toucher de nouveau l'avis choisi le retire : le détail reste facultatif produit par produit
function choisirAvis(id: string, avis: AvisProduit) {
  if (avisProduits[id] === avis) delete avisProduits[id]
  else avisProduits[id] = avis
}

const envoi = ref(false)
const erreur = ref('')
const envoye = ref(false)
const titreMerci = ref<HTMLElement | null>(null)
const texte = (valeur: string) => valeur.trim() || undefined

async function envoyer() {
  erreur.value = ''
  if (!notes.noteGlobale) {
    erreur.value = 'Merci de donner une note de 1 à 5.'
    document.getElementById('noteGlobale-1')?.focus()
    return
  }
  if (contact.telephone.trim() && !contact.accordRecontact) {
    erreur.value = 'Pour être recontacté, coche la case d\'accord.'
    document.getElementById('enquete-accord')?.focus()
    return
  }
  envoi.value = true
  try {
    await api.post('/api/public/enquete', {
      noteGlobale: notes.noteGlobale,
      noteLivraison: notes.noteLivraison ?? undefined,
      noteQualite: notes.noteQualite ?? undefined,
      formule: formule.value || undefined,
      produitsPlus: choix.plus,
      produitsMoins: choix.moins,
      produitSouhaite: texte(produitSouhaite.value),
      detail: Object.entries(avisProduits).map(([produit, avis]) => ({
        produit, avis, remplacement: avis === 'autre' ? texte(remplacements[produit] ?? '') : undefined,
      })),
      suggestion: texte(suggestion.value),
      contact: texte(contact.prenom) || texte(contact.telephone)
        ? { prenom: texte(contact.prenom), telephone: texte(contact.telephone), accordRecontact: contact.accordRecontact }
        : undefined,
      site: piege.value,
    })
    envoye.value = true
    window.scrollTo({ top: 0 })
    await nextTick()
    titreMerci.value?.focus()
  } catch (err) {
    erreur.value = messageErreur(err, 'Envoi impossible pour le moment. Réessaie dans quelques minutes.')
  } finally {
    envoi.value = false
  }
}

const carte = 'bg-white rounded-2xl border border-creme2 p-4 sm:p-6'
const titre = 'font-display text-lg font-bold text-foret'
const champ = 'mt-1 w-full px-4 py-2.5 border border-creme2 rounded-xl bg-white text-base font-normal text-noir focus:outline-2 focus:outline-savane'
const etiquette = 'block text-sm font-semibold text-noir'
</script>

<template>
  <div class="min-h-screen bg-creme px-4 py-6 md:py-12">
    <div class="max-w-2xl mx-auto">
      <LienAccueil />
      <h1 class="mt-4 font-display text-3xl md:text-4xl font-bold text-foret">Ton avis sur Ahitché</h1>

      <!-- Après l'envoi -->
      <section v-if="envoye" :class="[carte, 'mt-6 text-center space-y-4']" aria-labelledby="titre-merci">
        <h2 id="titre-merci" ref="titreMerci" tabindex="-1" class="font-display text-2xl font-bold text-foret outline-none">Merci pour ton avis !</h2>
        <p class="text-gris leading-relaxed">Tes réponses nous aident à améliorer nos packs. Une question, une envie pour ta prochaine livraison ? Écris-nous.</p>
        <BaseButton :href="lienWhatsApp('Bonjour Ahitché ! Je viens de répondre à votre enquête de satisfaction.')" external data-mesure="enquete">
          Nous écrire sur WhatsApp
        </BaseButton>
      </section>

      <form v-else class="mt-2 space-y-4" novalidate @submit.prevent="envoyer">
        <p class="text-gris leading-relaxed">2 minutes pour nous dire ce que tu penses de ton pack. Seule la note globale est obligatoire.</p>

        <!-- 1. Notes : étoiles en boutons radio -->
        <section :class="[carte, 'space-y-4']" aria-labelledby="titre-notes">
          <h2 id="titre-notes" :class="titre">Tes notes</h2>
          <fieldset v-for="note in NOTES" :key="note.cle">
            <legend class="text-sm font-semibold text-noir">
              {{ note.legende }}<span v-if="note.obligatoire" class="text-gris font-normal"> (obligatoire)</span>
            </legend>
            <div class="mt-1 flex gap-1">
              <label v-for="n in 5" :key="n" class="cursor-pointer p-1 rounded-lg has-focus-visible:outline-2 has-focus-visible:outline-foret">
                <input :id="`${note.cle}-${n}`" v-model="notes[note.cle]" :value="n" type="radio" :name="note.cle" class="sr-only" />
                <span class="sr-only">{{ n }} étoile{{ n > 1 ? 's' : '' }} sur 5</span>
                <svg :class="['w-9 h-9', n <= (notes[note.cle] ?? 0) ? 'fill-or' : 'fill-creme2']" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>
              </label>
            </div>
          </fieldset>
        </section>

        <!-- 2. Pack -->
        <fieldset :class="carte">
          <legend class="float-left w-full" :class="titre">Ton pack</legend>
          <div class="clear-left pt-3 flex flex-wrap gap-2">
            <label v-for="f in FORMULES_ENQUETE" :key="f.valeur" class="cursor-pointer">
              <input v-model="formule" :value="f.valeur" type="radio" name="formule" class="peer sr-only" />
              <span class="inline-flex items-center min-h-11 px-4 rounded-full border-2 border-creme2 bg-white text-sm font-semibold text-foret peer-checked:bg-foret peer-checked:border-foret peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-or">{{ f.libelle }}</span>
            </label>
          </div>
        </fieldset>

        <!-- 3 et 4. Produits du pack -->
        <section :class="[carte, 'space-y-5']" aria-labelledby="titre-produits">
          <h2 id="titre-produits" :class="titre">Les produits de ton pack</h2>
          <p v-if="etatProduits === 'chargement'" class="text-sm text-gris">Chargement des produits…</p>
          <p v-else-if="etatProduits === 'erreur' || !produits.length" class="text-sm text-gris">
            La liste des produits ne s'affiche pas pour le moment. Tu peux quand même nous laisser tes notes et tes idées.
          </p>
          <template v-else>
            <div v-for="q in QUESTIONS" :key="q.cle" role="group" :aria-labelledby="`question-${q.cle}`">
              <p :id="`question-${q.cle}`" class="text-sm font-semibold text-noir">
                {{ q.titre }} <span class="font-normal text-gris">(jusqu'à {{ LIMITES_ENQUETE.produits }} · {{ choix[q.cle].length }} choisi{{ choix[q.cle].length > 1 ? 's' : '' }})</span>
              </p>
              <div class="mt-2 flex flex-wrap gap-2">
                <button
                  v-for="p in proposes(choix[q.autre])" :key="p.id" type="button"
                  :aria-pressed="choix[q.cle].includes(p.id)"
                  :disabled="!choix[q.cle].includes(p.id) && choix[q.cle].length >= LIMITES_ENQUETE.produits"
                  :class="['cursor-pointer min-h-11 px-3.5 rounded-full border-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-or',
                           choix[q.cle].includes(p.id) ? 'bg-foret border-foret text-white' : 'bg-white border-creme2 text-noir']"
                  @click="basculer(choix[q.cle], p.id)"
                >{{ p.nom }}</button>
              </div>
            </div>

            <label :class="etiquette">Un produit que tu voudrais ajouter ou avoir à la place ?
              <input v-model="produitSouhaite" :maxlength="LIMITES_ENQUETE.produitSouhaite" placeholder="Écris le nom du produit" :class="champ" />
            </label>

            <!-- Détail facultatif, replié par défaut -->
            <div class="border-t border-creme2 pt-4">
              <button type="button" :aria-expanded="detailOuvert" aria-controls="detail-produits"
                class="cursor-pointer w-full flex items-center justify-between gap-2 min-h-11 text-left font-semibold text-foret focus-visible:outline-2 focus-visible:outline-or rounded-lg"
                @click="detailOuvert = !detailOuvert">
                <span>Détailler produit par produit <span class="font-normal text-gris">(facultatif)</span></span>
                <svg :class="['w-5 h-5 shrink-0', detailOuvert && 'rotate-180']" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
              </button>
              <ul v-show="detailOuvert" id="detail-produits" class="mt-2 divide-y divide-creme2">
                <li v-for="p in produits" :key="p.id" class="py-3">
                  <div role="group" :aria-labelledby="`avis-${p.id}`" class="sm:flex sm:items-center sm:justify-between sm:gap-3">
                    <p :id="`avis-${p.id}`" class="text-sm font-semibold text-noir mb-2 sm:mb-0">{{ p.nom }}</p>
                    <div class="grid grid-cols-4 gap-1.5 sm:w-96 shrink-0">
                      <button
                        v-for="a in AVIS_PRODUIT" :key="a.valeur" type="button"
                        :aria-pressed="avisProduits[p.id] === a.valeur"
                        :class="['cursor-pointer min-h-11 px-1 rounded-xl border-2 text-xs font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-or',
                                 avisProduits[p.id] === a.valeur ? 'bg-foret border-foret text-white' : 'bg-white border-creme2 text-noir']"
                        @click="choisirAvis(p.id, a.valeur)"
                      >{{ a.libelle }}</button>
                    </div>
                  </div>
                  <label v-if="avisProduits[p.id] === 'autre'" class="block mt-2 text-sm text-gris">À la place de quoi ?
                    <input v-model="remplacements[p.id]" :maxlength="LIMITES_ENQUETE.remplacement" :class="champ" />
                  </label>
                </li>
              </ul>
            </div>
          </template>
        </section>

        <!-- 5. Suggestion -->
        <section :class="carte" aria-labelledby="titre-suggestion">
          <h2 id="titre-suggestion" :class="titre">Une suggestion, une remarque ?</h2>
          <label for="enquete-suggestion" class="sr-only">Ta suggestion ou ta remarque</label>
          <textarea id="enquete-suggestion" v-model="suggestion" rows="4" :maxlength="LIMITES_ENQUETE.suggestion" :class="[champ, 'mt-3 resize-y']"></textarea>
          <p class="text-right text-xs text-gris">{{ suggestion.length }} / {{ LIMITES_ENQUETE.suggestion }}</p>
        </section>

        <!-- 6. Contact facultatif -->
        <section :class="[carte, 'space-y-3']" aria-labelledby="titre-contact">
          <h2 id="titre-contact" :class="titre">Être recontacté <span class="font-body text-sm font-normal text-gris">(facultatif)</span></h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label :class="etiquette">Prénom
              <input v-model="contact.prenom" :maxlength="LIMITES_ENQUETE.prenom" autocomplete="given-name" :class="champ" />
            </label>
            <label :class="etiquette">Téléphone
              <input v-model="contact.telephone" type="tel" inputmode="tel" autocomplete="tel" placeholder="Ex : 01 97 00 00 00" :class="champ" />
            </label>
          </div>
          <label class="flex items-start gap-2.5 text-sm text-noir cursor-pointer">
            <input id="enquete-accord" v-model="contact.accordRecontact" type="checkbox" class="accent-foret w-5 h-5 mt-0.5 shrink-0" />
            J'accepte qu'Ahitché me recontacte au sujet de mes réponses
          </label>
        </section>

        <!-- Champ piège pour les robots : hors écran, ignoré au clavier et par les lecteurs d'écran -->
        <div class="absolute -left-[9999px] w-px h-px overflow-hidden" aria-hidden="true">
          <label>Site web <input v-model="piege" name="site" tabindex="-1" autocomplete="off" /></label>
        </div>

        <p v-if="erreur" role="alert" class="p-3 rounded-xl border border-or bg-white text-sm font-semibold text-noir">{{ erreur }}</p>
        <BaseButton type="submit" class="w-full sm:w-auto" :disabled="envoi" :aria-busy="envoi">
          {{ envoi ? 'Envoi…' : 'Envoyer mes réponses' }}
        </BaseButton>

        <p class="text-xs text-gris leading-relaxed">
          Réponses anonymes si tu ne laisses pas ton numéro. Elles servent seulement à améliorer nos packs et sont effacées au bout d'un an.
          Merci de ne pas indiquer d'information de santé.
          <RouterLink to="/mentions-legales" class="font-semibold text-foret underline underline-offset-2">Mentions légales</RouterLink>
        </p>
      </form>
    </div>
  </div>
</template>
