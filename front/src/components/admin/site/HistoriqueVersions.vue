<script setup lang="ts">
import { computed } from 'vue'
import { Eye, RotateCcw } from 'lucide-vue-next'
import { dateHeure, type Version } from './champsSite'

// Historique d'un contenu de l'écran « Site public » : les 10 dernières publications, à voir ou à republier
const props = defineProps<{ cle: string; versions: Version[]; ecriture: boolean; occupe: boolean }>()
defineEmits<{ voir: [version: Version]; revenir: [version: Version] }>()

const idTitre = computed(() => `titre-historique-${props.cle}`)
const enLigne = (v: Version) => props.versions[0]?._id === v._id
const bouton = 'cursor-pointer inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-xl text-xs font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed bg-creme text-foret hover:bg-creme2'
</script>

<template>
  <section class="bg-white rounded-2xl p-4 space-y-3" :aria-labelledby="idTitre">
    <h2 :id="idTitre" class="font-bold text-noir text-base">Historique (10 dernières publications)</h2>
    <p v-if="!versions.length" class="text-xs">Aucune publication pour l'instant.</p>
    <ul v-else class="divide-y divide-creme2">
      <li v-for="v in versions" :key="v._id" class="py-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
        <p class="flex-1 min-w-0 text-noir">
          {{ dateHeure(v.publieLe) }} <span class="text-gris">par {{ v.publiePar.nom || 'un administrateur' }}</span>
          <span v-if="enLigne(v)" class="ml-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-foret/10 text-foret">En ligne</span>
        </p>
        <div class="flex gap-2">
          <button type="button" :class="bouton" :aria-label="`Voir la version du ${dateHeure(v.publieLe)}`" @click="$emit('voir', v)">
            <Eye class="w-4 h-4" aria-hidden="true" /> Voir
          </button>
          <button v-if="ecriture && !enLigne(v)" type="button" :disabled="occupe" :class="bouton" :aria-label="`Revenir à la version du ${dateHeure(v.publieLe)}`" @click="$emit('revenir', v)">
            <RotateCcw class="w-4 h-4" aria-hidden="true" /> Revenir à cette version
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>
