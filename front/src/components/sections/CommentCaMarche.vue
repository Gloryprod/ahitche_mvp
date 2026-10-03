<script setup lang="ts">
import BaseButton from '../ui/BaseButton.vue'
</script>

<template>
  <section id="comment" class="py-20 bg-white">
    <div class="max-w-6xl mx-auto px-4">
      <div class="text-center mb-16">
        <span class="text-xs font-bold tracking-wider text-savane uppercase bg-savane/10 px-3 py-1 rounded-full">
          Simple &amp; rapide
        </span>
        <h2 class="mt-4 text-4xl md:text-5xl font-display font-bold text-foret leading-tight">
          Commander en<br />
          <em class="font-italic text-savane">3 étapes</em>
        </h2>
      </div>

      <div class="flex flex-col lg:flex-row items-center lg:items-start justify-between gap-8 mb-16">
        
        <div class="flex-1 text-center max-w-sm">
          <div class="relative inline-block mb-4">
            <span class="absolute -top-2 -left-4 text-4xl font-display font-bold text-creme2 select-none z-0">01</span>
            <span class="text-5xl relative z-10" aria-hidden="true">📱</span>
          </div>
          <h3 class="text-xl font-bold text-foret mb-3 font-body">Choisissez votre formule</h3>
          <p class="text-gris text-sm leading-relaxed">
            Essentiel, Équilibré ou Confort selon la taille de votre foyer. Cliquez sur "Commander" — WhatsApp s'ouvre automatiquement.
          </p>
        </div>

        <div class="hidden lg:flex items-center justify-center text-gris-lt text-2xl pt-4 select-none" aria-hidden="true">
          ➔
        </div>

        <div class="flex-1 text-center max-w-sm">
          <div class="relative inline-block mb-4">
            <span class="absolute -top-2 -left-4 text-4xl font-display font-bold text-creme2 select-none z-0">02</span>
            <span class="text-5xl relative z-10" aria-hidden="true">💳</span>
          </div>
          <h3 class="text-xl font-bold text-foret mb-3 font-body">Payez en Mobile Money</h3>
          <p class="text-gris text-sm leading-relaxed">
            MTN MoMo ou Moov Money. Envoyez la capture d'écran sur WhatsApp. Confirmation en moins de 30 minutes.
          </p>
        </div>

        <div class="hidden lg:flex items-center justify-center text-gris-lt text-2xl pt-4 select-none" aria-hidden="true">
          ➔
        </div>

        <div class="flex-1 text-center max-w-sm">
          <div class="relative inline-block mb-4">
            <span class="absolute -top-2 -left-4 text-4xl font-display font-bold text-creme2 select-none z-0">03</span>
            <span class="text-5xl relative z-10" aria-hidden="true">🛵</span>
          </div>
          <h3 class="text-xl font-bold text-foret mb-3 font-body">Recevez à domicile</h3>
          <p class="text-gris text-sm leading-relaxed">
            Votre livreur vous appelle 30 minutes avant d'arriver. Livraison dans les 72h maximum. Zone Calavi Kpota &amp; environs.
          </p>
        </div>

      </div>

      <div class="text-center">
        <BaseButton
          href="https://wa.me/22998136635?text=Bonjour%20Ahitch%C3%A9%20!%20Je%20souhaite%20passer%20ma%20premi%C3%A8re%20commande."
          variant="primary"
          external
        >
          <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.971 0C5.362 0 0 5.373 0 11.994c0 2.117.554 4.103 1.523 5.828L.057 23.882l6.218-1.632A11.946 11.946 0 0011.97 24c6.61 0 11.972-5.373 11.972-11.994C23.942 5.372 18.58 0 11.97 0zm.001 21.818a9.917 9.917 0 01-5.062-1.384l-.363-.216-3.761.987 1.004-3.665-.237-.376a9.918 9.918 0 01-1.523-5.295c0-5.475 4.453-9.934 9.942-9.934 5.488 0 9.941 4.46 9.941 9.934 0 5.476-4.453 9.935-9.941 9.935z" fill-rule="evenodd" clip-rule="evenodd"/>
          </svg>
          Passer ma première commande
        </BaseButton>
      </div>
    </div>
  </section>
</template>