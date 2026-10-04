<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import FormuleCard from '../ui/FormuleCard.vue'
import {
  FORMULES as formules, PRODUITS_INCLUS as produitsInclus, EXCLUS_ESSENTIEL as exclusEssentiel,
  TAILLES_FOYER, formaterPrix, prixParJour, type TailleFoyer,
} from '@/config/formules'

// Comparateur « taille du foyer » : conseille une formule et la met en avant
const foyer = ref<TailleFoyer | null>(null)
const conseillee = computed(() => formules.find(f => f.foyer === foyer.value) ?? null)
const libelleFoyer = computed(() => TAILLES_FOYER.find(t => t.valeur === foyer.value)?.libelle ?? '')

// Sur mobile, les cartes défilent horizontalement : la formule conseillée est amenée à l'écran
const cartes: HTMLElement[] = [] // Rempli par index, dans l'ordre des formules
async function choisirFoyer(valeur: TailleFoyer) {
  foyer.value = valeur
  await nextTick()
  const index = formules.findIndex(f => f.foyer === valeur)
  const carte = cartes[index]
  const rangee = carte?.parentElement
  if (!carte || !rangee || rangee.scrollWidth <= rangee.clientWidth) return // Ordinateur : les trois cartes sont visibles
  const reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const decalage = carte.getBoundingClientRect().left - rangee.getBoundingClientRect().left
  rangee.scrollTo({ left: rangee.scrollLeft + decalage - (rangee.clientWidth - carte.clientWidth) / 2, behavior: reduit ? 'auto' : 'smooth' })
}
</script>

<template>
  <section id="formules" class="py-20 bg-creme2/40">
    <div class="max-w-6xl mx-auto px-4">
      <div class="text-center mb-10">
        <span class="text-xs font-bold tracking-wider text-savane uppercase bg-savane/10 px-3 py-1 rounded-full">
          Nos formules
        </span>
        <h2 class="mt-4 text-4xl md:text-5xl font-display font-bold text-foret leading-tight">
          Choisissez votre niveau<br />
          <em class="font-italic text-savane">de confort</em>
        </h2>
      </div>

      <!-- Comparateur : taille du foyer → formule conseillée et prix par jour -->
      <fieldset class="max-w-2xl mx-auto mb-10 text-center">
        <legend class="w-full text-base font-bold text-noir mb-4">Combien êtes-vous à la maison ?</legend>
        <div class="flex flex-wrap justify-center gap-2">
          <label v-for="t in TAILLES_FOYER" :key="t.valeur" class="cursor-pointer">
            <input
              type="radio"
              name="taille-foyer"
              class="peer sr-only"
              :value="t.valeur"
              :checked="foyer === t.valeur"
              @change="choisirFoyer(t.valeur)"
            />
            <span class="inline-flex items-center min-h-11 px-5 rounded-full border-2 border-foret/20 bg-white text-sm font-semibold text-foret transition-all duration-200 hover:border-foret peer-checked:bg-foret peer-checked:border-foret peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-or active:scale-97">
              {{ t.libelle }}
            </span>
          </label>
        </div>
        <p class="mt-4 min-h-12 text-sm text-gris" aria-live="polite">
          <Transition name="fondu" mode="out-in">
            <span v-if="conseillee" :key="conseillee.nom">
              Pour {{ libelleFoyer }}, nous conseillons <strong class="text-foret">{{ conseillee.nom }}</strong> :
              {{ formaterPrix(conseillee.prix) }} FCFA par mois, soit environ
              <strong class="text-foret whitespace-nowrap">{{ formaterPrix(prixParJour(conseillee)) }} FCFA par jour</strong>.
            </span>
            <span v-else key="invite">Choisissez la taille de votre foyer : nous vous indiquons la formule adaptée.</span>
          </Transition>
        </p>
      </fieldset>

      <!-- Mobile : cartes côte à côte, à faire glisser ; ordinateur : grille de trois colonnes -->
      <div
        class="flex md:grid md:grid-cols-3 gap-4 md:gap-8 items-stretch overflow-x-auto md:overflow-visible snap-x snap-mandatory -mx-4 px-4 pt-6 pb-4 md:pb-0 mb-12 [scrollbar-width:none]"
        role="list"
        aria-label="Formules Ahitché"
      >
        <div
          v-for="(formule, i) in formules"
          :key="formule.nom"
          :ref="el => { if (el) cartes[i] = el as HTMLElement }"
          role="listitem"
          class="snap-center shrink-0 w-[85%] sm:w-[60%] md:w-auto flex"
        >
          <FormuleCard
            :formule="formule"
            :conseillee="conseillee?.nom === formule.nom"
            :autre-conseillee="!!conseillee && conseillee.nom !== formule.nom"
            class="w-full"
          />
        </div>
      </div>

      <div class="bg-white rounded-3xl p-8 border border-creme2 text-center max-w-4xl mx-auto shadow-xs">
        <p class="text-foret font-bold mb-2 font-body">Composition adaptée à vos besoins : {{ produitsInclus.length }} produits de base</p>
        <p class="text-gris text-sm mb-6">Les quantités varient selon la formule et la taille de votre foyer.</p>
        <div class="flex flex-wrap justify-center gap-2">
          <span
            v-for="produit in produitsInclus"
            :key="produit"
            class="bg-creme text-foret text-sm font-medium px-4 py-2 rounded-full border border-creme2/60 transition-colors duration-200 hover:bg-creme2"
          >
            {{ produit }}<span v-if="exclusEssentiel.includes(produit)" aria-hidden="true">*</span>
          </span>
        </div>
        <p class="text-gris text-xs mt-5">* Non incluse dans la formule AHI Essentiel.</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.fondu-enter-active,
.fondu-leave-active {
  transition: opacity 0.2s ease;
}
.fondu-enter-from,
.fondu-leave-to {
  opacity: 0;
}
</style>
