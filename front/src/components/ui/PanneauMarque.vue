<script setup lang="ts">
// Panneau de marque des écrans de connexion, d'inscription et de mot de passe (ordinateur uniquement) :
// logo Ahitché sur fond forêt, sans photo (aucune photo à licence vérifiable pour l'instant)
defineProps<{ titre: string; texte: string }>()
</script>

<template>
  <div class="hidden md:flex md:w-1/2 relative bg-foret min-h-112.5 overflow-hidden flex-col items-center justify-center p-10 text-center text-white">
    <div class="absolute rounded-full blur-[80px] w-100 h-100 bg-savane -top-30 -right-30 opacity-40 pointer-events-none" aria-hidden="true"></div>
    <div class="absolute rounded-full blur-[80px] w-80 h-80 bg-or -bottom-30 -left-30 opacity-15 pointer-events-none" aria-hidden="true"></div>
    <img src="/logo-ahitche-512.webp" alt="Ahitché, le marché organisé pour vous" width="176" height="176" class="relative w-44 h-44 drop-shadow-xl" />
    <h3 class="relative font-display text-2xl font-bold mt-8 mb-2">{{ titre }}</h3>
    <p class="relative text-white/85 text-sm max-w-xs">{{ texte }}</p>
  </div>
</template>
