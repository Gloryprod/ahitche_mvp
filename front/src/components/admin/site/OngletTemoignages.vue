<script setup lang="ts">
import CarteTemoignage from '@/components/sections/CarteTemoignage.vue'
import { REGLES_TEMOIGNAGE, jourCotonou, nouvelId, type Temoignage, type TemoignageSite } from '@/services/valeursSite'
import ListeElementsSite from './ListeElementsSite.vue'
import { CLASSES_FORMULAIRE, idChamp, idElement, temoignagesAEnvoyer } from './champsSite'

// Onglet « Témoignages » de l'écran « Site public » (docs-internes/admin/CONTRAT-site-public-D.md) : 6 témoignages au
// plus, chacun avec sa note en étoiles, la date de l'accord de la personne et l'aperçu de la vraie carte de l'accueil.
// Sur le site, ils s'affichent après les avis publiés depuis les espaces clients. Publication et historique : SitePublic.vue.
const temoignages = defineModel<TemoignageSite[]>('temoignages', { required: true })
const props = defineProps<{
  erreur: { champ: string; message: string }
  lectureSeule: boolean
}>()

const aujourdhui = jourCotonou()
const id = (t: TemoignageSite, champ: string) => idChamp(idElement('temoignages', t.id, champ))
const erreurDe = (t: TemoignageSite, champ: string) => (props.erreur.champ === idElement('temoignages', t.id, champ) ? props.erreur.message : '')
// Aide du champ, puis son erreur éventuelle (lue par les lecteurs d'écran)
const decrit = (t: TemoignageSite, champ: string, aide = true) =>
  [aide ? `${id(t, champ)}-aide` : '', erreurDe(t, champ) ? `${id(t, champ)}-erreur` : ''].filter(Boolean).join(' ') || undefined
// Nouvelle carte : aucune note choisie (la note est celle donnée par la personne), date de l'accord à saisir
const creer = (ids: string[]): TemoignageSite => ({ id: nouvelId('temoignage', ids), prenom: '', quartier: '', note: 0, texte: '', accordLe: '', visible: true })

// Aperçu : textes nettoyés comme à l'envoi
function apercu(t: TemoignageSite): Temoignage {
  const e = temoignagesAEnvoyer([t])[0]!
  return { prenom: e.prenom || 'Prénom', quartier: e.quartier, note: e.note, texte: e.texte || 'Le texte du témoignage apparaîtra ici.' }
}

// Une ligne : Entrée ne crée pas de retour à la ligne (le serveur les refuse)
const sansRetourLigne = (e: KeyboardEvent) => { if (e.key === 'Enter') e.preventDefault() }
const etoiles = (n: number) => `${n} étoile${n > 1 ? 's' : ''} sur 5`
</script>

<template>
  <div class="space-y-3">
    <p v-if="!temoignages.length" class="text-xs p-2.5 rounded-xl bg-creme text-noir">Aucun témoignage : seuls les avis publiés depuis les espaces clients s'affichent sur l'accueil.</p>
    <ListeElementsSite
      v-model:liste="temoignages"
      prefixe="temoignages"
      nom="témoignage"
      masculin
      :max="REGLES_TEMOIGNAGE.max"
      :lecture-seule="lectureSeule"
      :champ-erreur="erreur.champ"
      :titre="t => t.prenom"
      :creer="creer"
    >
      <template #badge="{ element }">
        <span v-if="!element.visible" class="shrink-0 mt-2.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-creme2 text-noir">Masqué</span>
      </template>
      <template #panneau="{ element, index }">
        <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-4 items-start">
          <div class="space-y-3 min-w-0">
            <label :for="id(element, 'visible')" class="flex items-center gap-3 min-h-11 p-3 rounded-xl border cursor-pointer" :class="element.visible ? 'border-foret bg-foret/5' : 'border-creme2'">
              <input :id="id(element, 'visible')" v-model="element.visible" type="checkbox" class="w-5 h-5 accent-foret" :aria-describedby="decrit(element, 'visible', false)" />
              <span><strong class="text-noir">Afficher sur le site</strong><span class="block text-xs">Masqué : gardé ici, mais absent de l'accueil.</span></span>
            </label>
            <p v-if="erreurDe(element, 'visible')" :id="`${id(element, 'visible')}-erreur`" :class="CLASSES_FORMULAIRE.erreur">{{ erreurDe(element, 'visible') }}</p>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div class="min-w-0">
                <label :for="id(element, 'prenom')" :class="CLASSES_FORMULAIRE.etiquette">Prénom *</label>
                <input :id="id(element, 'prenom')" v-model="element.prenom" type="text" required :maxlength="REGLES_TEMOIGNAGE.prenom.max" autocomplete="off" :class="CLASSES_FORMULAIRE.champ" :aria-invalid="erreurDe(element, 'prenom') ? 'true' : undefined" :aria-describedby="decrit(element, 'prenom')" />
                <p :id="`${id(element, 'prenom')}-aide`" class="mt-1 text-xs flex justify-between gap-2"><span>Le prénom seul, comme la personne l'a accepté.</span><span class="shrink-0 tabular-nums">{{ element.prenom.length }}/{{ REGLES_TEMOIGNAGE.prenom.max }}</span></p>
                <p v-if="erreurDe(element, 'prenom')" :id="`${id(element, 'prenom')}-erreur`" :class="CLASSES_FORMULAIRE.erreur">{{ erreurDe(element, 'prenom') }}</p>
              </div>
              <div class="min-w-0">
                <label :for="id(element, 'quartier')" :class="CLASSES_FORMULAIRE.etiquette">Quartier</label>
                <input :id="id(element, 'quartier')" v-model="element.quartier" type="text" :maxlength="REGLES_TEMOIGNAGE.quartier.max" autocomplete="off" :class="CLASSES_FORMULAIRE.champ" :aria-invalid="erreurDe(element, 'quartier') ? 'true' : undefined" :aria-describedby="decrit(element, 'quartier')" />
                <p :id="`${id(element, 'quartier')}-aide`" class="mt-1 text-xs flex justify-between gap-2"><span>Facultatif.</span><span class="shrink-0 tabular-nums">{{ element.quartier.length }}/{{ REGLES_TEMOIGNAGE.quartier.max }}</span></p>
                <p v-if="erreurDe(element, 'quartier')" :id="`${id(element, 'quartier')}-erreur`" :class="CLASSES_FORMULAIRE.erreur">{{ erreurDe(element, 'quartier') }}</p>
              </div>
            </div>

            <!-- Note : 5 boutons radio dessinés en étoiles (flèches du clavier pour changer) -->
            <fieldset :id="id(element, 'note')" tabindex="-1" :aria-describedby="erreurDe(element, 'note') ? `${id(element, 'note')}-erreur` : undefined">
              <legend :class="CLASSES_FORMULAIRE.etiquette">Note donnée par la personne *</legend>
              <div class="mt-1 flex flex-wrap items-center gap-1">
                <label
                  v-for="n in 5"
                  :key="n"
                  class="cursor-pointer inline-flex items-center justify-center w-11 h-11 rounded-xl hover:bg-creme has-focus-visible:outline-2 has-focus-visible:outline-foret"
                >
                  <input v-model="element.note" type="radio" :name="`note-${element.id}`" :value="n" class="sr-only" />
                  <svg class="w-7 h-7 text-or-deep" :class="n <= element.note ? 'fill-or' : 'fill-white'" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>
                  <span class="sr-only">{{ etoiles(n) }}</span>
                </label>
                <span class="ml-1 text-xs text-noir font-semibold" aria-hidden="true">{{ element.note ? etoiles(element.note) : 'Aucune note choisie' }}</span>
              </div>
              <p v-if="erreurDe(element, 'note')" :id="`${id(element, 'note')}-erreur`" :class="CLASSES_FORMULAIRE.erreur">{{ erreurDe(element, 'note') }}</p>
            </fieldset>

            <div>
              <label :for="id(element, 'texte')" :class="CLASSES_FORMULAIRE.etiquette">Texte du témoignage *</label>
              <textarea :id="id(element, 'texte')" v-model="element.texte" rows="4" required :maxlength="REGLES_TEMOIGNAGE.texte.max" :class="[CLASSES_FORMULAIRE.champ, 'resize-y']" :aria-invalid="erreurDe(element, 'texte') ? 'true' : undefined" :aria-describedby="decrit(element, 'texte')" @keydown="sansRetourLigne"></textarea>
              <p :id="`${id(element, 'texte')}-aide`" class="mt-1 text-xs flex justify-between gap-2"><span>Les mots validés par la personne, sans retouche ; {{ REGLES_TEMOIGNAGE.texte.min }} caractères au moins.</span><span class="shrink-0 tabular-nums">{{ element.texte.length }}/{{ REGLES_TEMOIGNAGE.texte.max }}</span></p>
              <p v-if="erreurDe(element, 'texte')" :id="`${id(element, 'texte')}-erreur`" :class="CLASSES_FORMULAIRE.erreur">{{ erreurDe(element, 'texte') }}</p>
            </div>

            <div class="max-w-xs">
              <label :for="id(element, 'accordLe')" :class="CLASSES_FORMULAIRE.etiquette">Date de l'accord *</label>
              <input :id="id(element, 'accordLe')" v-model="element.accordLe" type="date" required :min="REGLES_TEMOIGNAGE.accordMin" :max="aujourdhui" :class="CLASSES_FORMULAIRE.champ" :aria-invalid="erreurDe(element, 'accordLe') ? 'true' : undefined" :aria-describedby="decrit(element, 'accordLe')" />
              <p :id="`${id(element, 'accordLe')}-aide`" class="mt-1 text-xs">Jour où la personne a validé ce texte et accepté sa publication.</p>
              <p v-if="erreurDe(element, 'accordLe')" :id="`${id(element, 'accordLe')}-erreur`" :class="CLASSES_FORMULAIRE.erreur">{{ erreurDe(element, 'accordLe') }}</p>
            </div>
          </div>

          <!-- Aperçu : la vraie carte de l'accueil -->
          <div class="min-w-0 space-y-2 max-w-[300px] mx-auto lg:mx-0 w-full">
            <p class="text-xs font-bold text-foret uppercase tracking-wider">Aperçu</p>
            <div class="bg-creme rounded-3xl p-3">
              <CarteTemoignage :temoignage="apercu(element)" :rang="index" />
            </div>
            <p v-if="!element.visible" class="text-xs">Masqué : cette carte n'apparaît pas sur l'accueil.</p>
          </div>
        </div>
      </template>
    </ListeElementsSite>
  </div>
</template>
