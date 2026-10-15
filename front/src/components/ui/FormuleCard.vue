<script setup lang="ts">
import { computed } from 'vue'
import BaseButton from './BaseButton.vue'
import { lienWhatsApp as lienWa } from '@/config/contact'
import { formaterPrix, type FormuleVitrine, type TeinteFormule } from '@/config/formules'

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

// Couleurs de chaque pack (classes écrites en entier pour que Tailwind les génère).
// Contrastes du texte ≥ 4,5 : 1 : savane sur fond clair, blanc sur forêt, or et blanc sur noir.
const THEMES: Record<TeinteFormule, {
  bandeau: string; pastille: string; titre: string; cible: string
  accent: string; bordure: string; niveauPlein: string; niveauVide: string; lisere: boolean
}> = {
  savane: {
    bandeau: 'bg-savane/10', pastille: 'bg-white shadow-sm', titre: 'text-savane', cible: 'text-gris',
    accent: 'text-savane', bordure: 'border-savane/25', niveauPlein: 'bg-savane', niveauVide: 'bg-savane/20', lisere: false,
  },
  foret: {
    bandeau: 'bg-foret', pastille: 'bg-creme shadow-sm', titre: 'text-white', cible: 'text-white/80',
    accent: 'text-foret', bordure: 'border-foret/25', niveauPlein: 'bg-or', niveauVide: 'bg-white/25', lisere: false,
  },
  or: {
    bandeau: 'bg-noir', pastille: 'bg-or/15 ring-1 ring-or/50', titre: 'text-or', cible: 'text-white/75',
    accent: 'text-noir', bordure: 'border-or/40', niveauPlein: 'bg-or', niveauVide: 'bg-white/20', lisere: true,
  },
}
const theme = computed(() => THEMES[props.formule.teinte])
</script>

<template>
  <div
    :class="[
      'carte-formule relative flex flex-col bg-white rounded-3xl transition-all duration-300',
      enAvant ? 'border-2 border-or shadow-xl hover:shadow-2xl' : ['border shadow-sm hover:shadow-lg', theme.bordure],
      conseillee ? 'carte-conseillee ring-4 ring-or/30' : ''
    ]"
  >
    <div v-if="enAvant" class="absolute -top-4 left-1/2 -translate-x-1/2 z-10 bg-or text-noir text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider shadow-sm whitespace-nowrap">
      {{ conseillee ? 'Conseillé pour votre foyer' : 'Le plus choisi' }}
    </div>

    <!-- En-tête aux couleurs du pack, avec sa jauge de niveau de confort -->
    <div :class="['bandeau relative overflow-hidden rounded-t-[22px] px-6 sm:px-8 pt-7 pb-5', theme.bandeau]">
      <span v-if="theme.lisere" class="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-or-deep via-or to-or-deep" aria-hidden="true"></span>
      <!-- Jauge dans le coin : le nom du pack garde toute la largeur sur téléphone -->
      <div :class="['absolute right-5 sm:right-7 flex gap-1', enAvant ? 'top-5' : 'top-3.5']" aria-hidden="true">
        <span
          v-for="n in 3"
          :key="n"
          :style="{ '--i': n, '--carte': formule.niveau }"
          :class="['niveau-barre block h-1.5 w-4 rounded-full', n <= formule.niveau ? theme.niveauPlein : theme.niveauVide]"
        ></span>
      </div>
      <div class="flex items-center gap-3 min-w-0">
        <span :class="['flex items-center justify-center w-12 h-12 rounded-2xl text-2xl shrink-0', theme.pastille]" aria-hidden="true">{{ formule.emoji }}</span>
        <div class="min-w-0">
          <h3 :class="['text-xl font-bold font-body tracking-tight', theme.titre]">{{ formule.nom }}</h3>
          <p :class="['text-sm', theme.cible]">{{ formule.cible }}</p>
        </div>
      </div>
      <span class="sr-only">Niveau de confort {{ formule.niveau }} sur 3</span>
    </div>

    <div class="flex flex-col justify-between flex-1 px-6 sm:px-8 pt-5 pb-6 sm:pb-8">
      <div>
        <p class="text-sm italic text-gris mb-6">« {{ formule.accroche }} »</p>

        <div class="grid grid-cols-2 gap-4 border-y border-creme2 py-4 mb-6">
          <div>
            <span :class="['block text-2xl font-bold font-body', theme.accent]">{{ formule.repas }}</span>
            <span class="text-xs text-gris">repas possibles</span>
          </div>
          <div>
            <span :class="['block text-2xl font-bold font-body', theme.accent]">{{ formule.heures }}</span>
            <span class="text-xs text-gris">économisées</span>
          </div>
        </div>
      </div>

      <div>
        <div class="mb-6">
          <span v-if="prixBarre" class="block text-sm text-gris">valeur estimée <s class="whitespace-nowrap">{{ formaterPrix(prixBarre) }} FCFA</s></span>
          <span :class="['text-3xl font-bold font-body', theme.accent]">{{ formaterPrix(formule.prix) }} <small class="text-sm font-semibold">FCFA</small></span>
          <span class="block text-sm text-gris mt-1">par mois</span>
        </div>
        <BaseButton
          :href="lienWhatsApp"
          :data-mesure="`formule-${formule.slug}`"
          :variant="enAvant ? 'primary' : 'secondary'"
          external
          class="w-full"
        >
          <svg class="w-5 h-5 fill-current shrink-0" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.2.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.2z"/></svg>
          Commander<span class="sr-only"> {{ formule.nom }} sur WhatsApp</span>
        </BaseButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.niveau-barre {
  transform-origin: left center;
}

/* Animations seulement si l'utilisateur ne demande pas à les réduire ; sinon la carte est complète d'emblée */
@media (prefers-reduced-motion: no-preference) {
  /* Jauge : les barres se remplissent l'une après l'autre quand la rangée de cartes apparaît (v-apparition) */
  .apparition:not(.apparition-visible) .niveau-barre {
    transform: scaleX(0);
  }
  .apparition-visible .niveau-barre {
    animation: remplir 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: calc(250ms + var(--carte) * 200ms + var(--i) * 110ms);
  }

  /* Formule conseillée par le comparateur : une onde dorée part de la carte */
  .carte-conseillee::before {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: inherit;
    border: 3px solid var(--color-or);
    pointer-events: none;
    opacity: 0;
    animation: onde 1s ease-out;
  }

  /* Souris : la carte se soulève et un reflet traverse l'en-tête */
  @media (hover: hover) {
    .carte-formule:hover {
      transform: translateY(-4px);
    }
    .bandeau::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(105deg, transparent 35%, rgb(255 255 255 / 0.22) 50%, transparent 65%);
      transform: translateX(-120%);
      pointer-events: none;
    }
    .carte-formule:hover .bandeau::after {
      transform: translateX(120%);
      transition: transform 0.9s ease;
    }
  }
}

@keyframes remplir {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}
@keyframes onde {
  from { opacity: 0.9; transform: scale(1); }
  to { opacity: 0; transform: scale(1.06); }
}
</style>
