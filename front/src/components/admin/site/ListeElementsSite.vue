<script setup lang="ts" generic="T extends { id: string }">
import { nextTick, ref, watch } from 'vue'
import Swal from 'sweetalert2'
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2 } from 'lucide-vue-next'
import { STYLE_SWAL } from './champsSite'

// Liste de cartes repliables des onglets « Questions fréquentes » et « Actualités » : ouvrir, monter, descendre,
// supprimer (confirmé), ajouter. Chaque déplacement est annoncé aux lecteurs d'écran et le focus suit l'élément.
// Les champs d'un élément sont fournis par l'onglet (emplacement « panneau »). Publication : SitePublic.vue.
const liste = defineModel<T[]>('liste', { required: true })
const props = defineProps<{
  prefixe: 'faq' | 'actualites'
  nom: string // « question », « carte » (féminin)
  max: number
  lectureSeule: boolean
  champErreur: string // Champ en erreur (« faq.<id>.reponse ») : sa carte s'ouvre
  titre: (e: T) => string
  creer: (ids: string[]) => T
}>()

const ouverts = ref<Record<string, boolean>>({})
const annonce = ref('')
const idBouton = (action: string, id: string) => `site-${props.prefixe}-${action}-${id}`
const idPanneau = (id: string) => `site-${props.prefixe}-panneau-${id}`
const idAjout = `site-${props.prefixe}-ajouter`
const nomMajuscule = props.nom.charAt(0).toUpperCase() + props.nom.slice(1)
const titreDe = (e: T) => props.titre(e).trim() || `${nomMajuscule} sans titre`

watch(() => props.champErreur, champ => {
  const id = champ.split('.')[1]
  if (id) ouverts.value[id] = true
})

async function deplacer(i: number, sens: -1 | 1) {
  const j = i + sens
  const element = liste.value[i]
  if (!element || !liste.value[j]) return
  const copie = [...liste.value]
  copie[i] = copie[j]!
  copie[j] = element
  liste.value = copie
  annonce.value = `${nomMajuscule} « ${titreDe(element)} » déplacée en position ${j + 1} sur ${copie.length}.`
  await nextTick()
  // Le bouton utilisé reste actif, sauf en bout de liste : le focus passe alors sur l'autre
  const actif = document.getElementById(idBouton(sens < 0 ? 'monter' : 'descendre', element.id)) as HTMLButtonElement | null
  const autre = document.getElementById(idBouton(sens < 0 ? 'descendre' : 'monter', element.id))
  if (actif && !actif.disabled) actif.focus()
  else autre?.focus()
}

async function supprimer(i: number) {
  const element = liste.value[i]
  if (!element) return
  const choix = await Swal.fire({
    ...STYLE_SWAL,
    title: `Supprimer la ${props.nom} ${i + 1} ?`,
    text: `« ${titreDe(element)} » disparaîtra du site à la prochaine publication.`,
    showCancelButton: true, confirmButtonText: 'Supprimer', cancelButtonText: 'Annuler', focusCancel: true,
  })
  if (!choix.isConfirmed) return
  liste.value = liste.value.filter(e => e.id !== element.id)
  annonce.value = `${nomMajuscule} supprimée. ${liste.value.length} restante${liste.value.length > 1 ? 's' : ''}.`
  await nextTick()
  document.getElementById(idAjout)?.focus()
}

async function ajouter() {
  if (liste.value.length >= props.max) return
  const element = props.creer(liste.value.map(e => e.id))
  liste.value = [...liste.value, element]
  ouverts.value[element.id] = true
  annonce.value = `${nomMajuscule} ajoutée en position ${liste.value.length}.`
  await nextTick()
  const panneau = document.getElementById(idPanneau(element.id))
  panneau?.querySelector<HTMLElement>('input[type="text"], textarea')?.focus()
}

const boutonAction = 'cursor-pointer inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-xl text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-creme text-foret hover:bg-creme2'
</script>

<template>
  <div class="space-y-3">
    <p class="sr-only" role="status">{{ annonce }}</p>
    <ol class="space-y-3">
      <li v-for="(e, i) in liste" :key="e.id" class="rounded-2xl border border-creme2 min-w-0">
        <div class="p-2 sm:p-3 space-y-1">
          <div class="flex items-start gap-2">
            <h3 class="flex-1 min-w-0">
              <button
                :id="idBouton('titre', e.id)"
                type="button"
                class="cursor-pointer w-full flex items-center gap-2 min-h-11 px-1 text-left text-sm font-bold text-noir hover:text-foret"
                :aria-expanded="!!ouverts[e.id]"
                :aria-controls="idPanneau(e.id)"
                @click="ouverts[e.id] = !ouverts[e.id]"
              >
                <ChevronDown class="w-4 h-4 shrink-0 text-foret transition-transform motion-reduce:transition-none" :class="ouverts[e.id] ? 'rotate-180' : ''" aria-hidden="true" />
                <span class="shrink-0 tabular-nums text-gris">{{ i + 1 }}.</span>
                <span class="min-w-0 break-words">{{ titreDe(e) }}</span>
              </button>
            </h3>
            <slot name="badge" :element="e" />
          </div>
          <div v-if="!lectureSeule" class="flex flex-wrap gap-2">
            <button :id="idBouton('monter', e.id)" type="button" :disabled="i === 0" :class="boutonAction" :aria-label="`Monter la ${nom} ${i + 1} : ${titreDe(e)}`" @click="deplacer(i, -1)">
              <ArrowUp class="w-4 h-4" aria-hidden="true" /> Monter
            </button>
            <button :id="idBouton('descendre', e.id)" type="button" :disabled="i === liste.length - 1" :class="boutonAction" :aria-label="`Descendre la ${nom} ${i + 1} : ${titreDe(e)}`" @click="deplacer(i, 1)">
              <ArrowDown class="w-4 h-4" aria-hidden="true" /> Descendre
            </button>
            <button type="button" :class="boutonAction" :aria-label="`Supprimer la ${nom} ${i + 1} : ${titreDe(e)}`" @click="supprimer(i)">
              <Trash2 class="w-4 h-4" aria-hidden="true" /> Supprimer
            </button>
          </div>
        </div>
        <div v-show="ouverts[e.id]" :id="idPanneau(e.id)" class="px-3 pb-3 sm:px-4 sm:pb-4 pt-3 border-t border-creme2">
          <fieldset :disabled="lectureSeule" class="min-w-0">
            <legend class="sr-only">{{ nomMajuscule }} {{ i + 1 }}</legend>
            <slot name="panneau" :element="e" :index="i" />
          </fieldset>
        </div>
      </li>
    </ol>
    <div v-if="!lectureSeule">
      <button :id="idAjout" type="button" :disabled="liste.length >= max" class="cursor-pointer inline-flex items-center justify-center gap-1.5 min-h-11 px-4 w-full sm:w-auto rounded-xl border border-foret text-foret text-sm font-bold hover:bg-foret/5 disabled:opacity-50 disabled:cursor-not-allowed" @click="ajouter">
        <Plus class="w-4 h-4" aria-hidden="true" /> Ajouter une {{ nom }}
      </button>
      <p class="mt-1 text-xs">{{ liste.length }} sur {{ max }} au plus.</p>
    </div>
  </div>
</template>
