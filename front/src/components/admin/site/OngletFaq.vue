<script setup lang="ts">
import { computed } from 'vue'
import FaqSection from '@/components/sections/FaqSection.vue'
import { REGLES_FAQ, lienFaqValide, nouvelId, remplacerVariables, type QuestionFaq, type ValeursVariables } from '@/services/valeursSite'
import ChampAvecVariables from './ChampAvecVariables.vue'
import ChampsLien from './ChampsLien.vue'
import ListeElementsSite from './ListeElementsSite.vue'
import { CLASSES_FORMULAIRE, AIDE_LIEN_FAQ, faqAEnvoyer, idChamp, idElement, type QuestionFormulaire } from './champsSite'

// Onglet « Questions fréquentes » de l'écran « Site public » (docs-internes/admin/CONTRAT-site-public-C.md) : une
// carte repliable par question et l'aperçu de la vraie section de l'accueil, variables remplacées.
// Publication, confirmation et historique : SitePublic.vue.
const questions = defineModel<QuestionFormulaire[]>('questions', { required: true })
const props = defineProps<{
  erreur: { champ: string; message: string }
  lectureSeule: boolean
  valeurs: ValeursVariables // Valeurs des variables d'après les infos publiées
}>()

const erreurDe = (id: string, champ: string) => (props.erreur.champ === idElement('faq', id, champ) ? props.erreur.message : '')
const creer = (ids: string[]): QuestionFormulaire => ({ id: nouvelId('question', ids), question: '', reponse: '', visible: true, lien: { texte: '', vers: '' } })

// Aperçu : questions affichées, nettoyées comme à l'envoi ; un lien n'apparaît que s'il est valide
const apercu = computed<QuestionFaq[]>(() => faqAEnvoyer(questions.value)
  .filter(q => q.visible)
  .map(q => ({
    ...q,
    question: q.question || 'Votre question',
    reponse: q.reponse ? remplacerVariables(q.reponse, props.valeurs) : 'Votre réponse apparaîtra ici.',
    lien: q.lien && q.lien.texte && lienFaqValide(q.lien.vers) ? q.lien : null,
  })))
</script>

<template>
  <div class="space-y-5">
    <ListeElementsSite
      v-model:liste="questions"
      prefixe="faq"
      nom="question"
      :max="REGLES_FAQ.max"
      :lecture-seule="lectureSeule"
      :champ-erreur="erreur.champ"
      :titre="q => q.question"
      :creer="creer"
    >
      <template #badge="{ element }">
        <span v-if="!element.visible" class="shrink-0 mt-2.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-creme2 text-noir">Masquée</span>
      </template>
      <template #panneau="{ element }">
        <div class="space-y-3">
          <label class="flex items-center gap-3 min-h-11 p-3 rounded-xl border cursor-pointer" :class="element.visible ? 'border-foret bg-foret/5' : 'border-creme2'">
            <input v-model="element.visible" type="checkbox" class="w-5 h-5 accent-foret" />
            <span><strong class="text-noir">Afficher sur le site</strong><span class="block text-xs">Masquée : gardée ici, mais ni affichée ni donnée à Google.</span></span>
          </label>
          <div>
            <label :for="idChamp(idElement('faq', element.id, 'question'))" :class="CLASSES_FORMULAIRE.etiquette">Question *</label>
            <input :id="idChamp(idElement('faq', element.id, 'question'))" v-model="element.question" type="text" required :maxlength="REGLES_FAQ.question.max" autocomplete="off" :class="CLASSES_FORMULAIRE.champ" :aria-invalid="erreurDe(element.id, 'question') ? 'true' : undefined" :aria-describedby="`${idChamp(idElement('faq', element.id, 'question'))}-aide${erreurDe(element.id, 'question') ? ` ${idChamp(idElement('faq', element.id, 'question'))}-erreur` : ''}`" />
            <p :id="`${idChamp(idElement('faq', element.id, 'question'))}-aide`" class="mt-1 text-xs text-right tabular-nums">{{ element.question.length }}/{{ REGLES_FAQ.question.max }}</p>
            <p v-if="erreurDe(element.id, 'question')" :id="`${idChamp(idElement('faq', element.id, 'question'))}-erreur`" :class="CLASSES_FORMULAIRE.erreur">{{ erreurDe(element.id, 'question') }}</p>
          </div>
          <ChampAvecVariables
            v-model="element.reponse"
            :champ="idElement('faq', element.id, 'reponse')"
            libelle="Réponse"
            :max="REGLES_FAQ.reponse.max"
            :erreur="erreurDe(element.id, 'reponse')"
            :valeurs="valeurs"
            aide="10 caractères au moins."
          />
          <ChampsLien
            v-model:texte="element.lien.texte"
            v-model:vers="element.lien.vers"
            :base="`faq.${element.id}`"
            :max-texte="REGLES_FAQ.texteLien.max"
            exemple-vers="/mentions-legales"
            :aide="`Sous la réponse : ${AIDE_LIEN_FAQ}`"
            :erreur-texte="erreurDe(element.id, 'lien.texte')"
            :erreur-vers="erreurDe(element.id, 'lien.vers')"
          />
        </div>
      </template>
    </ListeElementsSite>

    <!-- Aperçu : la vraie section de l'accueil, sans ancre ni données structurées -->
    <div class="space-y-2">
      <p class="text-xs font-bold text-foret uppercase tracking-wider">Aperçu</p>
      <div class="rounded-2xl border border-creme2 overflow-hidden">
        <FaqSection :questions="apercu" apercu />
      </div>
    </div>
  </div>
</template>
