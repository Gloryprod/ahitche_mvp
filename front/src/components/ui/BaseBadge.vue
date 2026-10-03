<script setup lang="ts">
defineProps({
  variant: { type: String, default: 'primary' } // 'primary', 'secondary', 'accent'
})
</script>

<template>
  <span 
    :class="[
      'inline-block text-[11px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full',
      variant === 'primary' ? 'bg-foret/10 text-foret' : '',
      variant === 'secondary' ? 'bg-savane/10 text-savane' : '',
      variant === 'accent' ? 'bg-or text-foret shadow-sm' : ''
    ]"
  >
    <slot />
  </span>
</template>