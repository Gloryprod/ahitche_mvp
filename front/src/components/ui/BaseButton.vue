<!-- <template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :class="[
      'inline-flex items-center justify-center font-medium transition-colors duration-200 rounded-brand px-5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-offset-2',
      variant === 'primary' ? 'cursor-pointer bg-brand-primary text-white hover:bg-brand-dark focus:ring-brand-primary' : '',
      variant === 'accent' ? 'cursor-pointer bg-brand-accent text-white hover:bg-orange-600 focus:ring-brand-accent' : '',
      variant === 'secondary' ? 'cursor-pointer bg-white border border-gray-300 text-neutral-text hover:bg-gray-50 focus:ring-brand-primary' : '',
      (disabled || loading) ? 'opacity-50 cursor-not-allowed' : ''
    ]"
    @click="$emit('click')"
  >
    <svg v-if="loading" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    <slot />
  </button>
</template>

<script setup lang="ts">
    import type { PropType } from 'vue';

    defineProps({
    variant: { type: String, default: 'primary' },
    type: { type: String as PropType<'button' | 'submit' | 'reset'>, default: 'button' },
    disabled: { type: Boolean, default: false },
    loading: { type: Boolean, default: false }
    });
    
    defineEmits(['click']);
</script> -->

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
    :rel="external ? 'noopener' : undefined"
    :class="[
      'inline-flex items-center justify-center gap-2 rounded-full font-bold transition-all duration-250 cursor-pointer',
      variant === 'primary' 
        ? 'bg-or text-foret text-base px-7 py-3.5 shadow-[0_4px_20px_rgba(242,183,5,0.35)] hover:bg-or-deep hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(242,183,5,0.45)] active:translate-y-0' 
        : 'bg-creme text-foret border-2 border-foret text-base px-6 py-3 hover:bg-or hover:text-white'
    ]"
  >
    <slot />
  </component>
</template>