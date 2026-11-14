<script setup lang="ts">
import { CLASSES_FORMULAIRE, idChamp } from './champsSite'

// Lien facultatif d'une question ou d'une carte : texte et adresse. Deux champs vides : pas de lien.
const texte = defineModel<string>('texte', { required: true })
const vers = defineModel<string>('vers', { required: true })
const props = defineProps<{
  base: string // « faq.<id> »
  maxTexte: number
  exempleVers: string
  aide: string
  erreurTexte: string
  erreurVers: string
}>()

const idTexte = idChamp(`${props.base}.lien.texte`)
const idVers = idChamp(`${props.base}.lien.vers`)
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <div class="min-w-0">
      <label :for="idTexte" :class="CLASSES_FORMULAIRE.etiquette">Texte du lien</label>
      <input :id="idTexte" v-model="texte" type="text" :maxlength="maxTexte" autocomplete="off" :class="CLASSES_FORMULAIRE.champ" :aria-invalid="erreurTexte ? 'true' : undefined" :aria-describedby="erreurTexte ? `${idTexte}-erreur` : undefined" />
      <p v-if="erreurTexte" :id="`${idTexte}-erreur`" :class="CLASSES_FORMULAIRE.erreur">{{ erreurTexte }}</p>
    </div>
    <div class="min-w-0">
      <label :for="idVers" :class="CLASSES_FORMULAIRE.etiquette">Adresse du lien</label>
      <input :id="idVers" v-model="vers" type="text" inputmode="url" maxlength="300" autocomplete="off" :placeholder="exempleVers" :class="CLASSES_FORMULAIRE.champ" :aria-invalid="erreurVers ? 'true' : undefined" :aria-describedby="`${idVers}-aide${erreurVers ? ` ${idVers}-erreur` : ''}`" />
      <p v-if="erreurVers" :id="`${idVers}-erreur`" :class="CLASSES_FORMULAIRE.erreur">{{ erreurVers }}</p>
    </div>
    <p :id="`${idVers}-aide`" class="text-xs sm:col-span-2">Facultatif. {{ aide }}</p>
  </div>
</template>
