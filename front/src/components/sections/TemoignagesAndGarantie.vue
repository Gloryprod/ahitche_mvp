<script setup lang="ts">
import BaseButton from '../ui/BaseButton.vue'

// Prêt pour la v2 : Décommenter pour injecter de vrais témoignages
/*
const temoignages = [
  {
    prenom: "Amina",
    quartier: "Calavi Kpota",
    formule: "AHI ÉQUILIBRÉ",
    note: 5,
    citation: "Ils m'ont livré à Kpota en moins de 24h. Tout était complet et bien emballé !",
    couleur: "#1A5C38"
  },
  {
    prenom: "Kofi",
    quartier: "Godomey",
    formule: "AHI ESSENTIEL",
    note: 5,
    citation: "Enfin un service sérieux à Abomey-Calavi. Plus besoin de courir au marché.",
    couleur: "#2E7D4F"
  }
]
*/
</script>

<template>
  <div>
    <section id="temoignages" class="py-20 bg-creme">
      <div class="max-w-6xl mx-auto px-4">
        <div class="text-center mb-12">
          <span class="text-xs font-bold tracking-wider text-savane uppercase bg-savane/10 px-3 py-1 rounded-full">
            Ils nous font confiance
          </span>
          <h2 class="mt-4 text-4xl md:text-5xl font-display font-bold text-foret leading-tight">
            Ce que disent<br />
            <em class="font-italic text-savane">nos clients</em>
          </h2>
        </div>

        <div class="max-w-2xl mx-auto">
          <div class="bg-white rounded-3xl p-8 md:p-10 border border-creme2 text-center shadow-xs">
            <span class="text-4xl block mb-4" aria-hidden="true">🏠</span>
            <p class="text-lg text-foret font-body mb-2">
              Soyez parmi nos <strong>premiers clients fondateurs</strong> à Cotonou et Abomey-Calavi.
            </p>
            <p class="text-gris text-sm mb-6 max-w-md mx-auto">
              Commandez dès maintenant et bénéficiez du prix de lancement bloqué pendant 3 mois.
            </p>
            <BaseButton
              href="https://wa.me/22998136635?text=Bonjour%20Ahitch%C3%A9%20!%20Je%20voudrais%20devenir%20client%20fondateur."
              variant="primary"
              external
            >
              Devenir client fondateur
            </BaseButton>
          </div>
        </div>
      </div>
    </section>

    <section class="pb-20 bg-creme">
      <div class="max-w-4xl mx-auto px-4">
        <div class="bg-foret text-white rounded-3xl p-8 md:p-10 flex flex-col md:flex-row items-center md:items-start gap-6 shadow-lg">
          <div class="text-4xl bg-white/10 w-16 h-16 flex items-center justify-center rounded-2xl shrink-0" aria-hidden="true">
            🛡️
          </div>
          <div class="text-center md:text-left">
            <h3 class="text-xl font-bold font-body text-or mb-2">Garantie Ahitché</h3>
            <p class="text-white/90 text-sm md:text-base leading-relaxed">
              Si votre formule est incomplète ou livrée avec plus de 24h de retard, le produit manquant ou un bon de compensation vous est offert à la prochaine livraison. <strong class="text-white font-bold">Sans discussion.</strong>
            </p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>