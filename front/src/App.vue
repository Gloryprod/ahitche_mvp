<!-- App.vue -->
<script setup lang="ts">
import NavBar from './components/layout/NavBar.vue'
import AppFooter from './components/layout/AppFooter.vue'
import { RouterView, useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <!-- La NavBar reste visible sur toutes les pages -->
    <NavBar v-if="!route.meta.hideNavigation" />

    <!-- Le contenu change dynamiquement ici en fonction de l'URL -->
    <div class="grow">
      <RouterView />
    </div>

    <!-- Le Footer reste visible sur toutes les pages -->
    <AppFooter v-if="!route.meta.hideNavigation" />
  </div>
</template>