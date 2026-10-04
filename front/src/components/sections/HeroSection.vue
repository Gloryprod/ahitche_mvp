<script setup lang="ts">
import BaseButton from '../ui/BaseButton.vue'
import PhotoAFournir from '../ui/PhotoAFournir.vue'
import { lienWhatsApp, MESSAGES_WHATSAPP, DELAI_LIVRAISON } from '@/config/contact'
import { PRIX_D_APPEL, PRODUITS_INCLUS, formaterPrix } from '@/config/formules'
import { PHOTOS } from '@/config/photos'

// Les trois engagements qui lèvent les freins à la première commande
const reassurances = [
  { texte: 'Paiement à la livraison', icone: 'paiement' },
  { texte: `Livraison sous ${DELAI_LIVRAISON}`, icone: 'livraison' },
  { texte: 'Satisfait ou compensé', icone: 'garantie' },
] as const
</script>

<template>
  <!-- Hero : comprendre l'offre en moins de 5 s (quoi, où, à partir de combien), sans image lourde au chargement -->
  <section id="accueil" class="relative overflow-hidden bg-foret px-6 pt-28 pb-16 md:pt-32 md:pb-24">
    <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
      <div class="absolute rounded-full blur-[80px] w-150 h-150 bg-savane -top-50 -right-37.5 opacity-30"></div>
      <div class="absolute rounded-full blur-[80px] w-100 h-100 bg-or -bottom-30 -left-37.5 opacity-12"></div>
    </div>

    <div class="relative max-w-[1160px] mx-auto grid md:grid-cols-[1.15fr_0.85fr] gap-10 md:gap-14 items-center">
      <div class="text-center md:text-left">
        <p class="inline-flex items-center gap-2 bg-white/12 border border-white/20 text-white text-xs font-semibold px-4 py-1.5 rounded-full mb-6">
          <span class="w-1.75 h-1.75 rounded-full bg-[#4ade80] shadow-[0_0_0_3px_rgba(74,222,128,0.3)]" aria-hidden="true"></span>
          Le marché, organisé pour vous
        </p>

        <h1 class="font-display text-[2.1rem] leading-[1.12] sm:text-5xl lg:text-6xl font-bold text-white mb-5">
          Vos vivres livrés chez vous,
          <em class="text-or not-italic">à Cotonou et <span class="whitespace-nowrap">Abomey-Calavi.</span></em>
        </h1>

        <p class="text-base sm:text-lg text-white/90 mb-8 md:max-w-xl">
          Pour une alimentation suivie et organisée sans stress&nbsp;: {{ PRODUITS_INCLUS.length }} produits de base
          composés selon votre foyer, dès <strong class="text-or font-bold whitespace-nowrap">{{ formaterPrix(PRIX_D_APPEL) }} FCFA</strong>.
        </p>

        <div class="flex flex-col sm:flex-row gap-3 justify-center md:justify-start mb-8">
          <BaseButton :href="lienWhatsApp(MESSAGES_WHATSAPP.commande)" external>
            <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.2.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.2z"/></svg>
            Commander sur WhatsApp
          </BaseButton>
          <BaseButton href="#formules" variant="secondary">
            Voir les formules
          </BaseButton>
        </div>

        <ul class="flex flex-wrap justify-center md:justify-start gap-x-5 gap-y-3">
          <li v-for="r in reassurances" :key="r.texte" class="flex items-center gap-2 text-white text-sm font-semibold">
            <span class="flex items-center justify-center w-8 h-8 rounded-full bg-white/12 text-or" aria-hidden="true">
              <svg v-if="r.icone === 'paiement'" class="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20M6 15h4"/></svg>
              <svg v-else-if="r.icone === 'livraison'" class="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
              <svg v-else class="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>
            </span>
            {{ r.texte }}
          </li>
        </ul>
      </div>

      <!-- Photo de réception à domicile (cadre « PHOTO À FOURNIR » tant qu'elle n'est pas fournie) -->
      <div class="w-full max-w-sm md:max-w-none mx-auto overflow-hidden rounded-3xl ring-1 ring-white/15 shadow-[0_20px_45px_-10px_rgba(0,0,0,0.45)]">
        <PhotoAFournir :photo="PHOTOS.heroReception" tailles="(min-width: 768px) 40vw, 90vw" prioritaire />
      </div>
    </div>
  </section>
</template>
