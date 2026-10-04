<script setup lang="ts">
import BaseButton from '../ui/BaseButton.vue'
import { lienWhatsApp, MESSAGES_WHATSAPP, DELAI_LIVRAISON } from '@/config/contact'
import { vApparition } from '@/directives/apparition'

// Trois étapes, la dernière rappelle le paiement à la livraison : lever la peur de payer d'avance
const etapes = [
  {
    icone: 'choisir',
    titre: 'Choisissez votre formule',
    texte: 'Essentiel, Équilibré ou Confort selon la taille de votre foyer. Touchez « Commander » : WhatsApp s\'ouvre avec votre message prêt.',
  },
  {
    icone: 'confirmer',
    titre: 'Confirmez sur WhatsApp',
    texte: 'Nous confirmons avec vous la formule, l\'adresse de livraison et le créneau qui vous arrange.',
  },
  {
    icone: 'recevoir',
    titre: 'Recevez et payez à la livraison',
    texte: `Livraison sous ${DELAI_LIVRAISON} à Cotonou et Abomey-Calavi ; le livreur vous appelle avant d'arriver. Paiement MTN MoMo ou Moov Money à la réception.`,
  },
] as const
</script>

<template>
  <section id="comment" class="py-20 bg-white">
    <div class="max-w-6xl mx-auto px-4">
      <div class="text-center mb-12">
        <span class="text-xs font-bold tracking-wider text-savane uppercase bg-savane/10 px-3 py-1 rounded-full">
          Simple &amp; rapide
        </span>
        <h2 class="mt-4 text-4xl md:text-5xl font-display font-bold text-foret leading-tight">
          Commander en <em class="font-italic text-savane">3 étapes</em>
        </h2>
      </div>

      <ol class="grid gap-5 lg:grid-cols-3 lg:gap-8 mb-12">
        <li
          v-for="(etape, i) in etapes"
          :key="etape.titre"
          v-apparition="i * 100"
          class="flex gap-4 items-start lg:flex-col lg:items-center lg:text-center bg-creme/60 rounded-2xl p-5 lg:p-7"
        >
          <span class="relative shrink-0 flex items-center justify-center w-12 h-12 rounded-2xl bg-foret text-or" aria-hidden="true">
            <svg v-if="etape.icone === 'choisir'" class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M10 18h4M9.5 9.5l1.8 1.8 3.4-3.6"/></svg>
            <svg v-else-if="etape.icone === 'confirmer'" class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.7A8 8 0 1 1 21 12z"/><path d="M9 12h.01M13 12h.01M17 12h.01"/></svg>
            <svg v-else class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7M5 10v10h14V10"/><path d="M9.5 15l2 2 3.5-4"/></svg>
            <span class="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-or text-noir text-xs font-extrabold flex items-center justify-center">{{ i + 1 }}</span>
          </span>
          <div>
            <h3 class="text-lg font-bold text-foret mb-1.5 lg:mt-2">{{ etape.titre }}</h3>
            <p class="text-gris text-sm leading-relaxed">{{ etape.texte }}</p>
          </div>
        </li>
      </ol>

      <div class="text-center">
        <BaseButton :href="lienWhatsApp(MESSAGES_WHATSAPP.premiereCommande)" variant="primary" external>
          <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.2.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.2z"/></svg>
          Passer ma première commande
        </BaseButton>
      </div>
    </div>
  </section>
</template>
