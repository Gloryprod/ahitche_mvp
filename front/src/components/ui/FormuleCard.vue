<script setup lang="ts">
import { computed } from 'vue'
import BaseButton from './BaseButton.vue'
import { lienWhatsApp as lienWa } from '@/config/contact'
import { formaterPrix, type FormuleVitrine } from '@/config/formules'

const props = defineProps<{ formule: FormuleVitrine }>()

const lienWhatsApp = computed(() => {
  const { nom, prix } = props.formule
  const message = `Bonjour Ahitché ! Je souhaite commander la formule ${nom} (${formaterPrix(prix)} FCFA). Pouvez-vous me confirmer les détails ?`
  return lienWa(message)
})
</script>

<template>
  <div
    :class="[
      'flex flex-col justify-between bg-white rounded-3xl p-8 transition-all duration-300',
      formule.recommandee
        ? 'relative border-2 border-or shadow-xl hover:shadow-2xl md:-translate-y-4'
        : 'border border-creme2 shadow-sm hover:shadow-md'
    ]"
  >
    <div v-if="formule.recommandee" class="absolute -top-4 left-1/2 -translate-x-1/2 bg-or text-foret text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider shadow-sm">
      <span aria-hidden="true">⭐</span> Le plus choisi
    </div>
    <div>
      <div :class="['flex items-center gap-4 mb-4', formule.recommandee ? 'mt-2' : '']">
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
        <span class="block text-sm text-gris-lt line-through">{{ formaterPrix(formule.ancienPrix) }} FCFA</span>
        <span class="text-3xl font-bold text-foret font-body">{{ formaterPrix(formule.prix) }} <small class="text-sm font-semibold">FCFA</small></span>
      </div>
      <BaseButton
        :href="lienWhatsApp"
        :variant="formule.recommandee ? 'primary' : 'secondary'"
        external
        class="w-full"
      >
        Commander — WhatsApp
      </BaseButton>
    </div>
  </div>
</template>
