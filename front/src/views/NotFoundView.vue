<script setup lang="ts">
import LienAccueil from '@/components/ui/LienAccueil.vue'
import { lienWhatsApp, MESSAGES_WHATSAPP } from '@/config/contact'
</script>

<!-- Adresse inconnue : message clair et sorties vers l'accueil, les formules et WhatsApp -->
<template>
  <section class="min-h-[70vh] bg-creme px-4 pt-32 pb-16">
    <div class="max-w-xl mx-auto bg-white rounded-3xl border border-creme2 p-8 text-center text-gris">
      <p class="font-display text-5xl font-bold text-savane" aria-hidden="true">404</p>
      <h1 class="mt-2 font-display text-3xl font-bold text-foret">Page introuvable</h1>
      <p class="mt-3 leading-relaxed">Cette adresse ne correspond à aucune page du site. Elle a peut-être changé, ou le lien est incomplet.</p>
      <div class="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
        <a href="/#formules" class="inline-flex items-center min-h-11 px-5 rounded-full bg-foret text-white font-semibold">Voir les formules</a>
        <a :href="lienWhatsApp(MESSAGES_WHATSAPP.commande)" target="_blank" rel="noopener noreferrer" class="inline-flex items-center min-h-11 px-5 rounded-full border-2 border-foret text-foret font-semibold">Nous écrire sur WhatsApp</a>
      </div>
      <div class="mt-4"><LienAccueil /></div>
    </div>
  </section>
</template>
