<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<!-- Sortie vers l'accueil sur les pages affichées sans le menu du site (connexion, inscription, blog…) -->
<template>
  <RouterLink to="/" class="inline-flex items-center gap-1.5 py-2 text-sm font-semibold text-foret hover:text-savane transition-colors">
    <span aria-hidden="true">←</span> Retour à l'accueil
  </RouterLink>
</template>
