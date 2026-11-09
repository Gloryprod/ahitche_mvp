<script setup lang="ts">
import type { IconeActualite } from '@/services/valeursSite'

// Icône d'une carte « Actualités » : scooter de livraison (lancement), bâtiment (partenaire), groupe (communauté).
// Décorative : le texte de la carte suffit.
defineProps<{ icone: IconeActualite }>()
</script>

<template>
  <svg v-if="icone === 'lancement'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M9 17h6l-3-7H8M15 6h3l3 8M12 10h5"/></svg>
  <svg v-else-if="icone === 'partenaire'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h18M5 21V10M19 21V10M9 21v-7M15 21v-7M2 10l10-6 10 6z"/></svg>
  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18.5 20a6.5 6.5 0 0 0-3-5.5"/></svg>
</template>
