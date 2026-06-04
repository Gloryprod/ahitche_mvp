<!-- <template>
  <div class="about">
    <h1>This is an about page</h1>
  </div>
</template>

<style>
@media (min-width: 1024px) {
  .about {
    min-height: 100vh;
    display: flex;
    align-items: center;
  }
}
</style> -->


<template>
  <div class="max-w-md mx-auto p-6 bg-white rounded-brand shadow-md">
    <h2 class="text-xl font-bold text-brand-dark mb-6">Passer une commande AHICTHE</h2>
    
    <form @submit.prevent="handleSubmit">
      <BaseInput label="Votre Nom Complet" v-model="form.name" placeholder="Ex: Jean KPODÉ" required />
      <BaseInput label="Numéro WhatsApp" v-model="form.phone" placeholder="Ex: +229 90 00 00 00" type="tel" required />
      <BaseInput label="Détails du ravitaillement" v-model="form.details" placeholder="Ex: 5kg de riz, 2L d'huile..." required />
      
      <div class="mt-6 flex justify-end">
        <BaseButton type="submit" variant="accent" :loading="isSubmitting">
          Envoyer ma commande
        </BaseButton>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import BaseInput from '../components/ui/BaseInput.vue';
import BaseButton from '../components/ui/BaseButton.vue';

const form = ref({ name: '', phone: '', details: '' });
const isSubmitting = ref(false);

const handleSubmit = () => {
  isSubmitting.value = true;
  // Logique d'envoi vers l'API Express...
};
</script>