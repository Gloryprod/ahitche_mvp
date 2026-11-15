<script setup lang="ts">
import { computed } from 'vue'
import PhotoAFournir from '../ui/PhotoAFournir.vue'
import { PHOTOS_FRISE, TITRES_FRISE, type PhotosFrise } from '@/config/photos'
import { LIVRAISON_ANNONCE } from '@/config/contact'
import { valeursSiteConnues } from '@/services/contenuSite'
import { vApparition } from '@/directives/apparition'

// Le chemin des vivres en 5 étapes : rendre la chaîne visible pour justifier la qualité et le prix.
// Photos : celles publiées depuis l'admin (écran « Site public », onglet « Photos »), sinon celles du code. Elles ne
// reçoivent leur adresse qu'une fois les valeurs du site connues (5 s au plus) : place réservée, une seule photo
// téléchargée par étape. Avec « apercu » (écran « Site public ») : les photos passées en propriété, tout de suite, sans ancre.
const props = defineProps<{ photos?: PhotosFrise; apercu?: boolean }>()
const photos = computed(() => props.photos ?? PHOTOS_FRISE.value)
const attente = computed(() => !props.apercu && !valeursSiteConnues.value)

const etapes = computed(() => [
  { icone: 'production', titre: TITRES_FRISE.fermeProduction, texte: 'Nous sélectionnons les produits locaux auprès de producteurs du Bénin : riz, maïs, gari, tomates…', photo: photos.value.fermeProduction },
  { icone: 'recolte', titre: TITRES_FRISE.fermeRecolte, texte: 'Les produits frais sont choisis et triés pour ne garder que ce que nous servirions chez nous.', photo: photos.value.fermeRecolte },
  { icone: 'preparation', titre: TITRES_FRISE.fermePreparation, texte: 'Votre pack est composé selon la taille de votre foyer, vérifié puis emballé.', photo: photos.value.fermePreparation },
  { icone: 'livraison', titre: TITRES_FRISE.fermeLivraison, texte: `${LIVRAISON_ANNONCE.value}, chez vous à Cotonou et Abomey-Calavi ; le livreur vous appelle avant d'arriver.`, photo: photos.value.fermeLivraison },
  { icone: 'reception', titre: TITRES_FRISE.fermeReception, texte: 'Vous payez à la livraison, et nous suivons votre alimentation mois après mois.', photo: photos.value.fermeReception },
] as const)
</script>

<template>
  <section :id="apercu ? undefined : 'ferme'" :class="[apercu ? 'py-8' : 'py-20', 'bg-creme']">
    <div class="max-w-[1160px] mx-auto px-6">
      <div class="text-center max-w-2xl mx-auto mb-12">
        <span class="text-xs font-bold tracking-wider text-foret uppercase bg-savane/10 px-3 py-1 rounded-full">Notre engagement</span>
        <h2 class="mt-4 text-3xl sm:text-4xl md:text-5xl font-display font-bold text-foret leading-tight">
          De la ferme <em class="text-savane">à votre porte</em>
        </h2>
        <p class="mt-4 text-gris">Le chemin de vos vivres, en cinq étapes.</p>
      </div>

      <ol class="frise relative grid gap-8 md:grid-cols-5 md:gap-6">
        <!-- Tracé qui relie les étapes : il se dessine au défilement (CSS, navigateurs récents), sinon il est déjà plein -->
        <span class="frise-trace frise-trace-vertical md:hidden absolute left-5.5 top-2 bottom-2 w-0.5 bg-or" aria-hidden="true"></span>
        <span class="frise-trace frise-trace-horizontal hidden md:block absolute top-5.5 left-[10%] right-[10%] h-0.5 bg-or" aria-hidden="true"></span>

        <li
          v-for="(etape, i) in etapes"
          :key="etape.titre"
          v-apparition="i * 90"
          class="relative grid grid-cols-[2.75rem_1fr] gap-4 md:flex md:flex-col md:items-center md:text-center md:gap-3 md:h-full"
        >
          <span class="relative z-1 flex items-center justify-center w-11 h-11 rounded-full bg-foret text-or ring-4 ring-creme" aria-hidden="true">
            <svg v-if="etape.icone === 'production'" class="w-5.5 h-5.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21v-9M12 12c0-4 3-7 8-7 0 5-3 7-8 7zM12 15c0-3-2.5-5.5-7-5.5 0 4 2.5 5.5 7 5.5z"/></svg>
            <svg v-else-if="etape.icone === 'recolte'" class="w-5.5 h-5.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10h18l-2 10H5zM7 10l3-6M17 10l-3-6M9 14v3M15 14v3M12 14v3"/></svg>
            <svg v-else-if="etape.icone === 'preparation'" class="w-5.5 h-5.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/></svg>
            <svg v-else-if="etape.icone === 'livraison'" class="w-5.5 h-5.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M9 17h6l-3-7H8M15 6h3l3 8M12 10h5"/></svg>
            <svg v-else class="w-5.5 h-5.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6"/></svg>
          </span>
          <div class="md:flex md:flex-col md:items-center md:flex-1">
            <p class="text-xs font-bold text-savane uppercase tracking-wider">Étape {{ i + 1 }}</p>
            <h3 class="text-lg font-bold text-foret mb-1.5">{{ etape.titre }}</h3>
            <p class="text-sm text-gris leading-relaxed mb-3">{{ etape.texte }}</p>
            <div class="w-full max-w-48 md:max-w-60 md:mt-auto rounded-2xl overflow-hidden">
              <PhotoAFournir :photo="etape.photo" tailles="(min-width: 768px) 18vw, 60vw" compact :attente="attente" />
            </div>
          </div>
        </li>
      </ol>
    </div>
  </section>
</template>
