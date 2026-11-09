<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { VARIABLES_TEXTE, type NomVariable, type ValeursVariables } from '@/services/valeursSite'
import { CLASSES_FORMULAIRE, idChamp } from './champsSite'

// Texte long qui accepte des variables (réponse d'une question, résumé d'une actualité), avec la liste des variables,
// leur valeur actuelle et un bouton pour en insérer une à l'emplacement du curseur.
const texte = defineModel<string>({ required: true })
const props = defineProps<{
  champ: string // « faq.<id>.reponse »
  libelle: string
  max: number
  erreur: string
  valeurs: ValeursVariables
  aide: string
}>()

const zone = ref<HTMLTextAreaElement | null>(null)
const id = idChamp(props.champ)
const jeton = (nom: string) => `{${nom}}`
const valeurAffichee = (nom: NomVariable) => props.valeurs[nom] || 'vide pour le moment'

async function inserer(nom: NomVariable) {
  const debut = zone.value?.selectionStart ?? texte.value.length
  const fin = zone.value?.selectionEnd ?? texte.value.length
  const insere = jeton(nom)
  texte.value = texte.value.slice(0, debut) + insere + texte.value.slice(fin)
  await nextTick()
  zone.value?.focus()
  zone.value?.setSelectionRange(debut + insere.length, debut + insere.length)
}

// Sur une seule ligne : Entrée ne crée pas de retour à la ligne (le serveur les refuse)
const sansRetourLigne = (e: KeyboardEvent) => { if (e.key === 'Enter') e.preventDefault() }
</script>

<template>
  <div>
    <label :for="id" :class="CLASSES_FORMULAIRE.etiquette">{{ libelle }} *</label>
    <textarea
      :id="id"
      ref="zone"
      v-model="texte"
      rows="4"
      required
      :maxlength="max"
      :class="[CLASSES_FORMULAIRE.champ, 'resize-y']"
      :aria-invalid="erreur ? 'true' : undefined"
      :aria-describedby="`${id}-aide${erreur ? ` ${id}-erreur` : ''}`"
      @keydown="sansRetourLigne"
    ></textarea>
    <p :id="`${id}-aide`" class="mt-1 text-xs flex justify-between gap-2"><span>{{ aide }}</span><span class="shrink-0 tabular-nums">{{ texte.length }}/{{ max }}</span></p>
    <p v-if="erreur" :id="`${id}-erreur`" :class="CLASSES_FORMULAIRE.erreur">{{ erreur }}</p>
    <details class="mt-1">
      <summary class="cursor-pointer inline-flex items-center min-h-11 text-xs font-bold text-savane hover:text-foret">Insérer une variable</summary>
      <p class="text-xs">Remplacée sur le site par la valeur des Infos pratiques.</p>
      <ul class="mt-1 divide-y divide-creme2">
        <li v-for="v in VARIABLES_TEXTE" :key="v.nom" class="py-1.5 flex flex-col min-[420px]:flex-row min-[420px]:items-center gap-1 min-[420px]:gap-3">
          <button type="button" class="cursor-pointer shrink-0 inline-flex items-center justify-center min-h-11 px-3 rounded-xl bg-creme text-foret text-xs font-bold hover:bg-creme2 disabled:opacity-50 disabled:cursor-not-allowed" :aria-label="`Insérer la variable ${v.nom}`" @click="inserer(v.nom)">{{ jeton(v.nom) }}</button>
          <span class="min-w-0 text-xs break-words">{{ v.description }}. <span class="text-noir">Actuellement : {{ valeurAffichee(v.nom) }}.</span></span>
        </li>
      </ul>
    </details>
  </div>
</template>
