<!-- src/views/HomeView.vue -->
<script setup lang="ts">
import HeroSection from '../components/sections/HeroSection.vue'
import ProblemGrid from '../components/sections/ProblemGrid.vue'
import NosFormules from '../components/sections/NosFormules.vue'
import CommentCaMarche from '../components/sections/CommentCaMarche.vue'
import ProduitsSemaine from '../components/sections/ProduitsSemaine.vue'
import TemoignagesAndGarantie from '../components/sections/TemoignagesAndGarantie.vue'
</script>

<template>
  <main>
    <HeroSection />
    <ProblemGrid />
    <NosFormules />
    <CommentCaMarche />
    <ProduitsSemaine />
    <TemoignagesAndGarantie />
  </main>
</template>