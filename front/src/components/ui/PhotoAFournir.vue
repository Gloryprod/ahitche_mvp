<script setup lang="ts">
import type { EmplacementPhoto } from '@/config/photos'

// Photo responsive (WebP 400/800/1200 px, chargement différé) ou, sans fichier, cadre « PHOTO À FOURNIR »
withDefaults(defineProps<{
  photo: EmplacementPhoto
  tailles?: string // Attribut sizes : largeur affichée selon l'écran
  prioritaire?: boolean // Photo visible dès l'ouverture de la page : chargée tout de suite
  compact?: boolean // Petit cadre : sujet masqué
}>(), { tailles: '(min-width: 768px) 50vw, 100vw', prioritaire: false, compact: false })
</script>

<template>
  <img
    v-if="photo.fichier"
    :src="`${photo.fichier}-800.webp`"
    :srcset="`${photo.fichier}-400.webp 400w, ${photo.fichier}-800.webp 800w, ${photo.fichier}-1200.webp 1200w`"
    :sizes="tailles"
    :alt="photo.alt ?? ''"
    :loading="prioritaire ? 'eager' : 'lazy'"
    :fetchpriority="prioritaire ? 'high' : 'auto'"
    decoding="async"
    class="w-full h-full object-cover"
    :style="{ aspectRatio: photo.ratio }"
  />
  <div
    v-else
    aria-hidden="true"
    class="w-full flex flex-col items-center justify-center gap-1.5 text-center bg-creme2 border-2 border-dashed border-foret/25 text-foret p-3"
    :style="{ aspectRatio: photo.ratio }"
  >
    <svg class="w-7 h-7 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>
    <span class="text-[11px] font-extrabold tracking-widest uppercase">Photo à fournir</span>
    <template v-if="!compact">
      <span class="text-xs text-gris max-w-60 leading-snug">{{ photo.sujet }}</span>
      <span class="text-[11px] text-gris">{{ photo.cadrage }} · {{ photo.dimensions }}</span>
    </template>
  </div>
</template>
