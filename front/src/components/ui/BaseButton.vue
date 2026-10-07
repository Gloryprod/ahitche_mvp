<script setup lang="ts">
defineProps({
  href: { type: String, default: '' },
  variant: { type: String, default: 'primary' }, // 'primary' ou 'secondary'
  external: { type: Boolean, default: false }
})
</script>

<template>
  <component
    :is="href ? 'a' : 'button'"
    :href="href"
    :target="external ? '_blank' : undefined"
    :rel="external ? 'noopener noreferrer' : undefined"
    :class="[
      'inline-flex items-center justify-center gap-2 min-h-11 rounded-full font-bold transition-all duration-250 cursor-pointer active:scale-97 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-or',
      variant === 'primary' 
        ? 'bg-or text-noir text-base px-7 py-3.5 shadow-[0_4px_20px_rgba(242,183,5,0.35)] hover:bg-or-deep hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(242,183,5,0.45)] active:translate-y-0' 
        : 'bg-creme text-foret border-2 border-foret text-base px-6 py-3 hover:bg-or hover:text-noir hover:border-or'
    ]"
  >
    <slot />
  </component>
</template>