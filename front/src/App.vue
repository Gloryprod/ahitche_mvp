<!-- App.vue -->
<script setup lang="ts">
import { onMounted } from 'vue'
import NavBar from './components/layout/NavBar.vue'
import AppFooter from './components/layout/AppFooter.vue'
import { RouterView, useRoute } from 'vue-router'
import { useAuthStore } from './stores/auth'
import { useDeconnexionInactivite } from './composables/useDeconnexionInactivite'

const route = useRoute()
const authStore = useAuthStore()

// Session vérifiée en arrière-plan, sans retarder l'affichage : le menu montre « Mon espace » si l'utilisateur est connecté
onMounted(() => {
  if (!authStore.isInitialized.value) authStore.checkSession()
})

// Comptes de l'équipe (sauf admin principal) : déconnexion après 1 h sans activité, sur toutes les pages
useDeconnexionInactivite()
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
