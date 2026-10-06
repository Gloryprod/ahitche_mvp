<script setup lang="ts">
import BaseButton from '../ui/BaseButton.vue'
import { lienWhatsApp, MESSAGES_WHATSAPP } from '@/config/contact'
import { TEMOIGNAGES } from '@/config/temoignages'
import { vApparition } from '@/directives/apparition'

// Avatar générique (pas de vrai visage) : initiale sur une couleur de la charte
const COULEURS_AVATAR = ['bg-foret text-or', 'bg-or text-noir', 'bg-savane text-white']
</script>

<template>
  <div>
    <section id="temoignages" class="py-20 bg-creme">
      <div class="max-w-6xl mx-auto px-4">
        <div class="text-center mb-10">
          <span class="text-xs font-bold tracking-wider text-foret uppercase bg-savane/10 px-3 py-1 rounded-full">
            Ils nous font confiance
          </span>
          <h2 class="mt-4 text-4xl md:text-5xl font-display font-bold text-foret leading-tight">
            Ce que disent <em class="font-italic text-savane">nos clients</em>
          </h2>
        </div>

        <!-- Mobile : cartes à faire glisser ; ordinateur : trois colonnes -->
        <ul class="flex md:grid md:grid-cols-3 gap-4 md:gap-6 -mx-4 px-4 md:mx-0 md:px-0 mb-10 overflow-x-auto md:overflow-visible snap-x snap-mandatory scroll-px-4 pb-2 [scrollbar-width:none]">
          <li
            v-for="(t, i) in TEMOIGNAGES"
            :key="t.prenom"
            v-apparition="i * 100"
            class="snap-start shrink-0 w-[85%] sm:w-[60%] md:w-auto"
          >
            <figure class="h-full flex flex-col bg-white rounded-3xl p-6 border border-creme2 shadow-xs">
              <div class="flex items-center gap-1 text-or mb-4" role="img" :aria-label="`Note : ${t.note} sur 5`">
                <svg v-for="n in 5" :key="n" class="w-5 h-5" :class="n <= t.note ? 'fill-current' : 'fill-creme2'" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>
              </div>
              <blockquote class="flex-1 text-noir leading-relaxed mb-6">«&nbsp;{{ t.texte }}&nbsp;»</blockquote>
              <figcaption class="flex items-center gap-3">
                <span :class="['flex items-center justify-center w-11 h-11 rounded-full font-display font-bold text-lg', COULEURS_AVATAR[i % COULEURS_AVATAR.length]]" aria-hidden="true">{{ t.prenom.charAt(0) }}</span>
                <span>
                  <span class="block font-bold text-foret">{{ t.prenom }}</span>
                  <span class="block text-sm text-gris">{{ t.quartier }}</span>
                </span>
              </figcaption>
            </figure>
          </li>
        </ul>

        <!-- Offre client fondateur, en complément des avis -->
        <div class="max-w-3xl mx-auto bg-white rounded-3xl p-6 md:p-8 border border-creme2 flex flex-col md:flex-row items-center gap-4 md:gap-6 text-center md:text-left">
          <p class="flex-1 text-foret">
            Rejoignez nos <strong>premiers clients fondateurs</strong> à Cotonou et Abomey-Calavi&nbsp;:
            <span class="text-gris">prix de lancement bloqué pendant 3 mois.</span>
          </p>
          <BaseButton :href="lienWhatsApp(MESSAGES_WHATSAPP.fondateur)" variant="primary" external class="shrink-0">
            Devenir client fondateur
          </BaseButton>
        </div>
      </div>
    </section>

    <section class="pb-20 bg-creme">
      <div class="max-w-4xl mx-auto px-4">
        <div class="bg-foret text-white rounded-3xl p-8 md:p-10 flex flex-col md:flex-row items-center md:items-start gap-6 shadow-lg">
          <div class="bg-white/10 w-16 h-16 flex items-center justify-center rounded-2xl shrink-0 text-or" aria-hidden="true">
            <svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>
          </div>
          <div class="text-center md:text-left">
            <h3 class="text-xl font-bold font-body text-or mb-2">Garantie Ahitché</h3>
            <p class="text-white/90 text-sm md:text-base leading-relaxed">
              Si un produit de votre formule manque ou arrive abîmé, il est remplacé à l'identique à la prochaine livraison. <strong class="text-white font-bold">Sans discussion.</strong>
            </p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
