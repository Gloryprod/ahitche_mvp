<script setup lang="ts">
import { computed } from 'vue'
import BaseButton from './BaseButton.vue'
import { lienWhatsApp as lienWa } from '@/config/contact'
import { formaterPrix, type FormuleVitrine } from '@/config/formules'

const props = defineProps<{
  formule: FormuleVitrine
  valeurEstimee?: number | null // D-03 : matières × coefficient, affichée barrée au-dessus du prix
  conseillee?: boolean // Formule conseillée par le comparateur « taille du foyer »
  autreConseillee?: boolean // Une autre formule est conseillée : « Le plus choisi » s'efface
}>()

const lienWhatsApp = computed(() => {
  const { nom, prix } = props.formule
  const message = `Bonjour Ahitché ! Je souhaite commander la formule ${nom} (${formaterPrix(prix)} FCFA). Pouvez-vous me confirmer les détails ?`
  return lienWa(message)
})

// Prix barré seulement s'il dépasse le prix de vente
const prixBarre = computed(() => (props.valeurEstimee && props.valeurEstimee > props.formule.prix ? props.valeurEstimee : null))

// Mise en avant : la formule conseillée pour le foyer choisi, sinon la plus choisie
const enAvant = computed(() => props.conseillee || (props.formule.recommandee && !props.autreConseillee))
</script>

<template>
  <div
    :class="[
      'relative flex flex-col justify-between bg-white rounded-3xl p-6 sm:p-8 transition-all duration-300',
      enAvant ? 'border-2 border-or shadow-xl hover:shadow-2xl' : 'border border-creme2 shadow-sm hover:shadow-md',
      conseillee ? 'ring-4 ring-or/30' : ''
    ]"
  >
    <div v-if="enAvant" class="absolute -top-4 left-1/2 -translate-x-1/2 bg-or text-noir text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider shadow-sm whitespace-nowrap">
      {{ conseillee ? 'Conseillé pour votre foyer' : 'Le plus choisi' }}
    </div>
    <div>
      <div :class="['flex items-center gap-4 mb-4', enAvant ? 'mt-2' : '']">
        <span class="text-3xl" aria-hidden="true">{{ formule.emoji }}</span>
        <div>
          <h3 class="text-xl font-bold text-foret font-body tracking-tight">{{ formule.nom }}</h3>
          <p class="text-sm text-gris">{{ formule.cible }}</p>
        </div>
      </div>
      <p class="text-sm italic text-gris mb-6">« {{ formule.accroche }} »</p>

      <div class="grid grid-cols-2 gap-4 border-y border-creme2 py-4 mb-6">
        <div>
          <span class="block text-2xl font-bold text-foret font-body">{{ formule.repas }}</span>
          <span class="text-xs text-gris">repas possibles</span>
        </div>
        <div>
          <span class="block text-2xl font-bold text-foret font-body">{{ formule.heures }}</span>
          <span class="text-xs text-gris">économisées</span>
        </div>
      </div>
    </div>

    <div>
      <div class="mb-6">
        <span v-if="prixBarre" class="block text-sm text-gris">valeur estimée <s class="whitespace-nowrap">{{ formaterPrix(prixBarre) }} FCFA</s></span>
        <span class="text-3xl font-bold text-foret font-body">{{ formaterPrix(formule.prix) }} <small class="text-sm font-semibold">FCFA</small></span>
        <span class="block text-sm text-gris mt-1">par semaine</span>
      </div>
      <BaseButton
        :href="lienWhatsApp"
        :variant="enAvant ? 'primary' : 'secondary'"
        external
        class="w-full"
      >
        <svg class="w-5 h-5 fill-current shrink-0" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.2.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.2z"/></svg>
        Commander<span class="sr-only"> {{ formule.nom }} sur WhatsApp</span>
      </BaseButton>
    </div>
  </div>
</template>
