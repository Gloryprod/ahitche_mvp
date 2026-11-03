<!-- App.vue -->
<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted } from 'vue'
import NavBar from './components/layout/NavBar.vue'
import AppFooter from './components/layout/AppFooter.vue'
import { RouterView, useRoute } from 'vue-router'
import { useAuthStore } from './stores/auth'
import { useDeconnexionInactivite } from './composables/useDeconnexionInactivite'
import { bandeauSite } from './services/contenuSite'

const route = useRoute()
const authStore = useAuthStore()

// Session vérifiée en arrière-plan, sans retarder l'affichage : le menu montre « Mon espace » si l'utilisateur est connecté
onMounted(() => {
  if (!authStore.isInitialized.value) authStore.checkSession()
})

// Comptes de l'équipe (sauf admin principal) : déconnexion après 1 h sans activité, sur toutes les pages
useDeconnexionInactivite()

// Bandeau d'annonce publié depuis l'admin : pages publiques seulement (ni espaces connectés, ni connexion,
// inscription et nouveau mot de passe), chargé à la demande quand une annonce existe
const BandeauAnnonce = defineAsyncComponent(() => import('./components/layout/BandeauAnnonce.vue'))
const PAGES_SANS_BANDEAU = new Set(['login', 'register', 'ResetPassword'])
const bandeau = computed(() => {
  if (!bandeauSite.value || route.matched.length === 0) return null
  if (route.path.startsWith('/dashboard') || PAGES_SANS_BANDEAU.has(String(route.name))) return null
  return bandeauSite.value
})
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <!-- La NavBar reste visible sur toutes les pages -->
    <NavBar v-if="!route.meta.hideNavigation" />

    <!-- Le contenu change dynamiquement ici en fonction de l'URL (zone principale unique de la page) -->
    <main id="contenu" class="grow">
      <RouterView />
    </main>

    <!-- Le Footer reste visible sur toutes les pages -->
    <AppFooter v-if="!route.meta.hideNavigation" />
  </div>
  <BandeauAnnonce v-if="bandeau" :bandeau="bandeau" />
</template>
