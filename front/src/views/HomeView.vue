<!-- src/views/HomeView.vue -->
<script setup lang="ts">
import HeroSection from '../components/sections/HeroSection.vue'
import BandeConfiance from '../components/sections/BandeConfiance.vue'
import FermeAVous from '../components/sections/FermeAVous.vue'
import ProblemGrid from '../components/sections/ProblemGrid.vue'
import NosFormules from '../components/sections/NosFormules.vue'
import CommentCaMarche from '../components/sections/CommentCaMarche.vue'
import ProduitsSemaine from '../components/sections/ProduitsSemaine.vue'
import TemoignagesAndGarantie from '../components/sections/TemoignagesAndGarantie.vue'
import FaqSection from '../components/sections/FaqSection.vue'
import ActionsFlottantes from '../components/layout/ActionsFlottantes.vue'
</script>

<!-- Ordre validé pour la refonte : comprendre, être rassuré, voir la chaîne, choisir, commander -->
<template>
  <main>
    <HeroSection />
    <BandeConfiance />
    <FermeAVous />
    <NosFormules />
    <CommentCaMarche />
    <ProblemGrid />
    <ProduitsSemaine />
    <TemoignagesAndGarantie />
    <FaqSection />
  </main>
  <!-- Commande WhatsApp collante (mobile) et retour en haut de page -->
  <ActionsFlottantes />
</template>
