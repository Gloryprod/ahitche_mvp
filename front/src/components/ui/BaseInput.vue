<template>
  <div class="w-full mb-4">
    <label v-if="label" class="block text-sm font-medium text-brand-dark mb-1">
      {{ label }} <span v-if="required" class="text-red-500">*</span>
    </label>
    <input
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :required="required"
      class="w-full px-3 py-2 border border-gray-300 rounded-brand shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary transition-all duration-200"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement)?.value)"
    />
  </div>
</template>

<script setup lang="ts">
defineProps({
  label: String,
  modelValue: [String, Number],
  placeholder: String,
  type: { type: String, default: 'text' },
  required: { type: Boolean, default: false }
});
defineEmits(['update:modelValue']);
</script>